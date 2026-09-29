import { normalizeMongo } from "@/lib/tools/mongodb-query";

/**
 * Explains a MongoDB aggregation pipeline stage by stage and flags patterns
 * that are usually slow. Parsing reuses the relaxed shell-syntax parser from
 * the query formatter (unquoted keys, single quotes, ObjectId(), ISODate()…).
 */

export const AGGREGATION_LIMITS = { maxChars: 200_000, maxStages: 200 } as const;

export interface StageExplanation {
  index: number;
  operator: string;
  summary: string;
  /** Fields referenced by the stage */
  details: string[];
  tone: "info" | "warning";
}

export interface PipelineHint {
  /** Zero-based stage index, or null for pipeline-wide notes */
  stage: number | null;
  level: "warning" | "info";
  message: string;
}

export interface AggregationResult {
  ok: true;
  stages: StageExplanation[];
  hints: PipelineHint[];
  fieldsUsed: string[];
  stageCount: number;
  formatted: string;
  collection?: string;
}

export interface AggregationError {
  ok: false;
  error: string;
  position?: number;
}

type J = null | boolean | number | string | J[] | { [k: string]: J };
type Obj = { [k: string]: J };

function isObj(v: J): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const WRAPPERS = new Set(["$oid", "$date", "$numberLong", "$numberInt", "$numberDecimal", "$regularExpression", "$uuid", "$timestamp"]);

/** Extended-JSON wrapper produced by the shared parser (ObjectId, ISODate, NumberLong…). */
function wrapper(v: J): string | null {
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== 1 || !WRAPPERS.has(keys[0])) return null;
  const a = v[keys[0]];
  switch (keys[0]) {
    case "$oid":
      return `ObjectId(${JSON.stringify(a)})`;
    case "$date":
      return `ISODate(${JSON.stringify(a)})`;
    case "$numberLong":
      return `NumberLong(${String(a)})`;
    case "$numberInt":
      return `NumberInt(${String(a)})`;
    case "$numberDecimal":
      return `NumberDecimal(${JSON.stringify(a)})`;
    case "$regularExpression": {
      const r = isObj(a) ? a : {};
      return `/${String(r.pattern ?? "")}/${String(r.options ?? "")}`;
    }
    case "$uuid":
      return `UUID(${JSON.stringify(a)})`;
    default:
      return `Timestamp(${isObj(a) ? `${String(a.t)}, ${String(a.i)}` : String(a)})`;
  }
}

function clip(s: string, n = 48): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Short human-readable rendering of a value for summaries. */
function fmt(v: J, depth = 0): string {
  const w = wrapper(v);
  if (w) return w;
  if (v === null) return "null";
  if (typeof v === "string") return v.startsWith("$") ? v : `'${clip(v)}'`;
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) {
    const items = v.slice(0, 4).map((x) => fmt(x, depth + 1));
    return `[${items.join(", ")}${v.length > 4 ? `, … ${v.length} items` : ""}]`;
  }
  const keys = Object.keys(v);
  if (!keys.length) return "{}";
  if (depth > 1) return "{…}";
  const parts = keys.slice(0, 3).map((k) => `${k}: ${fmt(v[k], depth + 1)}`);
  return `{ ${parts.join(", ")}${keys.length > 3 ? ", …" : ""} }`;
}

/** All `$path` references inside a value (not `$$variables`). */
function pathRefs(v: J, out: Set<string>) {
  if (typeof v === "string") {
    if (v.startsWith("$") && !v.startsWith("$$") && v.length > 1) out.add(v.slice(1));
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) pathRefs(x, out);
    return;
  }
  if (isObj(v) && !wrapper(v)) for (const k of Object.keys(v)) pathRefs(v[k], out);
}

function containsKey(v: J, keys: Set<string>): string | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      const f = containsKey(x, keys);
      if (f) return f;
    }
    return null;
  }
  if (isObj(v)) {
    for (const k of Object.keys(v)) {
      if (keys.has(k)) return k;
      const f = containsKey(v[k], keys);
      if (f) return f;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// $match description
// ---------------------------------------------------------------------------

const OP_WORDS: Record<string, string> = {
  $eq: "equals",
  $ne: "is not",
  $gt: "is greater than",
  $gte: "is at least",
  $lt: "is less than",
  $lte: "is at most",
  $in: "is one of",
  $nin: "is not one of",
  $all: "contains all of",
  $size: "has length",
  $type: "has BSON type",
  $mod: "modulo matches",
  $geoWithin: "is geographically within",
  $geoIntersects: "geographically intersects",
  $near: "is near",
  $nearSphere: "is near (sphere)",
  $bitsAllSet: "has bits set",
};

function describeCondition(field: string, v: J): string {
  if (!isObj(v) || wrapper(v)) return `${field} equals ${fmt(v)}`;
  const keys = Object.keys(v);
  if (!keys.some((k) => k.startsWith("$"))) return `${field} equals ${fmt(v)}`;
  const parts: string[] = [];
  for (const op of keys) {
    const a = v[op];
    switch (op) {
      case "$exists":
        parts.push(`${field} ${a ? "exists" : "does not exist"}`);
        break;
      case "$regex": {
        const w = wrapper(a);
        parts.push(`${field} matches ${w ?? `/${String(a)}/${String(v.$options ?? "")}`}`);
        break;
      }
      case "$options":
        break;
      case "$elemMatch":
        parts.push(`${field} has an element where ${describeFilter(a)}`);
        break;
      case "$not":
        parts.push(`not (${describeCondition(field, a)})`);
        break;
      default:
        parts.push(`${field} ${OP_WORDS[op] ?? op} ${fmt(a)}`);
    }
  }
  return parts.join(" and ");
}

function describeFilter(filter: J): string {
  if (!isObj(filter)) return fmt(filter);
  const parts: string[] = [];
  for (const k of Object.keys(filter)) {
    const v = filter[k];
    if (k === "$and" || k === "$or" || k === "$nor") {
      const subs = Array.isArray(v) ? v.map(describeFilter) : [describeFilter(v)];
      const word = k === "$and" ? " and " : k === "$or" ? " or " : " nor ";
      parts.push(`${k === "$nor" ? "none of " : ""}(${subs.join(word)})`);
    } else if (k === "$expr") parts.push(`expression ${fmt(v)} is true`);
    else if (k === "$text") parts.push(`text search for ${fmt(isObj(v) ? v.$search ?? null : v)}`);
    else if (k === "$where") parts.push("JavaScript $where returns true");
    else if (k === "$jsonSchema") parts.push("matches a JSON schema");
    else if (k === "$comment") continue;
    else parts.push(describeCondition(k, v));
  }
  return parts.join(" and ") || "everything";
}

function matchFields(filter: J, out: Set<string>) {
  if (!isObj(filter)) return;
  for (const k of Object.keys(filter)) {
    const v = filter[k];
    if (k === "$and" || k === "$or" || k === "$nor") {
      if (Array.isArray(v)) for (const x of v) matchFields(x, out);
    } else if (k.startsWith("$")) pathRefs(v, out);
    else out.add(k);
  }
}

// ---------------------------------------------------------------------------
// Per-stage explanation
// ---------------------------------------------------------------------------

interface StageInfo extends StageExplanation {
  spec: J;
  /** Fields this stage creates (lookup `as`, computed fields…) */
  produces: Set<string>;
  /** Fields explicitly removed, or null */
  removes: Set<string>;
  /** Inclusion projection: only these fields survive (null = not an inclusion projection) */
  keeps: Set<string> | null;
  /** True when the stage reshapes documents so field names before it no longer apply */
  reshapes: boolean;
}

function explainStage(index: number, operator: string, spec: J): StageInfo {
  const fields = new Set<string>();
  const produces = new Set<string>();
  const removes = new Set<string>();
  let keeps: Set<string> | null = null;
  let reshapes = false;
  let summary: string;
  let tone: StageExplanation["tone"] = "info";
  const obj = isObj(spec) ? spec : {};
  switch (operator) {
    case "$match":
      matchFields(spec, fields);
      summary = `keep documents where ${describeFilter(spec)}`;
      break;
    case "$project": {
      const inc: string[] = [];
      const exc: string[] = [];
      const computed: string[] = [];
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v === 1 || v === true) inc.push(k);
        else if (v === 0 || v === false) exc.push(k);
        else {
          computed.push(k);
          pathRefs(v, fields);
        }
        fields.add(k);
      }
      if (inc.length || computed.length) {
        keeps = new Set([...inc, ...computed, ...(exc.includes("_id") ? [] : ["_id"])]);
        for (const c of computed) produces.add(c);
      }
      for (const e of exc) if (!(inc.length || computed.length) || e === "_id") removes.add(e);
      const bits = [inc.length ? `keep ${inc.join(", ")}` : "", computed.length ? `compute ${computed.join(", ")}` : "", exc.length ? `drop ${exc.join(", ")}` : ""].filter(Boolean);
      summary = bits.length ? bits.join("; ") : "empty projection";
      reshapes = !!keeps;
      break;
    }
    case "$addFields":
    case "$set":
      for (const k of Object.keys(obj)) {
        produces.add(k);
        fields.add(k);
        pathRefs(obj[k], fields);
      }
      summary = `add or overwrite ${Object.keys(obj)
        .map((k) => `${k} = ${fmt(obj[k])}`)
        .join(", ")}`;
      break;
    case "$unset": {
      const names = Array.isArray(spec) ? spec.map(String) : [String(spec)];
      for (const n of names) {
        removes.add(n);
        fields.add(n);
      }
      summary = `remove ${names.join(", ")}`;
      break;
    }
    case "$group": {
      const id = obj._id;
      let by: string;
      if (id === null || id === undefined) by = "group every document into one (_id: null)";
      else if (typeof id === "string") by = `group by ${id}`;
      else by = `group by ${fmt(id)}`;
      pathRefs(id ?? null, fields);
      const accs: string[] = [];
      for (const k of Object.keys(obj)) {
        if (k === "_id") continue;
        const v = obj[k];
        produces.add(k);
        pathRefs(v, fields);
        if (isObj(v)) {
          const op = Object.keys(v)[0] ?? "";
          const arg = v[op];
          const word: Record<string, string> = { $sum: "sum of", $avg: "average of", $min: "minimum of", $max: "maximum of", $first: "first", $last: "last", $push: "list of", $addToSet: "set of", $count: "count", $stdDevPop: "std dev of", $stdDevSamp: "sample std dev of", $mergeObjects: "merged", $top: "top", $bottom: "bottom", $firstN: "first N", $lastN: "last N", $maxN: "max N", $minN: "min N" };
          accs.push(op === "$sum" && arg === 1 ? `${k} = number of documents` : `${k} = ${word[op] ?? op} ${fmt(arg ?? null)}`);
        } else accs.push(`${k} = ${fmt(v)}`);
      }
      summary = accs.length ? `${by}; ${accs.join(", ")}` : by;
      reshapes = true;
      break;
    }
    case "$sort": {
      const parts = Object.keys(obj).map((k) => {
        fields.add(k);
        const v = obj[k];
        return `${k} ${v === -1 ? "descending" : v === 1 ? "ascending" : isObj(v) && "$meta" in v ? `by ${fmt(v)}` : fmt(v)}`;
      });
      summary = `sort by ${parts.join(", then ")}`;
      break;
    }
    case "$limit":
      summary = `keep only the first ${fmt(spec)} documents`;
      break;
    case "$skip":
      summary = `skip the first ${fmt(spec)} documents`;
      break;
    case "$lookup": {
      const from = String(obj.from ?? "?");
      const as = String(obj.as ?? "?");
      produces.add(as);
      fields.add(as);
      if (obj.localField !== undefined) {
        fields.add(String(obj.localField));
        summary = `join collection '${from}' where local ${String(obj.localField)} = foreign ${String(obj.foreignField ?? "_id")}, results as array '${as}'`;
      } else {
        const n = Array.isArray(obj.pipeline) ? obj.pipeline.length : 0;
        pathRefs(obj.let ?? null, fields);
        summary = `join collection '${from}' with a ${n}-stage sub-pipeline${isObj(obj.let) ? ` (let: ${Object.keys(obj.let).join(", ")})` : ""}, results as array '${as}'`;
      }
      break;
    }
    case "$unwind": {
      const path = typeof spec === "string" ? spec : String(obj.path ?? "");
      if (path.startsWith("$")) fields.add(path.slice(1));
      const keep = isObj(spec) && spec.preserveNullAndEmptyArrays === true;
      summary = `output one document per element of ${path}${keep ? " (keeping documents where it is missing or empty)" : " (documents with a missing or empty array are dropped)"}`;
      break;
    }
    case "$count":
      summary = `replace everything with one document { ${String(spec)}: <number of documents> }`;
      reshapes = true;
      produces.add(String(spec));
      break;
    case "$facet":
      summary = `run ${Object.keys(obj).length} sub-pipelines over the same input in parallel: ${Object.keys(obj).join(", ")}`;
      for (const k of Object.keys(obj)) produces.add(k);
      reshapes = true;
      break;
    case "$out":
      summary = `write the results to collection ${typeof spec === "string" ? `'${spec}'` : fmt(spec)} (replacing it)`;
      tone = "warning";
      break;
    case "$merge":
      summary = `merge the results into collection ${fmt(isObj(spec) ? spec.into ?? null : spec)}${isObj(spec) && spec.whenMatched ? ` (whenMatched: ${fmt(spec.whenMatched)})` : ""}`;
      tone = "warning";
      break;
    case "$replaceRoot":
    case "$replaceWith": {
      const root = operator === "$replaceRoot" ? obj.newRoot ?? null : spec;
      pathRefs(root, fields);
      summary = `promote ${fmt(root)} to be the document`;
      reshapes = true;
      break;
    }
    case "$sample":
      summary = `pick ${fmt(obj.size ?? null)} random documents`;
      break;
    case "$sortByCount":
      pathRefs(spec, fields);
      summary = `count documents per distinct ${fmt(spec)}, most frequent first`;
      reshapes = true;
      break;
    case "$bucket":
    case "$bucketAuto":
      pathRefs(obj.groupBy ?? null, fields);
      summary = `put documents into ${operator === "$bucket" ? "the given" : `${fmt(obj.buckets ?? null)} automatic`} buckets by ${fmt(obj.groupBy ?? null)}`;
      reshapes = true;
      break;
    case "$graphLookup":
      pathRefs(obj.startWith ?? null, fields);
      summary = `recursively look up '${String(obj.from ?? "?")}' following ${String(obj.connectFromField ?? "?")} → ${String(obj.connectToField ?? "?")}, results as '${String(obj.as ?? "?")}'`;
      produces.add(String(obj.as ?? ""));
      break;
    case "$unionWith":
      summary = `append documents from collection '${typeof spec === "string" ? spec : String(obj.coll ?? "?")}'`;
      break;
    case "$geoNear":
      summary = `sort by distance from ${fmt(obj.near ?? null)}, distance in '${String(obj.distanceField ?? "?")}'`;
      produces.add(String(obj.distanceField ?? ""));
      break;
    case "$setWindowFields":
      pathRefs(obj.partitionBy ?? null, fields);
      summary = `compute window functions${isObj(obj.output) ? ` (${Object.keys(obj.output).join(", ")})` : ""}${obj.partitionBy !== undefined ? ` partitioned by ${fmt(obj.partitionBy)}` : ""}`;
      if (isObj(obj.output)) for (const k of Object.keys(obj.output)) produces.add(k);
      break;
    case "$search":
    case "$searchMeta":
    case "$vectorSearch":
      summary = `Atlas ${operator.slice(1)} query${isObj(obj.index) || typeof obj.index === "string" ? ` on index ${fmt(obj.index)}` : ""}`;
      break;
    case "$redact":
      summary = "conditionally prune sub-documents";
      break;
    case "$densify":
    case "$fill":
      summary = `${operator === "$densify" ? "fill gaps in" : "fill missing values of"} ${fmt(obj.field ?? obj.output ?? null)}`;
      break;
    case "$documents":
      summary = `start from ${Array.isArray(spec) ? spec.length : "literal"} inline documents`;
      reshapes = true;
      break;
    case "$indexStats":
    case "$collStats":
    case "$planCacheStats":
      summary = `return ${operator.slice(1)} for the collection`;
      reshapes = true;
      break;
    case "$changeStream":
      summary = "open a change stream";
      break;
    default:
      summary = `${operator} stage (no explanation available)`;
      pathRefs(spec, fields);
      tone = "warning";
  }
  const details = [...fields].filter(Boolean).sort();
  return { index, operator, summary: `${operator} — ${summary}`, details, tone, spec, produces, removes, keeps, reshapes };
}

// ---------------------------------------------------------------------------
// Pipeline-level hints
// ---------------------------------------------------------------------------

function rootOf(field: string): string {
  return field.split(".")[0];
}

function analyse(stages: StageInfo[]): PipelineHint[] {
  const hints: PipelineHint[] = [];
  const ops = stages.map((s) => s.operator);
  const warn = (stage: number | null, message: string) => hints.push({ stage, level: "warning", message });
  const info = (stage: number | null, message: string) => hints.push({ stage, level: "info", message });
  const label = (i: number) => `Stage ${i + 1} ${stages[i].operator}`;

  // $match placement
  const firstMatch = ops.indexOf("$match");
  stages.forEach((s, i) => {
    if (s.operator !== "$match" || i === 0) return;
    const prev = stages.slice(0, i);
    const used = new Set(s.details.map(rootOf));
    const produced = new Set(prev.flatMap((p) => [...p.produces].map(rootOf)));
    const dependsOnPrev = [...used].some((f) => produced.has(f)) || prev.some((p) => p.reshapes);
    const onlyMovable = prev.every((p) => ["$lookup", "$unwind", "$sort", "$project", "$addFields", "$set", "$unset", "$geoNear"].includes(p.operator));
    if (!dependsOnPrev && onlyMovable) {
      const blockers = [...new Set(prev.map((p) => p.operator))].join("/");
      warn(i, `${label(i)} only filters on ${[...used].join(", ") || "fields"} that already exist before ${blockers}. Move it to the front so it runs on fewer documents and can use an index.`);
    } else if (i === firstMatch) {
      info(i, `The first $match is stage ${i + 1}. Earlier stages produce the fields it filters on, so it cannot use a collection index; only a leading $match can.`);
    }
  });
  if (firstMatch < 0) info(null, "No $match stage: the pipeline scans the whole collection.");

  stages.forEach((s, i) => {
    const next = stages[i + 1];
    switch (s.operator) {
      case "$match": {
        const neg = containsKey(s.spec, new Set(["$ne", "$nin", "$not"]));
        if (neg) info(i, `${label(i)} uses ${neg}. Negations match most of the collection and use indexes poorly.`);
        const re = findUnanchoredRegex(s.spec);
        if (re) info(i, `${label(i)} has a regular expression that does not start with ^ (${re}); only prefix-anchored, case-sensitive regexes can use an index.`);
        break;
      }
      case "$lookup": {
        const as = isObj(s.spec) ? String(s.spec.as ?? "") : "";
        if (isObj(s.spec) && s.spec.localField === undefined) {
          info(i, `${label(i)} uses the pipeline form. Its sub-pipeline should start with a $match; only an equality $expr on the foreign field can use an index there (MongoDB 5.0+).`);
        }
        const unwound = stages.slice(i + 1).some((t) => t.operator === "$unwind" && (typeof t.spec === "string" ? t.spec : isObj(t.spec) ? String(t.spec.path ?? "") : "") === `$${as}`);
        if (as && !unwound) info(i, `${label(i)} produces the array field '${as}'. If each document matches at most one foreign document, add { $unwind: "$${as}" } to flatten it.`);
        const foreign = isObj(s.spec) && s.spec.foreignField !== undefined ? String(s.spec.foreignField) : null;
        if (foreign && foreign !== "_id") info(i, `${label(i)} joins on '${String(s.spec && isObj(s.spec) ? s.spec.from : "")}.${foreign}'; make sure that field is indexed, otherwise every input document triggers a collection scan.`);
        break;
      }
      case "$sort": {
        const matchBefore = stages.slice(0, i).some((t) => t.operator === "$match");
        if (!matchBefore) warn(i, `${label(i)} runs before any $match, so it sorts every document. Without an index on the sort key it hits the 100 MB memory limit unless allowDiskUse is set.`);
        if (next?.operator === "$limit") info(i, `${label(i)} is followed by $limit: MongoDB combines them into a top-k sort that keeps only ${fmt(next.spec)} documents in memory.`);
        break;
      }
      case "$group":
        if (isObj(s.spec) && (s.spec._id === null || s.spec._id === undefined)) info(i, `${label(i)} groups on _id: null, producing a single document. That is fine for totals, but every document reaching this stage is accumulated in memory.`);
        break;
      case "$skip":
        if (!stages.slice(0, i).some((t) => t.operator === "$sort")) warn(i, `${label(i)} has no $sort before it. Without an explicit order, pagination can repeat or miss documents between calls.`);
        break;
      case "$facet":
        info(i, `${label(i)} runs its sub-pipelines in memory over the same input and returns one document; each facet output is capped by the 16 MB document limit.`);
        break;
      case "$out":
      case "$merge":
        warn(i, `${label(i)} writes to a collection. Running this pipeline modifies data${s.operator === "$out" ? " and replaces the target collection" : ""}.`);
        if (i !== stages.length - 1) warn(i, `${label(i)} must be the last stage of the pipeline.`);
        break;
      default:
        break;
    }
    const js = containsKey(s.spec, new Set(["$where", "$function", "$accumulator"]));
    if (js) warn(i, `${label(i)} uses ${js}, which runs JavaScript on the server: slow, single-threaded and unable to use indexes. Prefer $expr and native operators.`);
  });

  // Fields removed/kept by $project / $unset and used later
  stages.forEach((s, i) => {
    if (!s.removes.size && !s.keeps) return;
    for (let j = i + 1; j < stages.length; j++) {
      const t = stages[j];
      const usedRoots = t.details.map(rootOf);
      const gone = usedRoots.filter((f) => s.removes.has(f) || (s.keeps && !s.keeps.has(f) && !stages.slice(i + 1, j).some((m) => m.produces.has(f))));
      if (gone.length) {
        warn(i, `${label(i)} ${s.keeps ? "keeps only some fields" : `removes ${[...s.removes].join(", ")}`}, but ${label(j).toLowerCase()} still uses ${[...new Set(gone)].join(", ")}. Move the projection after it (or filter first) so those fields are still present.`);
        break;
      }
      if (t.reshapes) break;
    }
  });

  return hints;
}

function findUnanchoredRegex(v: J): string | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      const f = findUnanchoredRegex(x);
      if (f) return f;
    }
    return null;
  }
  if (!isObj(v)) return null;
  const w = wrapper(v);
  if (w) return w.startsWith("/") && !w.startsWith("/^") ? w : null;
  for (const k of Object.keys(v)) {
    if (k === "$regex") {
      const inner = v[k];
      const iw = wrapper(inner);
      const pattern = iw ? iw.slice(1, iw.lastIndexOf("/")) : String(inner);
      return pattern.startsWith("^") ? null : `/${pattern}/`;
    }
    const f = findUnanchoredRegex(v[k]);
    if (f) return f;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const SIMPLE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function toShell(v: J, depth = 0): string {
  const w = wrapper(v);
  if (w) return w;
  const pad = "  ".repeat(depth);
  const padIn = "  ".repeat(depth + 1);
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    const simple = v.every((x) => x === null || typeof x !== "object") && v.length <= 8;
    if (simple) return `[${v.map((x) => toShell(x)).join(", ")}]`;
    return `[\n${v.map((x) => padIn + toShell(x, depth + 1)).join(",\n")}\n${pad}]`;
  }
  if (isObj(v)) {
    const entries = Object.keys(v);
    if (!entries.length) return "{}";
    const body = entries.map((k) => `${padIn}${SIMPLE_KEY.test(k) ? k : JSON.stringify(k)}: ${toShell(v[k], depth + 1)}`);
    return `{\n${body.join(",\n")}\n${pad}}`;
  }
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

export function formatPipeline(stages: J[]): string {
  return `[\n${stages.map((s) => `  ${toShell(s, 1)}`).join(",\n")}\n]`;
}

// ---------------------------------------------------------------------------

/** Parse relaxed shell syntax and explain the pipeline. Never throws. */
export function explainPipeline(input: string): AggregationResult | AggregationError {
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste an aggregation pipeline." };
  if (text.length > AGGREGATION_LIMITS.maxChars) return { ok: false, error: `Input is too large (${Math.round(text.length / 1000)} KB); the limit is ${AGGREGATION_LIMITS.maxChars / 1000} KB.` };
  const norm = normalizeMongo(text);
  if (!norm.ok) return { ok: false, error: norm.error ?? "Could not parse the pipeline.", position: norm.position };
  if (norm.kind === "find") return { ok: false, error: "This is a find() query. Paste an aggregation pipeline: an array of { $stage: … } objects or db.collection.aggregate([...])." };
  let parsed: J;
  try {
    parsed = JSON.parse(norm.json) as J;
  } catch {
    return { ok: false, error: "Could not parse the pipeline." };
  }
  let pipeline: J = norm.collection !== undefined && Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
  if (isObj(pipeline) && Object.keys(pipeline).length === 1 && Object.keys(pipeline)[0].startsWith("$")) pipeline = [pipeline];
  if (!Array.isArray(pipeline)) return { ok: false, error: "A pipeline is an array of stages, e.g. [{ $match: { … } }, { $group: { … } }]." };
  if (!pipeline.length) return { ok: false, error: "The pipeline is empty." };
  if (pipeline.length > AGGREGATION_LIMITS.maxStages) return { ok: false, error: `Pipelines with more than ${AGGREGATION_LIMITS.maxStages} stages are not supported.` };

  const stages: StageInfo[] = [];
  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];
    if (!isObj(stage) || Object.keys(stage).length !== 1 || !Object.keys(stage)[0].startsWith("$")) {
      return { ok: false, error: `Stage ${i + 1} must be an object with exactly one $operator key, for example { $match: { … } }.` };
    }
    const operator = Object.keys(stage)[0];
    stages.push(explainStage(i, operator, stage[operator]));
  }
  const hints = analyse(stages);
  const fieldsUsed = [...new Set(stages.flatMap((s) => s.details))].sort();
  return {
    ok: true,
    stages: stages.map(({ index, operator, summary, details, tone }) => ({ index, operator, summary, details, tone })),
    hints,
    fieldsUsed,
    stageCount: stages.length,
    formatted: formatPipeline(pipeline),
    collection: norm.collection,
  };
}

export const AGGREGATION_SAMPLE = `db.orders.aggregate([
  { $match: { status: 'paid', createdAt: { $gte: ISODate("2026-01-01") } } },
  { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "customer" } },
  { $unwind: "$customer" },
  { $group: { _id: "$customer.country", revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
  { $sort: { revenue: -1 } },
  { $limit: 10 },
])`;

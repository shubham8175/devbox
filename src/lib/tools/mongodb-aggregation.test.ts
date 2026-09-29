import { describe, expect, it } from "vitest";
import { AGGREGATION_LIMITS, AGGREGATION_SAMPLE, explainPipeline, formatPipeline, type AggregationResult } from "@/lib/tools/mongodb-aggregation";

function ok(src: string): AggregationResult {
  const r = explainPipeline(src);
  if (!r.ok) throw new Error(r.error);
  return r;
}

const messages = (r: AggregationResult) => r.hints.map((h) => h.message);

describe("explainPipeline: stages", () => {
  it("explains the sample pipeline stage by stage", () => {
    const r = ok(AGGREGATION_SAMPLE);
    expect(r.collection).toBe("orders");
    expect(r.stageCount).toBe(6);
    expect(r.stages.map((s) => s.operator)).toEqual(["$match", "$lookup", "$unwind", "$group", "$sort", "$limit"]);
    expect(r.stages[0].summary).toBe(`$match — keep documents where status equals 'paid' and createdAt is at least ISODate("2026-01-01")`);
    expect(r.stages[0].details).toEqual(["createdAt", "status"]);
    expect(r.stages[1].summary).toBe("$lookup — join collection 'customers' where local customerId = foreign _id, results as array 'customer'");
    expect(r.stages[2].summary).toMatch(/^\$unwind — output one document per element of \$customer \(documents with a missing or empty array are dropped\)/);
    expect(r.stages[3].summary).toBe("$group — group by $customer.country; revenue = sum of $total, orders = number of documents");
    expect(r.stages[4].summary).toBe("$sort — sort by revenue descending");
    expect(r.stages[5].summary).toBe("$limit — keep only the first 10 documents");
    expect(r.fieldsUsed).toEqual(["createdAt", "customer", "customer.country", "customerId", "revenue", "status", "total"]);
    expect(r.stages.every((s) => s.tone === "info")).toBe(true);
  });

  it("describes comparison, array and logical operators in plain English", () => {
    const r = ok(`[{ $match: { $or: [{ age: { $gte: 18, $lt: 65 } }, { role: { $in: ['admin', 'staff'] } }], tags: { $exists: true }, name: { $regex: '^A', $options: 'i' }, _id: ObjectId("507f1f77bcf86cd799439011") } }]`);
    expect(r.stages[0].summary).toBe(`$match — keep documents where (age is at least 18 and age is less than 65 or role is one of ['admin', 'staff']) and tags exists and name matches /^A/i and _id equals ObjectId("507f1f77bcf86cd799439011")`);
    expect(r.stages[0].details).toEqual(["_id", "age", "name", "role", "tags"]);
  });

  it("explains project, addFields, unset, count, facet, out and replaceRoot", () => {
    const r = ok(`[
      { $project: { _id: 0, name: 1, total: { $multiply: ["$price", "$qty"] } } },
      { $addFields: { year: { $year: "$createdAt" } } },
      { $unset: ["tmp", "debug"] },
      { $replaceRoot: { newRoot: "$payload" } },
      { $facet: { byYear: [{ $sortByCount: "$year" }], top: [{ $limit: 5 }] } },
      { $out: "report" }
    ]`);
    expect(r.stages[0].summary).toBe("$project — keep name; compute total; drop _id");
    expect(r.stages[0].details).toEqual(["_id", "name", "price", "qty", "total"]);
    expect(r.stages[1].summary).toBe("$addFields — add or overwrite year = { $year: $createdAt }");
    expect(r.stages[2].summary).toBe("$unset — remove tmp, debug");
    expect(r.stages[3].summary).toBe("$replaceRoot — promote $payload to be the document");
    expect(r.stages[4].summary).toBe("$facet — run 2 sub-pipelines over the same input in parallel: byYear, top");
    expect(r.stages[5]).toMatchObject({ summary: "$out — write the results to collection 'report' (replacing it)", tone: "warning" });
  });

  it("accepts a single stage object, a bare array with trailing commas, and unknown stages", () => {
    expect(ok(`{ $match: { a: 1 } }`).stageCount).toBe(1);
    expect(ok(`[{ $match: { a: 1 }, }, { $nonsense: 1 },]`).stages[1]).toMatchObject({ operator: "$nonsense", tone: "warning" });
  });
});

describe("explainPipeline: hints", () => {
  it("flags a $match that could move before $lookup/$unwind", () => {
    const r = ok(`[{ $lookup: { from: "u", localField: "uid", foreignField: "_id", as: "user" } }, { $unwind: "$user" }, { $match: { status: "active" } }]`);
    expect(messages(r)).toEqual(expect.arrayContaining([expect.stringMatching(/Stage 3 \$match only filters on status that already exist before \$lookup\/\$unwind\. Move it to the front/)]));
  });

  it("does not suggest moving a $match that depends on the joined field", () => {
    const r = ok(`[{ $lookup: { from: "u", localField: "uid", foreignField: "_id", as: "user" } }, { $unwind: "$user" }, { $match: { "user.active": true } }]`);
    expect(messages(r).some((m) => /Move it to the front/.test(m))).toBe(false);
    expect(messages(r)).toEqual(expect.arrayContaining([expect.stringMatching(/The first \$match is stage 3/)]));
  });

  it("notes a $match after $group cannot use an index and a pipeline with no $match", () => {
    const r = ok(`[{ $group: { _id: "$a", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]`);
    expect(messages(r)).toEqual(expect.arrayContaining([expect.stringMatching(/first \$match is stage 2/)]));
    expect(messages(ok(`[{ $group: { _id: null, n: { $sum: 1 } } }]`))).toEqual(expect.arrayContaining([expect.stringMatching(/No \$match stage/), expect.stringMatching(/groups on _id: null/)]));
  });

  it("flags $lookup without a following $unwind, pipeline-form lookups and non-_id foreign fields", () => {
    const a = ok(`[{ $match: { x: 1 } }, { $lookup: { from: "u", localField: "uid", foreignField: "uid", as: "user" } }]`);
    expect(messages(a)).toEqual(expect.arrayContaining([expect.stringMatching(/produces the array field 'user'/), expect.stringMatching(/joins on 'u.uid'; make sure that field is indexed/)]));
    const b = ok(`[{ $match: { x: 1 } }, { $lookup: { from: "u", let: { id: "$uid" }, pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$id"] } } }], as: "user" } }, { $unwind: "$user" }]`);
    expect(messages(b)).toEqual(expect.arrayContaining([expect.stringMatching(/pipeline form/)]));
    expect(messages(b).some((m) => /produces the array field/.test(m))).toBe(false);
  });

  it("warns about $sort without a $match and notes the $sort + $limit optimisation", () => {
    const r = ok(`[{ $sort: { createdAt: -1 } }, { $limit: 20 }]`);
    const m = messages(r);
    expect(m).toEqual(expect.arrayContaining([expect.stringMatching(/Stage 1 \$sort runs before any \$match/), expect.stringMatching(/top-k sort that keeps only 20 documents/)]));
    expect(r.hints.find((h) => /runs before any/.test(h.message))?.level).toBe("warning");
    expect(messages(ok(`[{ $match: { a: 1 } }, { $sort: { b: 1 } }]`)).some((x) => /runs before any/.test(x))).toBe(false);
  });

  it("warns when a projection removes a field a later stage uses", () => {
    const excl = ok(`[{ $match: { a: 1 } }, { $project: { email: 0 } }, { $sort: { email: 1 } }]`);
    expect(messages(excl)).toEqual(expect.arrayContaining([expect.stringMatching(/Stage 2 \$project removes email, but stage 3 \$sort still uses email/)]));
    const incl = ok(`[{ $match: { a: 1 } }, { $project: { name: 1 } }, { $group: { _id: "$country", n: { $sum: 1 } } }]`);
    expect(messages(incl)).toEqual(expect.arrayContaining([expect.stringMatching(/Stage 2 \$project keeps only some fields, but stage 3 \$group still uses country/)]));
    const unset = ok(`[{ $match: { a: 1 } }, { $unset: "tmp" }, { $addFields: { t2: "$tmp" } }]`);
    expect(messages(unset)).toEqual(expect.arrayContaining([expect.stringMatching(/Stage 2 \$unset removes tmp, but stage 3 \$addfields still uses tmp/)]));
    const fine = ok(`[{ $match: { a: 1 } }, { $project: { name: 1, country: 1 } }, { $group: { _id: "$country", n: { $sum: 1 } } }]`);
    expect(messages(fine).some((m) => /still uses/.test(m))).toBe(false);
  });

  it("flags $skip without $sort, $facet, $out/$merge placement and JavaScript execution", () => {
    const r = ok(`[{ $match: { $where: "this.a > 1" } }, { $skip: 10 }, { $facet: { a: [{ $count: "n" }] } }, { $merge: { into: "x" } }, { $limit: 1 }]`);
    const m = messages(r);
    expect(m).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Stage 1 \$match uses \$where, which runs JavaScript/),
        expect.stringMatching(/Stage 2 \$skip has no \$sort before it/),
        expect.stringMatching(/Stage 3 \$facet runs its sub-pipelines in memory/),
        expect.stringMatching(/Stage 4 \$merge writes to a collection/),
        expect.stringMatching(/Stage 4 \$merge must be the last stage/),
      ]),
    );
    expect(messages(ok(`[{ $addFields: { x: { $function: { body: "function() {}", args: [], lang: "js" } } } }]`))).toEqual(expect.arrayContaining([expect.stringMatching(/\$function, which runs JavaScript/)]));
  });

  it("notes negations and unanchored regexes in $match", () => {
    const m = messages(ok(`[{ $match: { status: { $ne: "x" }, name: /foo/i } }]`));
    expect(m).toEqual(expect.arrayContaining([expect.stringMatching(/uses \$ne/), expect.stringMatching(/does not start with \^ \(\/foo\/i\)/)]));
    expect(messages(ok(`[{ $match: { name: { $regex: "^foo" } } }]`)).some((x) => /does not start with/.test(x))).toBe(false);
  });
});

describe("explainPipeline: formatting and errors", () => {
  it("formats the pipeline in shell style with wrappers restored", () => {
    const r = ok(AGGREGATION_SAMPLE);
    expect(r.formatted.startsWith("[\n  {\n    $match: {\n")).toBe(true);
    expect(r.formatted).toContain('createdAt: {\n        $gte: ISODate("2026-01-01")');
    expect(r.formatted).toContain('$unwind: "$customer"');
    expect(r.formatted.endsWith("\n]")).toBe(true);
    expect(formatPipeline([{ $limit: 1 }])).toBe("[\n  {\n    $limit: 1\n  }\n]");
  });

  it("rejects find queries, empty input, non-array pipelines, malformed stages and oversized input", () => {
    expect(explainPipeline("")).toMatchObject({ ok: false });
    expect(explainPipeline("db.users.find({ a: 1 })")).toMatchObject({ ok: false, error: expect.stringMatching(/find\(\) query/) });
    expect(explainPipeline("42")).toMatchObject({ ok: false, error: expect.stringMatching(/array of stages/) });
    expect(explainPipeline("[]")).toMatchObject({ ok: false, error: "The pipeline is empty." });
    expect(explainPipeline("[{ $match: { a: 1 }, $limit: 2 }]")).toMatchObject({ ok: false, error: expect.stringMatching(/Stage 1 must be an object with exactly one/) });
    expect(explainPipeline("[{ a: 1 }]")).toMatchObject({ ok: false });
    expect(explainPipeline("[{ $match: { a: 1 }")).toMatchObject({ ok: false });
    expect(explainPipeline("[" + "1,".repeat(AGGREGATION_LIMITS.maxChars) + "]")).toMatchObject({ ok: false, error: expect.stringMatching(/too large/) });
    const many = "[" + Array.from({ length: AGGREGATION_LIMITS.maxStages + 1 }, () => "{ $limit: 1 }").join(",") + "]";
    expect(explainPipeline(many)).toMatchObject({ ok: false, error: expect.stringMatching(/more than 200 stages/) });
  });

  it("never throws on hostile input", () => {
    for (const src of ["[{ __proto__: { $match: 1 } }]", "[{ $match: { __proto__: { a: 1 } } }]", "[[[[[[]]]]]]", "[{ $group: { _id: { $oid: 1 } } }]", "[{ $unwind: 5 }, { $lookup: 'x' }, { $project: 7 }]"]) {
      expect(() => explainPipeline(src)).not.toThrow();
    }
  });
});

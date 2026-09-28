export type LineOp = "equal" | "insert" | "delete";

export interface LineDiff {
  op: LineOp;
  text: string;
  /** 1-based line numbers in each side, when present */
  a?: number;
  b?: number;
}

export interface Segment {
  text: string;
  op: LineOp;
}

/** Myers-style LCS diff on arrays of lines (O(N·M) DP, capped for very large inputs). */
export function diffSequences<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): Array<{ op: LineOp; ai: number; bi: number }> {
  const n = a.length;
  const m = b.length;
  // Trim common prefix/suffix for speed
  let start = 0;
  while (start < n && start < m && eq(a[start], b[start])) start++;
  let endA = n;
  let endB = m;
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) {
    endA--;
    endB--;
  }
  const ops: Array<{ op: LineOp; ai: number; bi: number }> = [];
  for (let i = 0; i < start; i++) ops.push({ op: "equal", ai: i, bi: i });

  const subA = a.slice(start, endA);
  const subB = b.slice(start, endB);
  const N = subA.length;
  const M = subB.length;
  if (N * M > 4_000_000) {
    // Too large for DP: fall back to delete-all / insert-all in the middle.
    for (let i = 0; i < N; i++) ops.push({ op: "delete", ai: start + i, bi: -1 });
    for (let j = 0; j < M; j++) ops.push({ op: "insert", ai: -1, bi: start + j });
  } else if (N || M) {
    const dp: Uint32Array[] = Array.from({ length: N + 1 }, () => new Uint32Array(M + 1));
    for (let i = N - 1; i >= 0; i--) {
      for (let j = M - 1; j >= 0; j--) {
        dp[i][j] = eq(subA[i], subB[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < N && j < M) {
      if (eq(subA[i], subB[j])) {
        ops.push({ op: "equal", ai: start + i, bi: start + j });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ op: "delete", ai: start + i, bi: -1 });
        i++;
      } else {
        ops.push({ op: "insert", ai: -1, bi: start + j });
        j++;
      }
    }
    while (i < N) ops.push({ op: "delete", ai: start + i++, bi: -1 });
    while (j < M) ops.push({ op: "insert", ai: -1, bi: start + j++ });
  }
  for (let k = 0; k < n - endA; k++) ops.push({ op: "equal", ai: endA + k, bi: endB + k });
  return ops;
}

export function diffLines(textA: string, textB: string): LineDiff[] {
  const a = textA.split("\n");
  const b = textB.split("\n");
  return diffSequences(a, b).map((o) => ({
    op: o.op,
    text: o.op === "insert" ? b[o.bi] : a[o.ai],
    a: o.ai >= 0 ? o.ai + 1 : undefined,
    b: o.bi >= 0 ? o.bi + 1 : undefined,
  }));
}

/** Word-level segments for a changed line pair, used for inline highlighting. */
export function diffWords(a: string, b: string): { a: Segment[]; b: Segment[] } {
  const tok = (s: string) => s.split(/(\s+|[^\w\s]+)/).filter((x) => x !== "");
  const ta = tok(a);
  const tb = tok(b);
  const ops = diffSequences(ta, tb);
  const segA: Segment[] = [];
  const segB: Segment[] = [];
  for (const o of ops) {
    if (o.op === "equal") {
      segA.push({ text: ta[o.ai], op: "equal" });
      segB.push({ text: tb[o.bi], op: "equal" });
    } else if (o.op === "delete") segA.push({ text: ta[o.ai], op: "delete" });
    else segB.push({ text: tb[o.bi], op: "insert" });
  }
  return { a: segA, b: segB };
}

export interface DiffRow {
  kind: "equal" | "insert" | "delete" | "change";
  left?: { n: number; text: string; segments?: Segment[] };
  right?: { n: number; text: string; segments?: Segment[] };
}

/** Pair up deletes and inserts into "change" rows for side-by-side display. */
export function toRows(diff: LineDiff[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < diff.length) {
    const d = diff[i];
    if (d.op === "equal") {
      rows.push({ kind: "equal", left: { n: d.a!, text: d.text }, right: { n: d.b!, text: d.text } });
      i++;
      continue;
    }
    const dels: LineDiff[] = [];
    const ins: LineDiff[] = [];
    while (i < diff.length && diff[i].op !== "equal") {
      if (diff[i].op === "delete") dels.push(diff[i]);
      else ins.push(diff[i]);
      i++;
    }
    const len = Math.max(dels.length, ins.length);
    for (let k = 0; k < len; k++) {
      const del = dels[k];
      const add = ins[k];
      if (del && add) {
        const w = diffWords(del.text, add.text);
        rows.push({ kind: "change", left: { n: del.a!, text: del.text, segments: w.a }, right: { n: add.b!, text: add.text, segments: w.b } });
      } else if (del) rows.push({ kind: "delete", left: { n: del.a!, text: del.text } });
      else rows.push({ kind: "insert", right: { n: add.b!, text: add.text } });
    }
  }
  return rows;
}

export function summarize(rows: DiffRow[]) {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const r of rows) {
    if (r.kind === "insert") added++;
    else if (r.kind === "delete") removed++;
    else if (r.kind === "change") changed++;
  }
  return { added, removed, changed, unchanged: rows.length - added - removed - changed };
}

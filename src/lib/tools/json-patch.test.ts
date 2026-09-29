import { describe, expect, it } from "vitest";
import {
  applyJsonPatch,
  applyMergePatch,
  generateJsonPatch,
  generateMergePatch,
  getByPointer,
  JSON_PATCH_SAMPLE_FROM,
  JSON_PATCH_SAMPLE_TO,
  MAX_LCS_ELEMENTS,
  parsePatch,
  parsePointer,
  type JsonPatchOp,
} from "@/lib/tools/json-patch";
import type { JsonValue } from "@/lib/tools/json";

function applied(doc: JsonValue, patch: JsonPatchOp[]): JsonValue {
  const r = applyJsonPatch(doc, patch);
  if (!r.ok) throw new Error(`Expected success, got: ${r.error}`);
  return r.result;
}

function failed(doc: JsonValue, patch: JsonPatchOp[]) {
  const r = applyJsonPatch(doc, patch);
  if (r.ok) throw new Error(`Expected failure, got ${JSON.stringify(r.result)}`);
  return r;
}

describe("parsePointer", () => {
  it("handles the root, escapes and plain segments", () => {
    expect(parsePointer("")).toEqual({ ok: true, segments: [] });
    expect(parsePointer("/a/0/b")).toEqual({ ok: true, segments: ["a", "0", "b"] });
    expect(parsePointer("/a~1b/c~0d/~01")).toEqual({ ok: true, segments: ["a/b", "c~d", "~1"] });
    expect(parsePointer("/")).toEqual({ ok: true, segments: [""] });
  });

  it("rejects pointers without a leading slash and prototype segments", () => {
    expect(parsePointer("a/b").ok).toBe(false);
    expect(parsePointer("/__proto__/x").ok).toBe(false);
    expect(parsePointer("/a/constructor").ok).toBe(false);
    expect(parsePointer("/prototype").ok).toBe(false);
  });

  it("getByPointer reads nested values and returns undefined for misses", () => {
    const doc = { a: [10, { "b/c": 1 }], "": 5 };
    expect(getByPointer(doc, "/a/1/b~1c")).toBe(1);
    expect(getByPointer(doc, "/")).toBe(5);
    expect(getByPointer(doc, "")).toEqual(doc);
    expect(getByPointer(doc, "/a/2")).toBeUndefined();
    expect(getByPointer(doc, "/a/01")).toBeUndefined();
    expect(getByPointer(doc, "/x/y")).toBeUndefined();
  });
});

describe("applyJsonPatch (RFC 6902)", () => {
  it("runs the RFC 6902 appendix examples", () => {
    expect(applied({ foo: "bar" }, [{ op: "add", path: "/baz", value: "qux" }])).toEqual({ foo: "bar", baz: "qux" });
    expect(applied({ foo: ["bar", "baz"] }, [{ op: "add", path: "/foo/1", value: "qux" }])).toEqual({ foo: ["bar", "qux", "baz"] });
    expect(applied({ baz: "qux", foo: "bar" }, [{ op: "remove", path: "/baz" }])).toEqual({ foo: "bar" });
    expect(applied({ foo: ["bar", "qux", "baz"] }, [{ op: "remove", path: "/foo/1" }])).toEqual({ foo: ["bar", "baz"] });
    expect(applied({ baz: "qux", foo: "bar" }, [{ op: "replace", path: "/baz", value: "boo" }])).toEqual({ baz: "boo", foo: "bar" });
    expect(applied({ foo: { bar: "baz", waldo: "fred" }, qux: { corge: "grault" } }, [{ op: "move", from: "/foo/waldo", path: "/qux/thud" }])).toEqual({
      foo: { bar: "baz" },
      qux: { corge: "grault", thud: "fred" },
    });
    expect(applied({ foo: ["all", "grass", "cows", "eat"] }, [{ op: "move", from: "/foo/1", path: "/foo/3" }])).toEqual({ foo: ["all", "cows", "eat", "grass"] });
    expect(applied({ foo: "bar" }, [{ op: "add", path: "/child", value: { grandchild: {} } }])).toEqual({ foo: "bar", child: { grandchild: {} } });
    expect(applied({ foo: ["bar"] }, [{ op: "add", path: "/foo/-", value: ["abc", "def"] }])).toEqual({ foo: ["bar", ["abc", "def"]] });
    expect(applied({ "/": 9, "~1": 10 }, [{ op: "test", path: "/~01", value: 10 }])).toEqual({ "/": 9, "~1": 10 });
  });

  it("supports copy, root replacement and test on nested structures", () => {
    expect(applied({ a: { b: [1, 2] } }, [{ op: "copy", from: "/a/b", path: "/c" }])).toEqual({ a: { b: [1, 2] }, c: [1, 2] });
    expect(applied({ a: 1 }, [{ op: "replace", path: "", value: [1] }])).toEqual([1]);
    expect(applied({ a: { b: [1, { c: null }] } }, [{ op: "test", path: "/a/b", value: [1, { c: null }] }])).toEqual({ a: { b: [1, { c: null }] } });
  });

  it("is atomic: a failure in the middle leaves the input untouched and reports the index", () => {
    const doc = { a: 1, list: [1, 2] };
    const r = failed(doc, [
      { op: "add", path: "/b", value: 2 },
      { op: "remove", path: "/missing" },
      { op: "add", path: "/c", value: 3 },
    ]);
    expect(r.failedIndex).toBe(1);
    expect(r.error).toMatch(/Operation 1/);
    expect(doc).toEqual({ a: 1, list: [1, 2] });
  });

  it("does not mutate the input document or the patch values on success", () => {
    const doc: JsonValue = { list: [1] };
    const value: JsonValue = { nested: true };
    const out = applied(doc, [{ op: "add", path: "/list/-", value }]) as { list: JsonValue[] };
    expect(doc).toEqual({ list: [1] });
    (out.list[1] as { nested: boolean }).nested = false;
    expect(value).toEqual({ nested: true });
  });

  it("rejects bad array indices, missing parents, failed tests and moves into children", () => {
    expect(failed({ a: [1, 2] }, [{ op: "add", path: "/a/5", value: 0 }]).error).toMatch(/out of range/);
    expect(failed({ a: [1, 2] }, [{ op: "add", path: "/a/01", value: 0 }]).error).toMatch(/not a valid index/);
    expect(failed({ a: [1, 2] }, [{ op: "remove", path: "/a/2" }]).error).toMatch(/does not exist/);
    expect(failed({}, [{ op: "add", path: "/x/y", value: 1 }]).error).toMatch(/"\/x" does not exist/);
    expect(failed({ a: 1 }, [{ op: "replace", path: "/b", value: 1 }]).error).toMatch(/use "add"/);
    expect(failed({ a: 1 }, [{ op: "test", path: "/a", value: 2 }]).error).toMatch(/value is 1, expected 2/);
    expect(failed({ a: { b: 1 } }, [{ op: "move", from: "/a", path: "/a/b/c" }]).error).toMatch(/own children/);
    expect(failed({ a: 1 }, [{ op: "remove", path: "" }]).error).toMatch(/root/);
    expect(failed({ a: 1 }, [{ op: "add", path: "/a/b", value: 1 }]).error).toMatch(/Cannot add to a number/);
    expect(failed({ a: 1 }, [{ op: "add", path: "/a/b/c", value: 1 }]).error).toMatch(/not a container/);
  });

  it("refuses prototype-polluting paths", () => {
    const r = failed({}, [{ op: "add", path: "/__proto__/polluted", value: true }]);
    expect(r.error).toMatch(/__proto__/);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe("parsePatch", () => {
  it("accepts a well-formed patch and rejects malformed shapes", () => {
    const ok = parsePatch('[{"op":"add","path":"/a","value":1},{"op":"move","from":"/a","path":"/b"},{"op":"remove","path":"/b"}]');
    expect(ok.ok && ok.ops.length).toBe(3);
    expect(parsePatch("{}")).toMatchObject({ ok: false, error: expect.stringMatching(/array/) });
    expect(parsePatch('[{"op":"flip","path":"/a"}]')).toMatchObject({ ok: false, error: expect.stringMatching(/invalid "op"/) });
    expect(parsePatch('[{"op":"add","path":"/a"}]')).toMatchObject({ ok: false, error: expect.stringMatching(/missing "value"/) });
    expect(parsePatch('[{"op":"move","path":"/a"}]')).toMatchObject({ ok: false, error: expect.stringMatching(/"from"/) });
    expect(parsePatch('[{"op":"remove"}]')).toMatchObject({ ok: false, error: expect.stringMatching(/"path"/) });
    expect(parsePatch("[1]").ok).toBe(false);
    expect(parsePatch("[").ok).toBe(false);
  });

  it("keeps a literal null value for add/replace/test", () => {
    const r = parsePatch('[{"op":"replace","path":"/a","value":null}]');
    expect(r.ok && r.ops[0]).toEqual({ op: "replace", path: "/a", value: null });
  });
});

const ROUND_TRIP_FIXTURES: Array<[string, JsonValue, JsonValue]> = [
  ["primitive change", { a: 1 }, { a: "1" }],
  ["add and remove keys", { a: 1, b: 2 }, { b: 2, c: 3 }],
  ["nested objects", { a: { b: { c: 1, d: [1, 2] } } }, { a: { b: { c: 2, d: [1, 2, 3], e: null } } }],
  ["array insert in the middle", [1, 2, 3, 4], [1, 9, 2, 3, 4]],
  ["array remove in the middle", [1, 2, 3, 4], [1, 3, 4]],
  ["array element changed in place", [{ id: 1, v: "a" }, { id: 2, v: "b" }], [{ id: 1, v: "a" }, { id: 2, v: "c" }]],
  ["nested arrays", { m: [[1, 2], [3, 4]] }, { m: [[1, 2, 5], [4], [7]] }],
  ["null vs missing", { a: null, b: 1 }, { b: 1, c: null }],
  ["unicode keys", { "clé": "à", "ключ": [1], "键": { "😀": true } }, { "clé": "b", "ключ": [1, 2], "键": {} }],
  ["type change object to array", { a: { x: 1 } }, { a: [1] }],
  ["root type change", [1, 2], { a: 1 }],
  ["empty to full", {}, { a: [1, { b: [] }] }],
  ["full to empty array", [1, 2, 3], []],
  ["pointer-special keys", { "a/b": 1, "c~d": 2 }, { "a/b": 2, "e": 3 }],
  ["reordered array", ["a", "b", "c", "d"], ["d", "c", "b", "a"]],
];

describe("generateJsonPatch", () => {
  it.each(ROUND_TRIP_FIXTURES)("round-trips: %s", (_name, from, to) => {
    const patch = generateJsonPatch(from, to);
    expect(applied(from, patch)).toEqual(to);
  });

  it("emits nothing for equal documents and minimal ops for simple changes", () => {
    expect(generateJsonPatch({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([]);
    expect(generateJsonPatch({ a: 1 }, { a: 2 })).toEqual([{ op: "replace", path: "/a", value: 2 }]);
    expect(generateJsonPatch({ a: 1 }, {})).toEqual([{ op: "remove", path: "/a" }]);
    expect(generateJsonPatch({}, { a: 1 })).toEqual([{ op: "add", path: "/a", value: 1 }]);
  });

  it("uses add/remove for array insertions instead of replacing every element", () => {
    const patch = generateJsonPatch([1, 2, 3, 4, 5], [0, 1, 2, 4, 5, 6]);
    expect(patch).toEqual([
      { op: "add", path: "/0", value: 0 },
      { op: "remove", path: "/3" },
      { op: "add", path: "/-".replace("-", "5"), value: 6 },
    ]);
  });

  it("falls back to index-wise diffs above the LCS cap and still round-trips", () => {
    const from = Array.from({ length: MAX_LCS_ELEMENTS + 5 }, (_, i) => i);
    const to = from.slice(1).concat([99, 100]);
    const patch = generateJsonPatch(from, to);
    expect(patch.length).toBeGreaterThan(MAX_LCS_ELEMENTS); // index-wise, so nearly every slot is a replace
    expect(applied(from, patch)).toEqual(to);
  });

  it("round-trips the bundled sample", () => {
    const from = JSON.parse(JSON_PATCH_SAMPLE_FROM) as JsonValue;
    const to = JSON.parse(JSON_PATCH_SAMPLE_TO) as JsonValue;
    const patch = generateJsonPatch(from, to);
    expect(patch.length).toBeGreaterThan(3);
    expect(applied(from, patch)).toEqual(to);
  });
});

describe("merge patch (RFC 7386)", () => {
  it("applies the RFC 7386 example", () => {
    const doc = { a: "b", c: { d: "e", f: "g" } };
    const r = applyMergePatch(doc, { a: "z", c: { f: null } });
    expect(r).toEqual({ ok: true, result: { a: "z", c: { d: "e" } } });
    expect(doc).toEqual({ a: "b", c: { d: "e", f: "g" } });
  });

  it("follows the RFC 7386 appendix test cases", () => {
    const cases: Array<[JsonValue, JsonValue, JsonValue]> = [
      [{ a: "b" }, { a: "c" }, { a: "c" }],
      [{ a: "b" }, { b: "c" }, { a: "b", b: "c" }],
      [{ a: "b" }, { a: null }, {}],
      [{ a: "b", b: "c" }, { a: null }, { b: "c" }],
      [{ a: ["b"] }, { a: "c" }, { a: "c" }],
      [{ a: "c" }, { a: ["b"] }, { a: ["b"] }],
      [{ a: { b: "c" } }, { a: { b: "d", c: null } }, { a: { b: "d" } }],
      [{ a: [{ b: "c" }] }, { a: [1] }, { a: [1] }],
      [["a", "b"], ["c", "d"], ["c", "d"]],
      [{ a: "b" }, ["c"], ["c"]],
      [{ a: "foo" }, null, null],
      [{ a: "foo" }, "bar", "bar"],
      [{ e: null }, { a: 1 }, { e: null, a: 1 }],
      [[1, 2], { a: "b", c: null }, { a: "b" }],
      [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
    ];
    for (const [doc, patch, expected] of cases) {
      expect(applyMergePatch(doc, patch)).toEqual({ ok: true, result: expected });
    }
  });

  it("generates a merge patch that round-trips (nulls become deletions)", () => {
    const from: JsonValue = { a: 1, b: { c: 1, d: 2 }, e: [1, 2], f: "x" };
    const to: JsonValue = { a: 1, b: { c: 3 }, e: [1], g: true };
    const patch = generateMergePatch(from, to);
    expect(patch).toEqual({ b: { d: null, c: 3 }, e: [1], f: null, g: true });
    expect(applyMergePatch(from, patch)).toEqual({ ok: true, result: to });
    expect(generateMergePatch({ a: 1 }, { a: 1 })).toEqual({});
    expect(generateMergePatch({ a: 1 }, [1])).toEqual([1]);
  });

  it("refuses prototype-polluting merge keys", () => {
    const r = applyMergePatch({}, JSON.parse('{"__proto__": {"polluted": true}}') as JsonValue);
    expect(r.ok).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  detectDraft,
  generateSchemaFromJson,
  JSON_SCHEMA_DATA_SAMPLE,
  JSON_SCHEMA_SAMPLE,
  locateJsonPointer,
  schemaStats,
  validateJsonSchema,
  type SchemaDraft,
  type SchemaValidationOk,
} from "@/lib/tools/json-schema";
import { compileSchema } from "@/lib/tools/json-schema-engine";

function run(schema: string, data: string, draft: SchemaDraft = "2020-12"): SchemaValidationOk {
  const r = validateJsonSchema(schema, data, { draft });
  if (!r.ok) throw new Error(`Expected ok, got ${r.side}: ${r.error}`);
  return r;
}

describe("detectDraft", () => {
  it("reads the $schema keyword and defaults to 2020-12", () => {
    expect(detectDraft({ $schema: "https://json-schema.org/draft/2020-12/schema" })).toMatchObject({ draft: "2020-12", source: "declared" });
    expect(detectDraft({ $schema: "https://json-schema.org/draft/2019-09/schema" })).toMatchObject({ draft: "2019-09", source: "declared" });
    expect(detectDraft({ $schema: "http://json-schema.org/draft-07/schema#" })).toMatchObject({ draft: "draft-07", source: "declared" });
    expect(detectDraft({ $schema: "http://json-schema.org/draft-06/schema#" })).toMatchObject({ draft: "draft-07", note: expect.stringMatching(/draft-06/i) });
    expect(detectDraft({ $schema: "http://json-schema.org/draft-04/schema#" })).toMatchObject({ draft: "draft-07", note: expect.stringMatching(/not supported/) });
    expect(detectDraft({ type: "object" })).toMatchObject({ draft: "2020-12", source: "default", note: expect.stringMatching(/No \$schema/) });
    expect(detectDraft({ $schema: "urn:custom" })).toMatchObject({ draft: "2020-12", source: "default" });
    expect(detectDraft(true)).toMatchObject({ draft: "2020-12", source: "default" });
  });
});

describe("locateJsonPointer", () => {
  const text = `{
  "a": 1,
  "items": [
    { "price": 1 },
    { "price": "x",
      "deep": [null, { "k~": 2 }] }
  ],
  "b/c": "v"
}`;
  it("finds lines for nested object keys and array indices", () => {
    expect(locateJsonPointer(text, "")).toBe(1);
    expect(locateJsonPointer(text, "/a")).toBe(2);
    expect(locateJsonPointer(text, "/items")).toBe(3);
    expect(locateJsonPointer(text, "/items/0")).toBe(4);
    expect(locateJsonPointer(text, "/items/1/price")).toBe(5);
    expect(locateJsonPointer(text, "/items/1/deep/1/k~0")).toBe(6);
    expect(locateJsonPointer(text, "/b~1c")).toBe(8);
  });

  it("returns undefined for missing paths, bad pointers and invalid JSON", () => {
    expect(locateJsonPointer(text, "/zzz")).toBeUndefined();
    expect(locateJsonPointer(text, "/items/9")).toBeUndefined();
    expect(locateJsonPointer(text, "a")).toBeUndefined();
    expect(locateJsonPointer("{ broken", "/a")).toBeUndefined();
  });

  it("is whitespace-agnostic and handles escaped quotes in keys", () => {
    expect(locateJsonPointer('{"x":\n{"q\\"":\n[1,2]}}', '/x/q"/1')).toBe(3);
    expect(locateJsonPointer('[{"a":1},{"a":2}]', "/1/a")).toBe(1);
  });
});

describe("validateJsonSchema", () => {
  it("reports the two deliberate errors in the sample with paths, lines and friendly text", () => {
    const r = run(JSON_SCHEMA_SAMPLE, JSON_SCHEMA_DATA_SAMPLE);
    expect(r.valid).toBe(false);
    expect(r.schemaErrors).toBeUndefined();
    expect(r.errors.map((e) => [e.instancePath, e.keyword])).toEqual([
      ["/status", "enum"],
      ["/variants/1", "required"],
    ]);
    expect(r.errors[0].message).toMatch(/"published" is not one of the allowed values/);
    expect(r.errors[0].suggestion).toMatch(/"draft", "active", "archived"/);
    expect(r.errors[0].line).toBe(5);
    expect(r.errors[1].message).toBe('Missing required property "stock".');
    expect(r.errors[1].formatted).toBe('/variants/1: Missing required property "stock".');
    expect(r.errors[1].line).toBe(15);
    expect(JSON.parse(r.errors[1].params)).toEqual({ missingProperty: "stock" });
    expect(r.draft).toMatchObject({ draft: "2020-12", source: "declared" });
  });

  it("validates a correct document", () => {
    const data = JSON.parse(JSON_SCHEMA_DATA_SAMPLE) as { status: string; variants: Array<Record<string, unknown>> };
    data.status = "active";
    data.variants[1].stock = 0;
    const r = run(JSON_SCHEMA_SAMPLE, JSON.stringify(data));
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("checks formats and produces type/additionalProperties messages", () => {
    const schema = JSON.stringify({ type: "object", properties: { email: { type: "string", format: "email" }, n: { type: "integer" } }, additionalProperties: false });
    const r = run(schema, JSON.stringify({ email: "nope", n: 1.5, extra: true }));
    expect(r.valid).toBe(false);
    const byKeyword = Object.fromEntries(r.errors.map((e) => [e.keyword, e]));
    expect(byKeyword.format.message).toBe('"nope" is not a valid email.');
    expect(byKeyword.type.message).toBe("Expected integer, got number.");
    expect(byKeyword.additionalProperties.message).toBe('Unexpected property "extra".');
    expect(byKeyword.additionalProperties.instancePath).toBe("");
    expect(byKeyword.additionalProperties.formatted).toMatch(/^\(root\): /);
  });

  it("reports minimum, minLength, pattern and uniqueItems in plain language", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: { p: { type: "number", minimum: 0 }, s: { type: "string", minLength: 3, pattern: "^[a-z]+$" }, t: { type: "array", uniqueItems: true } },
    });
    const r = run(schema, JSON.stringify({ p: -1, s: "A", t: [1, 1] }));
    const messages = r.errors.map((e) => e.message);
    expect(messages).toContain("Value -1 must be >= 0.");
    expect(messages).toContain("String must be at least 3 characters long (got 1).");
    expect(messages).toContain('"A" does not match the pattern ^[a-z]+$.');
    expect(messages.some((m) => /must be unique/.test(m))).toBe(true);
  });

  it("works across drafts, including draft-07 schemas and $defs in 2019-09", () => {
    const d7 = JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#", type: "array", items: { type: "number" } });
    expect(run(d7, "[1, 2]", "draft-07").valid).toBe(true);
    expect(run(d7, '[1, "2"]', "draft-07").errors[0].instancePath).toBe("/1");
    const d19 = JSON.stringify({ $schema: "https://json-schema.org/draft/2019-09/schema", $defs: { n: { type: "number" } }, type: "object", properties: { a: { $ref: "#/$defs/n" } } });
    expect(run(d19, '{"a": "x"}', "2019-09").valid).toBe(false);
    const d6 = JSON.stringify({ $schema: "http://json-schema.org/draft-06/schema#", type: "string" });
    const r6 = run(d6, '"ok"', "draft-07");
    expect(r6.valid).toBe(true);
    expect(r6.draft.note).toMatch(/draft-06/i);
  });

  it("notes when a draft is forced manually", () => {
    const r = run(JSON.stringify({ type: "string" }), '"x"', "draft-07");
    expect(r.draft).toMatchObject({ draft: "draft-07" });
    expect(r.draft.note).toMatch(/selected manually/);
  });

  it("returns schema compile errors instead of throwing", () => {
    const r = run(JSON.stringify({ type: "strng" }), "{}");
    expect(r.valid).toBe(false);
    expect(r.schemaErrors?.length).toBeGreaterThan(0);
    expect(r.schemaErrors?.join(" ")).toMatch(/type/);
    const ref = run(JSON.stringify({ $ref: "#/$defs/missing" }), "{}");
    expect(ref.schemaErrors?.[0]).toMatch(/can't resolve reference/i);
  });

  it("rejects unparsable inputs and non-object schemas with the side identified", () => {
    expect(validateJsonSchema("{", "{}")).toMatchObject({ ok: false, side: "schema" });
    expect(validateJsonSchema("{}", "[")).toMatchObject({ ok: false, side: "data" });
    expect(validateJsonSchema("[]", "{}")).toMatchObject({ ok: false, side: "schema", error: expect.stringMatching(/object/) });
    expect(validateJsonSchema("", "{}")).toMatchObject({ ok: false, side: "schema" });
  });

  it("collects schema stats", () => {
    const s = schemaStats(JSON.parse(JSON_SCHEMA_SAMPLE));
    expect(s.requiredCount).toBe(8);
    expect(s.propertyCount).toBe(13);
    expect(s.keywords).toEqual(expect.arrayContaining(["type", "required", "properties", "enum", "format", "minimum", "pattern", "uniqueItems", "items", "additionalProperties"]));
    expect(s.keywords).not.toContain("title");
    expect(s.keywords).not.toContain("city");
  });
});

describe("generateSchemaFromJson", () => {
  it("infers types, required keys, formats and merged array items", () => {
    const schema = generateSchemaFromJson({
      id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      email: "a@b.co",
      when: "2026-01-02T03:04:05Z",
      day: "2026-01-02",
      site: "https://example.com/x",
      n: 3,
      f: 1.5,
      ok: true,
      nothing: null,
      list: [{ a: 1, b: "x" }, { a: 2.5, c: false }],
      empty: [],
      mixed: [1, "s"],
    });
    expect(schema).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        email: { type: "string", format: "email" },
        when: { type: "string", format: "date-time" },
        day: { type: "string", format: "date" },
        site: { type: "string", format: "uri" },
        n: { type: "integer" },
        f: { type: "number" },
        ok: { type: "boolean" },
        nothing: { type: "null" },
        list: { type: "array", items: { type: "object", properties: { a: { type: "number" }, b: { type: "string" }, c: { type: "boolean" } }, required: ["a"] } },
        empty: { type: "array" },
        mixed: { type: "array", items: { type: ["integer", "string"] } },
      },
      required: ["id", "email", "when", "day", "site", "n", "f", "ok", "nothing", "list", "empty", "mixed"],
    });
  });

  it("produces a schema the validator accepts for the data it was inferred from", () => {
    const data = JSON.parse(JSON_SCHEMA_DATA_SAMPLE);
    const schema = generateSchemaFromJson(data);
    expect(run(JSON.stringify(schema), JSON_SCHEMA_DATA_SAMPLE).valid).toBe(true);
    expect(run(JSON.stringify(schema), JSON.stringify({ ...data, price: "129" })).errors[0]).toMatchObject({ instancePath: "/price", keyword: "type" });
  });
});

describe("json-schema-engine", () => {
  const errorsOf = (schema: unknown, data: unknown) => {
    const c = compileSchema(schema as never);
    if (!c.ok) throw new Error(c.errors.join("; "));
    return c.validate(data as never).map((e) => `${e.instancePath}|${e.keyword}`);
  };

  it("handles combinators, conditionals and negation", () => {
    const schema = {
      type: "object",
      properties: { kind: { enum: ["a", "b"] }, n: { type: "integer" } },
      if: { properties: { kind: { const: "a" } } },
      then: { required: ["n"] },
      else: { not: { required: ["n"] } },
      anyOf: [{ required: ["kind"] }, { required: ["id"] }],
      oneOf: [{ properties: { kind: { const: "a" } } }, { properties: { kind: { const: "b" } } }],
    };
    expect(errorsOf(schema, { kind: "a", n: 12 })).toEqual([]);
    expect(errorsOf(schema, { kind: "a" })).toEqual(["|required", "|if"]);
    expect(errorsOf(schema, { kind: "b", n: 1 })).toEqual(["|not", "|if"]);
    expect(errorsOf(schema, { n: 7 })).toContain("|anyOf");
    expect(errorsOf(schema, { n: 7 })).toContain("|oneOf");
  });

  it("supports prefixItems, contains, dependentRequired, propertyNames and unevaluatedProperties", () => {
    expect(errorsOf({ prefixItems: [{ type: "string" }, { type: "number" }], items: false }, ["a", 1])).toEqual([]);
    expect(errorsOf({ prefixItems: [{ type: "string" }], items: false }, ["a", 1])).toEqual(["/1|false schema"]);
    expect(errorsOf({ contains: { type: "number" }, minContains: 2 }, [1, "x"])).toEqual(["|contains"]);
    expect(errorsOf({ dependentRequired: { card: ["cvv"] } }, { card: "1" })).toEqual(["|dependentRequired"]);
    expect(errorsOf({ dependencies: { card: ["cvv"] } }, { card: "1" })).toEqual(["|dependencies"]);
    expect(errorsOf({ propertyNames: { pattern: "^[a-z]+$" } }, { ok: 1, Bad: 2 })).toEqual(["|propertyNames"]);
    const unevaluated = { allOf: [{ properties: { a: true } }], properties: { b: true }, unevaluatedProperties: false };
    expect(errorsOf(unevaluated, { a: 1, b: 2 })).toEqual([]);
    expect(errorsOf(unevaluated, { a: 1, c: 2 })).toEqual(["|unevaluatedProperties"]);
  });

  it("resolves local refs, $defs, definitions, anchors and recursive schemas without looping", () => {
    const tree = { $defs: { node: { type: "object", properties: { v: { type: "integer" }, kids: { type: "array", items: { $ref: "#/$defs/node" } } }, required: ["v"] } }, $ref: "#/$defs/node" };
    expect(errorsOf(tree, { v: 1, kids: [{ v: 2, kids: [{ v: "x" }] }] })).toEqual(["/kids/0/kids/0/v|type"]);
    expect(errorsOf({ definitions: { s: { type: "string" } }, items: { $ref: "#/definitions/s" } }, [1])).toEqual(["/0|type"]);
    expect(errorsOf({ $defs: { s: { $anchor: "str", type: "string" } }, $ref: "#str" }, 1)).toEqual(["|type"]);
    expect(errorsOf({ $ref: "#" }, 1)).toEqual([]);
  });

  it("checks formats and rejects invalid schemas at compile time", () => {
    const fmt = (format: string, value: string) => errorsOf({ type: "string", format }, value).length === 0;
    expect(fmt("date-time", "2026-02-29T10:00:00Z")).toBe(false);
    expect(fmt("date-time", "2024-02-29T10:00:00+05:30")).toBe(true);
    expect(fmt("ipv4", "256.1.1.1")).toBe(false);
    expect(fmt("ipv6", "::1")).toBe(true);
    expect(fmt("hostname", "-bad.example")).toBe(false);
    expect(fmt("uuid", "3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(fmt("unknown-format", "anything")).toBe(true);
    expect(compileSchema({ pattern: "(" } as never)).toMatchObject({ ok: false, errors: [expect.stringMatching(/regular expression/)] });
    expect(compileSchema({ minLength: -1 } as never)).toMatchObject({ ok: false });
    expect(compileSchema({ properties: { a: { type: "nope" } } } as never)).toMatchObject({ ok: false, errors: [expect.stringMatching(/properties\/a\/type/)] });
  });

  it("caps the number of reported errors", () => {
    const c = compileSchema({ items: { type: "string" } } as never, { maxErrors: 3 });
    if (!c.ok) throw new Error("compile failed");
    expect(c.validate([1, 2, 3, 4, 5]).length).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import * as prettier from "prettier/standalone";
import * as graphqlPlugin from "prettier/plugins/graphql";
import { analyzeGraphql, formatGraphql, GRAPHQL_MAX_INPUT, GRAPHQL_SAMPLE, GRAPHQL_SCHEMA_SAMPLE, minifyGraphql, tokenizeGraphql, type GraphqlAnalysis, type PrettierModule } from "@/lib/tools/graphql";

const prettierModule: PrettierModule = { format: (src) => prettier.format(src, { parser: "graphql", plugins: [graphqlPlugin] }) };

function ok(src: string): GraphqlAnalysis {
  const r = analyzeGraphql(src);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("tokenizeGraphql", () => {
  it("produces the expected token kinds", () => {
    const kinds = tokenizeGraphql('query Q($a: Int = -1) { f(s: "x", b: """block""") ...F } # c').map((t) => t.kind);
    expect(kinds).toEqual(["name", "name", "punct", "punct", "name", "punct", "name", "punct", "number", "punct", "punct", "name", "punct", "name", "punct", "string", "comma", "name", "punct", "block", "punct", "spread", "name", "punct", "comment"]);
  });

  it("rejects unterminated strings, unknown characters and oversized input", () => {
    expect(() => tokenizeGraphql('{ f(a: "oops) }')).toThrow(/Unterminated string/);
    expect(() => tokenizeGraphql('"""never closed')).toThrow(/block string/);
    expect(() => tokenizeGraphql("{ a; }")).toThrow(/Unexpected character/);
    expect(() => tokenizeGraphql("{".repeat(GRAPHQL_MAX_INPUT + 1))).toThrow(/too large/);
  });
});

describe("minifyGraphql", () => {
  it("strips comments and commas and collapses whitespace", () => {
    expect(minifyGraphql("query Q {\n  # comment\n  user(id: 1) { id, name }\n}")).toBe("query Q{user(id:1){id name}}");
  });

  it("keeps strings and block strings intact", () => {
    const src = 'mutation { add(text: "a, b # not a comment", note: """multi\n  line, text""") { id } }';
    expect(minifyGraphql(src)).toBe('mutation{add(text:"a, b # not a comment" note:"""multi\n  line, text"""){id}}');
  });

  it("keeps spreads, variables and directives valid", () => {
    expect(minifyGraphql("query ($id: ID!) { user(id: $id) { ... on User { id } ...Frag @include(if: true) } }")).toBe("query($id:ID!){user(id:$id){...on User{id}...Frag@include(if:true)}}");
  });

  it("round-trips the sample through Prettier unchanged in meaning", async () => {
    const min = minifyGraphql(GRAPHQL_SAMPLE);
    expect(min).not.toContain("#");
    const r = await formatGraphql(prettierModule, min);
    expect(r.ok).toBe(true);
  });
});

describe("analyzeGraphql: operations", () => {
  it("analyses the sample query, its variables, fragments and depth", () => {
    const a = ok(GRAPHQL_SAMPLE);
    expect(a.kind).toBe("operations");
    expect(a.operations).toEqual([
      {
        type: "query",
        name: "GetUser",
        variables: [
          { name: "id", type: "ID!", hasDefault: false },
          { name: "first", type: "Int", hasDefault: true },
          { name: "withEmail", type: "Boolean", hasDefault: true },
        ],
        rootFields: ["user"],
        depth: 5,
        fragmentsUsed: ["UserFields"],
      },
    ]);
    expect(a.fragments).toEqual([{ name: "UserFields", on: "User", fragmentsUsed: [], variablesUsed: ["withEmail"], depth: 2 }]);
    expect(a.warnings).toEqual([]);
  });

  it("handles shorthand, aliases, list types and mutations", () => {
    const a = ok("{ me: viewer { id } }\nmutation Add($ids: [ID!]!, $tags: [String] = []) { add(ids: $ids, tags: $tags) { ok } }");
    expect(a.operations[0]).toMatchObject({ type: "query", name: "", rootFields: ["viewer"], depth: 2 });
    expect(a.operations[1].variables).toEqual([
      { name: "ids", type: "[ID!]!", hasDefault: false },
      { name: "tags", type: "[String]", hasDefault: true },
    ]);
    expect(a.warnings).toContain("Anonymous operation combined with other operations: servers reject documents where an unnamed operation is not the only one.");
  });

  it("warns about unused, undefined and duplicate fragments and names", () => {
    const a = ok("query A { x { ...Missing } } query A { y } fragment Unused on T { id } fragment Unused on T { id }");
    expect(a.warnings).toEqual(expect.arrayContaining(["Duplicate operation name A (2 times).", "Duplicate fragment name Unused (2 times).", "Unused fragment Unused.", "Fragment Missing is spread but not defined in this document."]));
  });

  it("warns about unused variables and deep nesting", () => {
    const deep = `query Deep($unused: Int) { ${"a { ".repeat(9)}id${" }".repeat(9)} }`;
    const a = ok(deep);
    expect(a.operations[0].depth).toBe(10);
    expect(a.warnings).toContain("Variable $unused is declared but never used in Deep.");
    expect(a.warnings.some((w) => /deeply nested \(10 levels > 8\)/.test(w))).toBe(true);
  });

  it("counts variables used in nested arguments, directives and spread fragments as used", () => {
    expect(ok("query Q($f: Int) { user { posts(first: $f) { id } } }").warnings).toEqual([]);
    expect(ok("query Q($s: Boolean!) { user { id @skip(if: $s) } }").warnings).toEqual([]);
    expect(ok("query Q($s: Boolean!) { user { ...F } } fragment F on User { ...G } fragment G on User { id @skip(if: $s) }").warnings).toEqual([]);
    expect(ok("query Q($s: Boolean!) { user { ...F } } fragment F on User { id }").warnings).toEqual(["Variable $s is declared but never used in Q."]);
  });
});

describe("analyzeGraphql: schema", () => {
  it("summarises schema definitions with field counts", () => {
    const a = ok(GRAPHQL_SCHEMA_SAMPLE);
    expect(a.kind).toBe("schema");
    expect(a.operations).toEqual([]);
    expect(a.schemaTypes).toEqual([
      { kind: "type", name: "User", fieldCount: 5 },
      { kind: "interface", name: "Node", fieldCount: 1 },
      { kind: "enum", name: "Role", fieldCount: 3 },
      { kind: "input", name: "CreateUserInput", fieldCount: 3 },
      { kind: "union", name: "SearchResult", fieldCount: 2 },
      { kind: "type", name: "Query", fieldCount: 2 },
      { kind: "type", name: "Mutation", fieldCount: 1 },
    ]);
    expect(a.warnings).toEqual([]);
  });

  it("handles scalars, extend, schema and directive definitions and mixed documents", () => {
    const a = ok('scalar DateTime\nextend type Query { now: DateTime }\nschema { query: Query }\ndirective @auth(role: String) on FIELD_DEFINITION\nquery { now }');
    expect(a.kind).toBe("mixed");
    expect(a.schemaTypes.map((s) => `${s.kind}:${s.name}:${s.fieldCount}`)).toEqual(["scalar:DateTime:0", "type:Query:1", "schema:schema:1", "directive:@auth:0"]);
    expect(a.operations).toHaveLength(1);
  });

  it("reports tokenizer errors and empty documents", () => {
    expect(analyzeGraphql('{ f(a: "x) }')).toEqual({ ok: false, error: expect.stringContaining("Unterminated") });
    expect(ok("# only a comment").kind).toBe("empty");
    expect(() => analyzeGraphql("{ ".repeat(3000))).not.toThrow();
  });
});

describe("formatGraphql", () => {
  it("formats with Prettier's GraphQL parser", async () => {
    const r = await formatGraphql(prettierModule, "query Q($id:ID!){user(id:$id){id,name}}");
    expect(r).toEqual({ ok: true, output: "query Q($id: ID!) {\n  user(id: $id) {\n    id\n    name\n  }\n}\n" });
  });

  it("returns a one-line error for invalid documents and empty input", async () => {
    const bad = await formatGraphql(prettierModule, "query { ");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.includes("\n")).toBe(false);
    expect(await formatGraphql(prettierModule, "  ")).toEqual({ ok: false, error: "Input is empty." });
  });
});

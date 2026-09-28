import { describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOW_EXPRESSION, runJsonToCsvWorkflow, selectRows, WORKFLOW_EXAMPLES, WORKFLOW_LIMITS, WORKFLOW_SAMPLE, type WorkflowError, type WorkflowOk } from "@/lib/tools/workflow";
import { JSONPATH_SAMPLE } from "@/lib/tools/jsonpath";

const SAMPLE = JSON.stringify({
  users: [
    { id: 1, name: "Ada", role: "admin", active: true },
    { id: 2, name: "Grace", role: "dev", active: true },
    { id: 3, name: "Linus", role: "admin", active: false },
  ],
  meta: { id: "req_1", total: 3 },
  empty: [],
  names: ["Ada", "Grace"],
  matrix: [
    [1, 2, 3],
    [4, 5, 6],
  ],
});

function ok(result: ReturnType<typeof runJsonToCsvWorkflow>): WorkflowOk {
  if (!result.ok) throw new Error(`Expected success, got ${result.code}: ${result.error}`);
  return result;
}

function err(result: ReturnType<typeof runJsonToCsvWorkflow>): WorkflowError {
  if (result.ok) throw new Error(`Expected an error, got CSV:\n${result.csv}`);
  return result;
}

describe("selectRows", () => {
  it("uses each match as a row when there are several", () => {
    const sel = selectRows([
      { path: "$.a", value: { x: 1 } },
      { path: "$.b", value: { x: 2 } },
    ]);
    expect(sel).toEqual({ rows: [{ x: 1 }, { x: 2 }], unwrapped: false });
  });

  it("unwraps a single array match into rows", () => {
    const sel = selectRows([{ path: "$.users", value: [{ x: 1 }, { x: 2 }] }]);
    expect(sel).toEqual({ rows: [{ x: 1 }, { x: 2 }], unwrapped: true });
  });

  it("keeps a single non-array match as one row", () => {
    const sel = selectRows([{ path: "$.meta", value: { x: 1 } }]);
    expect(sel).toEqual({ rows: [{ x: 1 }], unwrapped: false });
  });
});

describe("runJsonToCsvWorkflow: successful conversions", () => {
  it("converts a wildcard selection of objects", () => {
    const r = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users[*]" }));
    expect(r.csv).toBe(["id,name,role,active", "1,Ada,admin,true", "2,Grace,dev,true", "3,Linus,admin,false"].join("\n"));
    expect(r.columns).toEqual(["id", "name", "role", "active"]);
    expect(r.rowCount).toBe(3);
    expect(r.matchCount).toBe(3);
    expect(r.unwrapped).toBe(false);
    expect(r.delimiter).toBe(",");
  });

  it("unwraps a single match whose value is an array of objects", () => {
    const wildcard = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users[*]" }));
    const single = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users" }));
    expect(single.csv).toBe(wildcard.csv);
    expect(single.matchCount).toBe(1);
    expect(single.rowCount).toBe(3);
    expect(single.unwrapped).toBe(true);
  });

  it("applies JSONPath filters and slices", () => {
    const active = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users[?(@.active)]" }));
    expect(active.rowCount).toBe(2);
    expect(active.csv.split("\n")).toEqual(["id,name,role,active", "1,Ada,admin,true", "2,Grace,dev,true"]);

    const sliced = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users[1:]" }));
    expect(sliced.rowCount).toBe(2);
    expect(sliced.csv.split("\n")[1]).toBe("2,Grace,dev,true");
  });

  it("converts a single object match into a one-row CSV", () => {
    const r = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.meta" }));
    expect(r.csv).toBe("id,total\nreq_1,3");
    expect(r.unwrapped).toBe(false);
  });

  it("unions columns across heterogeneous rows and leaves missing values blank", () => {
    const json = JSON.stringify([{ a: 1, b: 2 }, { b: 3, c: 4 }, { a: null }]);
    const r = ok(runJsonToCsvWorkflow({ json, jsonPath: "$[*]" }));
    expect(r.csv).toBe("a,b,c\n1,2,\n,3,4\n,,");
    expect(r.columns).toEqual(["a", "b", "c"]);
  });

  it("quotes delimiters, quotes and newlines and serialises nested values", () => {
    const json = JSON.stringify([{ name: 'Doe, "John"', note: "line1\nline2", tags: ["x", "y"], addr: { city: "Pune" } }]);
    const r = ok(runJsonToCsvWorkflow({ json, jsonPath: "$" }));
    expect(r.csv).toBe(['name,note,tags,addr', '"Doe, ""John""","line1\nline2","[""x"",""y""]","{""city"":""Pune""}"'].join("\n"));
  });

  it("honours a custom delimiter", () => {
    const r = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users", delimiter: ";" }));
    expect(r.csv.split("\n")[0]).toBe("id;name;role;active");
    expect(r.delimiter).toBe(";");
  });

  it("writes arrays of arrays as header-less rows", () => {
    const r = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.matrix" }));
    expect(r.csv).toBe("1,2,3\n4,5,6");
    expect(r.columns).toEqual([]);
    expect(r.rowCount).toBe(2);
  });

  it("converts the bundled sample with the default expression and every example", () => {
    const r = ok(runJsonToCsvWorkflow({ json: WORKFLOW_SAMPLE, jsonPath: DEFAULT_WORKFLOW_EXPRESSION }));
    expect(r.rowCount).toBe(4);
    expect(r.columns).toEqual(["id", "name", "email", "role", "active", "score", "team"]);
    expect(r.csv.split("\n")[1]).toBe("1,Ada Lovelace,ada@example.com,admin,true,98.5,");
    for (const ex of WORKFLOW_EXAMPLES) {
      expect(ok(runJsonToCsvWorkflow({ json: WORKFLOW_SAMPLE, jsonPath: ex.expr })).rowCount).toBeGreaterThan(0);
    }
  });

  it("reports progress for every stage on success", () => {
    const r = ok(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users" }));
    expect(r.progress.parse).toEqual({ rootType: "object", topLevelCount: 5, topLevelKeys: ["users", "meta", "empty", "names", "matrix"] });
    expect(r.progress.select).toEqual({ matchCount: 1, rowCount: 3, unwrapped: true });
  });

  it("works with the JSONPath tool's own sample document", () => {
    const r = ok(runJsonToCsvWorkflow({ json: JSONPATH_SAMPLE, jsonPath: "$.users[?(@.role == 'admin')]" }));
    expect(r.rowCount).toBe(2);
    expect(r.columns).toContain("nickname");
  });
});

describe("runJsonToCsvWorkflow: invalid JSON", () => {
  it("reports a syntax error with its position", () => {
    const e = err(runJsonToCsvWorkflow({ json: '{"users": [\n  {"id": 1,}\n]}', jsonPath: "$.users" }));
    expect(e.step).toBe("parse");
    expect(e.code).toBe("invalid-json");
    expect(e.error.length).toBeGreaterThan(0);
    expect(e.line).toBe(2);
    expect(e.column).toBe(12);
  });

  it("rejects empty input", () => {
    const e = err(runJsonToCsvWorkflow({ json: "   \n", jsonPath: "$" }));
    expect(e.code).toBe("invalid-json");
    expect(e.error).toBe("Input is empty.");
    expect(e.progress).toEqual({});
  });
});

describe("runJsonToCsvWorkflow: invalid JSONPath", () => {
  it.each(["$.users[", "users[*]", "$.users[?(@.age >)]", ""])("rejects %j", (expr) => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: expr }));
    expect(e.step).toBe("select");
    expect(e.code).toBe("invalid-jsonpath");
    expect(e.error.length).toBeGreaterThan(0);
  });

  it("checks JSON before the expression, so a bad document is reported first", () => {
    const e = err(runJsonToCsvWorkflow({ json: "{", jsonPath: "$.users[" }));
    expect(e.code).toBe("invalid-json");
  });
});

describe("runJsonToCsvWorkflow: zero matches", () => {
  it("reports when nothing matches and still exposes the parsed root for hints", () => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.missing[*]" }));
    expect(e.step).toBe("select");
    expect(e.code).toBe("no-matches");
    expect(e.progress.parse?.topLevelKeys).toContain("users");
    expect(e.progress.select).toBeUndefined();
  });

  it("caps the top-level key hint and reports an array root", () => {
    const wide = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
    expect(err(runJsonToCsvWorkflow({ json: JSON.stringify(wide), jsonPath: "$.nope" })).progress.parse?.topLevelKeys).toHaveLength(20);
    const arr = err(runJsonToCsvWorkflow({ json: "[1,2,3]", jsonPath: "$.nope" }));
    expect(arr.progress.parse).toEqual({ rootType: "array", topLevelCount: 3, topLevelKeys: [] });
  });

  it("reports when the only match is an empty array", () => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.empty" }));
    expect(e.code).toBe("no-matches");
    expect(e.error).toMatch(/empty array/);
  });

  it("reports when a filter excludes every element", () => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users[?(@.id > 100)]" }));
    expect(e.code).toBe("no-matches");
  });
});

describe("runJsonToCsvWorkflow: values that cannot become CSV", () => {
  it("rejects a selection of primitives and suggests the parent objects", () => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users[*].name" }));
    expect(e.step).toBe("convert");
    expect(e.code).toBe("not-tabular");
    expect(e.error).toMatch(/3 strings/);
    expect(e.error).toMatch(/\$\.users\[\*\]/);
    expect(e.progress.select).toEqual({ matchCount: 3, rowCount: 3, unwrapped: false });
  });

  it("rejects an unwrapped array of primitives", () => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.names" }));
    expect(e.code).toBe("not-tabular");
    expect(e.error).toMatch(/2 strings/);
  });

  it("rejects a mix of objects and arrays", () => {
    const json = JSON.stringify({ items: [{ a: 1 }, [1, 2], { a: 2 }] });
    const e = err(runJsonToCsvWorkflow({ json, jsonPath: "$.items" }));
    expect(e.code).toBe("not-tabular");
    expect(e.error).toMatch(/2 objects and 1 array/);
  });

  it("rejects a primitive root", () => {
    const e = err(runJsonToCsvWorkflow({ json: "42", jsonPath: "$" }));
    expect(e.code).toBe("not-tabular");
    expect(e.error).toMatch(/1 number/);
  });

  it("rejects values nested too deeply to serialise", () => {
    const depth = 200_000;
    const json = `[{"v":${"[".repeat(depth)}${"]".repeat(depth)}}]`;
    const e = err(runJsonToCsvWorkflow({ json, jsonPath: "$" }));
    expect(e.step).toBe("convert");
    expect(e.code).toBe("not-tabular");
    expect(e.error).toMatch(/nested too deeply/);
  });
});

describe("runJsonToCsvWorkflow: limits", () => {
  it("rejects JSON text over the input cap before parsing it", () => {
    const json = `"${"x".repeat(WORKFLOW_LIMITS.maxInputChars)}"`; // one char over the cap once quoted
    const e = err(runJsonToCsvWorkflow({ json, jsonPath: "$" }));
    expect(e.step).toBe("input");
    expect(e.code).toBe("input-too-large");
  });

  it("rejects an over-long expression", () => {
    const jsonPath = `$${".a".repeat(WORKFLOW_LIMITS.maxExpressionChars)}`;
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath }));
    expect(e.code).toBe("expression-too-long");
  });

  it("rejects an unsupported delimiter", () => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users", delimiter: ":" as never }));
    expect(e.step).toBe("input");
    expect(e.code).toBe("invalid-delimiter");
  });

  it("caps the number of rows, whether matched directly or unwrapped", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ i }));
    const json = JSON.stringify({ rows });
    const limits = { maxRows: 5 };
    expect(err(runJsonToCsvWorkflow({ json, jsonPath: "$.rows" }, limits)).code).toBe("too-many-rows");
    expect(err(runJsonToCsvWorkflow({ json, jsonPath: "$.rows[*]" }, limits)).code).toBe("too-many-rows");
    expect(ok(runJsonToCsvWorkflow({ json, jsonPath: "$.rows[0:5]" }, limits)).rowCount).toBe(5);
  });

  it("maps the JSONPath engine's own match cap to a row limit error", () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => ({ i }));
    const e = err(runJsonToCsvWorkflow({ json: JSON.stringify(rows), jsonPath: "$[*]" }));
    expect(e.step).toBe("select");
    expect(e.code).toBe("too-many-rows");
    expect(e.error).toMatch(/Too many matches/);
  });

  it("caps the number of distinct columns", () => {
    const wide = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`k${i}`, i]));
    const e = err(runJsonToCsvWorkflow({ json: JSON.stringify([wide]), jsonPath: "$" }, { maxColumns: 3 }));
    expect(e.step).toBe("convert");
    expect(e.code).toBe("too-many-columns");
  });

  it("rejects a sparse selection that would explode into too many cells before building CSV", () => {
    // 50 rows with disjoint keys -> a 50 x 50 table from a tiny document.
    const rows = Array.from({ length: 50 }, (_, i) => ({ [`k${i}`]: i }));
    const e = err(runJsonToCsvWorkflow({ json: JSON.stringify(rows), jsonPath: "$" }, { maxCells: 2_000 }));
    expect(e.code).toBe("output-too-large");
    expect(e.error).toMatch(/2,500 cells/);
  });

  it("counts cells for array rows too", () => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.matrix" }, { maxCells: 5 }));
    expect(e.code).toBe("output-too-large");
  });

  it("rejects CSV text over the output cap", () => {
    const e = err(runJsonToCsvWorkflow({ json: SAMPLE, jsonPath: "$.users" }, { maxOutputChars: 20 }));
    expect(e.step).toBe("convert");
    expect(e.code).toBe("output-too-large");
  });

  it("never throws on hostile input", () => {
    const inputs = ["[", "{\"__proto__\": {\"x\": 1}}", "[[[[[[[[]]]]]]]]", "null", "\"\\u0000\"", "[1,2,3]"];
    for (const json of inputs) {
      for (const jsonPath of ["$", "$..*", "$[?(@.x =~ /(a+)+$/)]", "$[-1:0:-1]"]) {
        expect(() => runJsonToCsvWorkflow({ json, jsonPath })).not.toThrow();
      }
    }
  });
});

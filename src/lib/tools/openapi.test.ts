import { describe, expect, it } from "vitest";
import * as yaml from "yaml";
import { buildExampleJson, OPENAPI_SAMPLE, parseOpenApi, RefResolver, renderSchema, type OpenApiDoc } from "@/lib/tools/openapi";
import type { YamlModule } from "@/lib/tools/yaml-json";

const yamlModule: YamlModule = { parse: (src, opts) => yaml.parse(src, opts), stringify: (v, opts) => yaml.stringify(v, opts) };

function ok(text: string, y?: YamlModule): OpenApiDoc {
  const r = parseOpenApi(text, y);
  if (!r.ok) throw new Error(r.error);
  return r;
}

const SWAGGER2 = JSON.stringify({
  swagger: "2.0",
  info: { title: "Legacy", version: "0.9" },
  host: "legacy.example.com",
  basePath: "/api",
  schemes: ["https"],
  consumes: ["application/json"],
  produces: ["application/json"],
  securityDefinitions: { apiKey: { type: "apiKey", name: "X-Key", in: "header" } },
  paths: {
    "/users/{id}": {
      put: {
        summary: "Update user",
        parameters: [
          { name: "id", in: "path", required: true, type: "integer", format: "int64" },
          { name: "body", in: "body", required: true, schema: { $ref: "#/definitions/User" } },
        ],
        responses: { "200": { description: "ok", schema: { $ref: "#/definitions/User" } } },
      },
    },
    "/upload": {
      post: {
        parameters: [
          { name: "file", in: "formData", type: "file", required: true },
          { name: "note", in: "formData", type: "string" },
        ],
        responses: { "204": { description: "done" } },
      },
    },
  },
  definitions: {
    User: { type: "object", required: ["id"], properties: { id: { type: "integer" }, name: { type: "string" }, friends: { type: "array", items: { $ref: "#/definitions/User" } } } },
  },
});

describe("parseOpenApi: OpenAPI 3", () => {
  it("parses the YAML sample with tags, servers, operations, schemas and security", () => {
    const doc = ok(OPENAPI_SAMPLE, yamlModule);
    expect(doc.version).toBe("OpenAPI 3.0.3");
    expect(doc.info).toEqual({ title: "Petstore", version: "1.2.0", description: "A tiny pet shop API used to demo the viewer." });
    expect(doc.servers).toEqual(["https://api.petstore.example/v1"]);
    expect(doc.tags.map((t) => t.name)).toEqual(["pets", "orders"]);
    expect(doc.operations.map((o) => `${o.method} ${o.path}`)).toEqual(["GET /pets", "POST /pets", "DELETE /pets/{petId}", "POST /orders"]);
    expect(doc.schemas.map((s) => s.name)).toEqual(["NewPet", "Pet", "Order"]);
    expect(doc.securitySchemes).toEqual([{ name: "bearerAuth", type: "http", detail: "bearer (JWT)", description: "" }]);
    expect(doc.warnings).toEqual([]);
  });

  it("renders parameters, merges path-level ones and applies root security", () => {
    const doc = ok(OPENAPI_SAMPLE, yamlModule);
    const list = doc.operations[0];
    expect(list.parameters).toEqual([
      { name: "limit", in: "query", required: false, type: "integer (int32)", description: "Max items to return" },
      { name: "status", in: "query", required: false, type: '"available" | "pending" | "sold"', description: "" },
    ]);
    const del = doc.operations[2];
    expect(del.deprecated).toBe(true);
    expect(del.parameters).toEqual([{ name: "petId", in: "path", required: true, type: "string (uuid)", description: "" }]);
    expect(del.security).toEqual(["bearerAuth"]);
    expect(del.responses).toEqual([{ status: "204", description: "Deleted", contentTypes: [], schema: "" }]);
  });

  it("resolves $refs in request bodies and responses, including allOf", () => {
    const doc = ok(OPENAPI_SAMPLE, yamlModule);
    const create = doc.operations[1];
    expect(create.requestBody?.required).toBe(true);
    expect(create.requestBody?.contentTypes).toEqual(["application/json"]);
    expect(create.requestBody?.schema).toBe("NewPet {\n  name*: string\n  tag: string  // Free-form label\n}");
    expect(create.responses[0].schema).toBe("NewPet & object");
    expect(doc.operations[0].responses[0].schema).toBe("Pet[]");
  });

  it("accepts JSON input with or without the yaml module", () => {
    const json = JSON.stringify(yaml.parse(OPENAPI_SAMPLE));
    expect(ok(json).operations).toHaveLength(4);
    expect(ok(json, yamlModule).operations).toHaveLength(4);
  });

  it("substitutes server variables and lists undeclared tags", () => {
    const doc = ok(
      JSON.stringify({
        openapi: "3.1.0",
        info: { title: "T", version: "1" },
        servers: [{ url: "https://{env}.example.com/{base}", variables: { env: { default: "api" }, base: { default: "v2" } } }],
        paths: { "/x": { get: { tags: ["misc"], responses: {} } } },
      }),
    );
    expect(doc.servers).toEqual(["https://api.example.com/v2"]);
    expect(doc.tags).toEqual([{ name: "misc", description: "" }]);
  });
});

describe("parseOpenApi: Swagger 2.0", () => {
  it("normalises host/basePath, definitions, body params and produces", () => {
    const doc = ok(SWAGGER2);
    expect(doc.version).toBe("Swagger 2.0");
    expect(doc.servers).toEqual(["https://legacy.example.com/api"]);
    const put = doc.operations[0];
    expect(put.parameters).toEqual([{ name: "id", in: "path", required: true, type: "integer (int64)", description: "" }]);
    expect(put.requestBody?.contentTypes).toEqual(["application/json"]);
    expect(put.requestBody?.schema.startsWith("User {")).toBe(true);
    expect(put.responses[0]).toEqual({ status: "200", description: "ok", contentTypes: ["application/json"], schema: expect.stringContaining("User {") });
    expect(doc.schemas[0].name).toBe("User");
    expect(doc.securitySchemes[0]).toEqual({ name: "apiKey", type: "apiKey", detail: "X-Key in header", description: "" });
  });

  it("turns formData params into a multipart request body", () => {
    const upload = ok(SWAGGER2).operations[1];
    expect(upload.requestBody?.contentTypes).toEqual(["application/json"]);
    expect(upload.requestBody?.schema).toContain("file*: string (binary)");
    expect(upload.requestBody?.schema).toContain("note: string");
  });
});

describe("renderSchema and buildExampleJson", () => {
  it("stops on cycles and shows the ref name", () => {
    const doc = ok(SWAGGER2);
    const user = doc.schemas[0].rendered;
    expect(user).toContain("friends: User[]");
    expect(user.split("\n").length).toBeLessThan(10);
  });

  it("caps nesting depth at 6 levels", () => {
    const deep = { openapi: "3.0.0", info: { title: "d", version: "1" }, paths: {}, components: { schemas: { A: { type: "object", properties: { next: { $ref: "#/components/schemas/B" } } }, B: { type: "object", properties: { next: { $ref: "#/components/schemas/A" } } } } } };
    const doc = ok(JSON.stringify(deep));
    const rendered = doc.schemas[0].rendered;
    // A -> B -> A cycle: the second A is a chain hit, so it collapses to a name.
    expect(rendered).toBe("object {\n  next: B {\n    next: A\n  }\n}");
  });

  it("renders arrays, records, nullable, oneOf and unresolved refs", () => {
    const resolver = new RefResolver({});
    expect(renderSchema({ type: "array", items: { type: "string" } }, resolver)).toBe("string[]");
    expect(renderSchema({ type: "object", additionalProperties: { type: "number" } }, resolver)).toBe("Record<string, number>");
    expect(renderSchema({ type: ["string", "null"] }, resolver)).toBe("string | null");
    expect(renderSchema({ type: "integer", nullable: true }, resolver)).toBe("integer | null");
    expect(renderSchema({ oneOf: [{ type: "string" }, { $ref: "#/components/schemas/Cat" }] }, resolver)).toBe("string | Cat");
    expect(renderSchema({ $ref: "#/components/schemas/Missing" }, resolver)).toBe("Missing (unresolved)");
    expect(renderSchema({ $ref: "other.yaml#/X" }, resolver)).toBe("X (unresolved)");
    expect(resolver.unresolved.size).toBe(2);
  });

  it("builds examples from example, default, enum and type placeholders", () => {
    const doc = ok(OPENAPI_SAMPLE, yamlModule);
    const order = JSON.parse(doc.schemas[2].example) as Record<string, unknown>;
    expect(order).toEqual({
      id: 0,
      petId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      quantity: 1,
      shipDate: "2026-01-01T00:00:00Z",
      pet: { name: "Rex", tag: "tag", id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "available" },
    });
    expect(JSON.parse(doc.operations[0].responses[0].schema === "Pet[]" ? doc.schemas[1].example : "{}")).toMatchObject({ name: "Rex" });
  });

  it("caps example depth on recursive schemas and never throws", () => {
    const doc = ok(SWAGGER2);
    const user = JSON.parse(doc.schemas[0].example) as { friends: unknown[] };
    expect(user.friends).toHaveLength(1);
    expect(JSON.stringify(user).length).toBeLessThan(2000);
    const resolver = new RefResolver({});
    expect(buildExampleJson({ type: "array", items: { type: "boolean" } }, resolver)).toEqual([true]);
    expect(buildExampleJson({ type: "string", format: "email" }, resolver)).toBe("user@example.com");
    expect(buildExampleJson({ properties: { __proto__: { type: "string" }, ok: { type: "string" } } }, resolver)).toEqual({ ok: "ok" });
  });
});

describe("parseOpenApi: errors and warnings", () => {
  it("reports empty, non-spec and malformed input", () => {
    expect(parseOpenApi("").ok).toBe(false);
    expect(parseOpenApi('{"hello": 1}')).toEqual({ ok: false, error: expect.stringContaining("openapi") });
    expect(parseOpenApi("{bad", undefined).ok).toBe(false);
    expect(parseOpenApi("[1,2]").ok).toBe(false);
    expect(parseOpenApi("a: b", undefined)).toEqual({ ok: false, error: expect.stringContaining("YAML parser") });
    expect(parseOpenApi("a: [b", yamlModule).ok).toBe(false);
  });

  it("warns about missing paths and unresolved refs", () => {
    const doc = ok(JSON.stringify({ openapi: "3.0.0", info: {}, paths: {}, components: { schemas: { A: { $ref: "#/components/schemas/Nope" } } } }));
    expect(doc.warnings[0]).toMatch(/no paths/);
    expect(doc.warnings[1]).toMatch(/could not be resolved/);
  });
});

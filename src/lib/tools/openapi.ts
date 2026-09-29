import type { YamlModule } from "@/lib/tools/yaml-json";

/**
 * OpenAPI / Swagger viewer: parses a spec (JSON or YAML), normalises 2.0 and
 * 3.x into one shape, resolves local $refs and renders schemas compactly.
 * Everything runs in memory; the spec never leaves the page.
 */

export interface OpenApiParameter {
  name: string;
  in: string;
  required: boolean;
  type: string;
  description: string;
}

export interface OpenApiBody {
  required: boolean;
  contentTypes: string[];
  schema: string;
  example: string;
}

export interface OpenApiResponse {
  status: string;
  description: string;
  contentTypes: string[];
  schema: string;
}

export interface Operation {
  id: string;
  method: string;
  path: string;
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  deprecated: boolean;
  parameters: OpenApiParameter[];
  requestBody: OpenApiBody | null;
  responses: OpenApiResponse[];
  security: string[];
}

export interface SchemaSummary {
  name: string;
  type: string;
  rendered: string;
  example: string;
}

export interface SecurityScheme {
  name: string;
  type: string;
  detail: string;
  description: string;
}

export interface OpenApiDoc {
  ok: true;
  version: string;
  info: { title: string; version: string; description: string };
  servers: string[];
  tags: Array<{ name: string; description: string }>;
  operations: Operation[];
  schemas: SchemaSummary[];
  securitySchemes: SecurityScheme[];
  warnings: string[];
}

export interface OpenApiError {
  ok: false;
  error: string;
}

type Obj = Record<string, unknown>;

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
const MAX_INPUT = 2_000_000;
const MAX_OPERATIONS = 2000;
export const RENDER_DEPTH = 6;
export const EXAMPLE_DEPTH = 5;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

/** Resolver for local JSON pointers (#/components/schemas/X). External refs are unsupported. */
export class RefResolver {
  readonly unresolved = new Set<string>();
  constructor(private readonly root: unknown) {}

  resolve(ref: string): unknown {
    if (!ref.startsWith("#/")) {
      this.unresolved.add(ref);
      return undefined;
    }
    let cur: unknown = this.root;
    for (const seg of ref.slice(2).split("/")) {
      const key = seg.replace(/~1/g, "/").replace(/~0/g, "~");
      if (isObj(cur) && key in cur) cur = cur[key];
      else if (Array.isArray(cur) && /^\d+$/.test(key)) cur = cur[Number(key)];
      else {
        this.unresolved.add(ref);
        return undefined;
      }
    }
    return cur;
  }
}

export function refName(ref: string): string {
  const last = ref.split("/").pop() ?? ref;
  return last.replace(/~1/g, "/").replace(/~0/g, "~");
}

function nullable(s: Obj): boolean {
  return s.nullable === true || (Array.isArray(s.type) && s.type.includes("null"));
}

function primaryType(s: Obj): string {
  if (Array.isArray(s.type)) return str(s.type.find((t) => t !== "null")) || "";
  return str(s.type);
}

function formatEnum(values: unknown[]): string {
  const shown = values.slice(0, 8).map((v) => JSON.stringify(v)).join(" | ");
  return values.length > 8 ? `${shown} | …` : shown;
}

/**
 * Render a schema as a compact readable tree. `inline` keeps objects on one line
 * (used in parameter tables); otherwise properties are listed with types,
 * a `*` marker for required fields, enum values and formats.
 */
export function renderSchema(schema: unknown, resolver: RefResolver, depth = 0, inline = false, chain: string[] = []): string {
  if (!isObj(schema)) return typeof schema === "boolean" ? (schema ? "any" : "never") : "any";
  if (typeof schema.$ref === "string") {
    const name = refName(schema.$ref);
    if (chain.includes(schema.$ref) || depth >= RENDER_DEPTH || inline) return name;
    const target = resolver.resolve(schema.$ref);
    if (target === undefined) return `${name} (unresolved)`;
    const body = renderSchema(target, resolver, depth, inline, [...chain, schema.$ref]);
    return body.startsWith("object {") ? `${name} ${body.slice("object ".length)}` : body;
  }
  const suffix = nullable(schema) ? " | null" : "";
  const enumValues = Array.isArray(schema.enum) ? schema.enum : null;
  if (enumValues && enumValues.length) return formatEnum(enumValues) + suffix;
  if (schema.const !== undefined) return JSON.stringify(schema.const) + suffix;

  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const list = schema[key];
    if (Array.isArray(list) && list.length) {
      const sep = key === "allOf" ? " & " : " | ";
      const parts = list.slice(0, 10).map((s) => renderSchema(s, resolver, depth + 1, true, chain));
      return parts.join(sep) + suffix;
    }
  }

  const type = primaryType(schema);
  if (type === "array" || (isObj(schema.items) && !type)) {
    const item = renderSchema(schema.items, resolver, depth + 1, true, chain);
    return `${item.includes(" ") ? `(${item})` : item}[]${suffix}`;
  }
  const props = isObj(schema.properties) ? schema.properties : null;
  if (type === "object" || props || schema.additionalProperties !== undefined) {
    const required = new Set(Array.isArray(schema.required) ? schema.required.map(str) : []);
    if (props && Object.keys(props).length) {
      if (inline || depth >= RENDER_DEPTH) return `object${suffix}`;
      const pad = "  ".repeat(depth + 1);
      const lines = Object.entries(props)
        .slice(0, 200)
        .map(([name, sub]) => {
          const rendered = renderSchema(sub, resolver, depth + 1, false, chain);
          const desc = isObj(sub) && typeof sub.description === "string" ? `  // ${sub.description.split("\n")[0].slice(0, 80)}` : "";
          return `${pad}${name}${required.has(name) ? "*" : ""}: ${rendered}${desc}`;
        });
      return `object {\n${lines.join("\n")}\n${"  ".repeat(depth)}}${suffix}`;
    }
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
      const val = schema.additionalProperties === true ? "any" : renderSchema(schema.additionalProperties, resolver, depth + 1, true, chain);
      return `Record<string, ${val}>${suffix}`;
    }
    return `object${suffix}`;
  }
  if (!type) return `any${suffix}`;
  const format = typeof schema.format === "string" ? ` (${schema.format})` : "";
  return `${type}${format}${suffix}`;
}

function placeholderString(format: string, name: string): string {
  switch (format) {
    case "uuid":
      return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    case "date-time":
      return "2026-01-01T00:00:00Z";
    case "date":
      return "2026-01-01";
    case "time":
      return "12:00:00";
    case "email":
      return "user@example.com";
    case "uri":
    case "url":
      return "https://example.com";
    case "hostname":
      return "example.com";
    case "ipv4":
      return "192.0.2.1";
    case "ipv6":
      return "2001:db8::1";
    case "byte":
      return "U3dhZ2dlciByb2Nrcw==";
    case "binary":
      return "<binary>";
    case "password":
      return "********";
    default:
      return name || "string";
  }
}

/** Build an example value from a schema: example → default → enum[0] → type placeholders. */
export function buildExampleJson(schema: unknown, resolver: RefResolver, depth = 0, name = ""): unknown {
  if (!isObj(schema)) return null;
  if (typeof schema.$ref === "string") {
    if (depth >= EXAMPLE_DEPTH) return null;
    const target = resolver.resolve(schema.$ref);
    return target === undefined ? null : buildExampleJson(target, resolver, depth + 1, refName(schema.$ref));
  }
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  for (const key of ["oneOf", "anyOf"] as const) {
    const list = schema[key];
    if (Array.isArray(list) && list.length) return buildExampleJson(list[0], resolver, depth + 1, name);
  }
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    const merged: Obj = {};
    for (const part of schema.allOf.slice(0, 20)) {
      const v = buildExampleJson(part, resolver, depth + 1, name);
      if (isObj(v)) Object.assign(merged, v);
    }
    return merged;
  }
  const type = primaryType(schema);
  const props = isObj(schema.properties) ? schema.properties : null;
  if (type === "object" || props) {
    if (depth >= EXAMPLE_DEPTH) return {};
    const out: Obj = {};
    for (const [k, sub] of Object.entries(props ?? {}).slice(0, 100)) {
      if (k === "__proto__") continue;
      out[k] = buildExampleJson(sub, resolver, depth + 1, k);
    }
    if (!props && isObj(schema.additionalProperties)) out.key = buildExampleJson(schema.additionalProperties, resolver, depth + 1, "value");
    return out;
  }
  if (type === "array") return depth >= EXAMPLE_DEPTH ? [] : [buildExampleJson(schema.items, resolver, depth + 1, name)];
  if (type === "integer") return typeof schema.minimum === "number" ? schema.minimum : 0;
  if (type === "number") return typeof schema.minimum === "number" ? schema.minimum : 0;
  if (type === "boolean") return true;
  if (type === "null") return null;
  if (type === "string") return placeholderString(str(schema.format), name);
  return null;
}

function exampleText(schema: unknown, resolver: RefResolver): string {
  if (schema === undefined) return "";
  return JSON.stringify(buildExampleJson(schema, resolver), null, 2) ?? "";
}

function detectInput(text: string, yaml?: YamlModule): { ok: true; value: unknown } | OpenApiError {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Paste an OpenAPI or Swagger document." };
  if (trimmed.length > MAX_INPUT) return { ok: false, error: "The document is too large (limit 2 MB)." };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { ok: true, value: JSON.parse(trimmed) };
    } catch (e) {
      if (!yaml) return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : "parse error"}` };
    }
  }
  if (!yaml) return { ok: false, error: "The YAML parser is still loading. Paste JSON or wait a moment." };
  try {
    return { ok: true, value: yaml.parse(trimmed, { prettyErrors: true }) };
  } catch (e) {
    return { ok: false, error: `Could not parse YAML: ${e instanceof Error ? e.message.split("\n")[0] : "parse error"}` };
  }
}

function mediaTypes(content: unknown): string[] {
  return isObj(content) ? Object.keys(content).slice(0, 20) : [];
}

function firstSchema(content: unknown): unknown {
  if (!isObj(content)) return undefined;
  for (const mt of Object.values(content)) if (isObj(mt) && mt.schema !== undefined) return mt.schema;
  return undefined;
}

function securityNames(sec: unknown): string[] {
  if (!Array.isArray(sec)) return [];
  const names: string[] = [];
  for (const req of sec) if (isObj(req)) names.push(...Object.keys(req));
  return Array.from(new Set(names));
}

function parseParam(p: unknown, resolver: RefResolver, swagger2: boolean): OpenApiParameter | null {
  const param = isObj(p) && typeof p.$ref === "string" ? resolver.resolve(p.$ref) : p;
  if (!isObj(param)) return null;
  const inLoc = str(param.in);
  if (swagger2 && (inLoc === "body" || inLoc === "formData")) return null;
  const schema = param.schema !== undefined ? param.schema : swagger2 ? { type: param.type, format: param.format, enum: param.enum, items: param.items } : undefined;
  return {
    name: str(param.name),
    in: inLoc,
    required: param.required === true || inLoc === "path",
    type: renderSchema(schema, resolver, 0, true),
    description: str(param.description),
  };
}

function swagger2Body(params: unknown[], op: Obj, root: Obj, resolver: RefResolver): OpenApiBody | null {
  const resolvedParams = params.map((p) => (isObj(p) && typeof p.$ref === "string" ? resolver.resolve(p.$ref) : p)).filter(isObj);
  const body = resolvedParams.find((p) => p.in === "body");
  const consumes = (Array.isArray(op.consumes) ? op.consumes : Array.isArray(root.consumes) ? root.consumes : []).map(str);
  if (body) {
    return { required: body.required === true, contentTypes: consumes.length ? consumes : ["application/json"], schema: renderSchema(body.schema, resolver), example: exampleText(body.schema, resolver) };
  }
  const form = resolvedParams.filter((p) => p.in === "formData");
  if (!form.length) return null;
  const properties: Obj = {};
  const required: string[] = [];
  for (const f of form) {
    const name = str(f.name);
    if (name === "__proto__") continue;
    properties[name] = { type: f.type === "file" ? "string" : f.type, format: f.type === "file" ? "binary" : f.format, description: f.description, enum: f.enum };
    if (f.required === true) required.push(name);
  }
  const schema = { type: "object", properties, required };
  const ct = consumes.length ? consumes : form.some((f) => f.type === "file") ? ["multipart/form-data"] : ["application/x-www-form-urlencoded"];
  return { required: required.length > 0, contentTypes: ct, schema: renderSchema(schema, resolver), example: exampleText(schema, resolver) };
}

function parseResponses(responses: unknown, op: Obj, root: Obj, resolver: RefResolver, swagger2: boolean): OpenApiResponse[] {
  if (!isObj(responses)) return [];
  const produces = (Array.isArray(op.produces) ? op.produces : Array.isArray(root.produces) ? root.produces : []).map(str);
  return Object.entries(responses)
    .slice(0, 50)
    .map(([status, raw]) => {
      const res = isObj(raw) && typeof raw.$ref === "string" ? resolver.resolve(raw.$ref) : raw;
      if (!isObj(res)) return { status, description: "", contentTypes: [], schema: "" };
      const schema = swagger2 ? res.schema : firstSchema(res.content);
      const contentTypes = swagger2 ? (res.schema !== undefined ? produces : []) : mediaTypes(res.content);
      return { status, description: str(res.description), contentTypes, schema: schema === undefined ? "" : renderSchema(schema, resolver) };
    });
}

function serverList(root: Obj, swagger2: boolean): string[] {
  if (swagger2) {
    const host = str(root.host);
    if (!host) return str(root.basePath) ? [str(root.basePath)] : [];
    const schemes = Array.isArray(root.schemes) && root.schemes.length ? root.schemes.map(str) : ["https"];
    return schemes.map((s) => `${s}://${host}${str(root.basePath)}`);
  }
  if (!Array.isArray(root.servers)) return [];
  return root.servers.slice(0, 20).flatMap((s) => {
    if (!isObj(s)) return [];
    let url = str(s.url);
    if (isObj(s.variables)) {
      for (const [k, v] of Object.entries(s.variables)) url = url.split(`{${k}}`).join(isObj(v) ? str(v.default) : "");
    }
    return [url];
  });
}

function parseSecuritySchemes(defs: unknown): SecurityScheme[] {
  if (!isObj(defs)) return [];
  return Object.entries(defs)
    .slice(0, 50)
    .map(([name, raw]) => {
      if (!isObj(raw)) return { name, type: "unknown", detail: "", description: "" };
      const type = str(raw.type);
      let detail = "";
      if (type === "http") detail = `${str(raw.scheme)}${raw.bearerFormat ? ` (${str(raw.bearerFormat)})` : ""}`;
      else if (type === "apiKey") detail = `${str(raw.name)} in ${str(raw.in)}`;
      else if (type === "oauth2") detail = isObj(raw.flows) ? Object.keys(raw.flows).join(", ") : str(raw.flow);
      else if (type === "openIdConnect") detail = str(raw.openIdConnectUrl);
      else if (type === "basic") detail = "HTTP basic";
      return { name, type, detail, description: str(raw.description) };
    });
}

export function parseOpenApi(text: string, yaml?: YamlModule): OpenApiDoc | OpenApiError {
  const input = detectInput(text, yaml);
  if (!input.ok) return input;
  const root = input.value;
  if (!isObj(root)) return { ok: false, error: "The document must be an object with an openapi or swagger field." };
  const swagger2 = str(root.swagger).startsWith("2");
  const version = swagger2 ? `Swagger ${str(root.swagger)}` : typeof root.openapi === "string" ? `OpenAPI ${root.openapi}` : "";
  if (!version) return { ok: false, error: "Missing “openapi: 3.x.y” or “swagger: 2.0”. Is this an API description?" };

  const warnings: string[] = [];
  const resolver = new RefResolver(root);
  const info = isObj(root.info) ? root.info : {};
  const paths = isObj(root.paths) ? root.paths : {};
  if (!Object.keys(paths).length) warnings.push("The document declares no paths.");

  const operations: Operation[] = [];
  const usedTags = new Set<string>();
  outer: for (const [path, rawItem] of Object.entries(paths)) {
    const item = isObj(rawItem) && typeof rawItem.$ref === "string" ? resolver.resolve(rawItem.$ref) : rawItem;
    if (!isObj(item)) continue;
    const pathParams = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      const op = item[method];
      if (!isObj(op)) continue;
      if (operations.length >= MAX_OPERATIONS) {
        warnings.push(`Only the first ${MAX_OPERATIONS} operations are shown.`);
        break outer;
      }
      const opParams = Array.isArray(op.parameters) ? op.parameters : [];
      // Operation-level parameters override path-level ones with the same name + location.
      const merged = new Map<string, OpenApiParameter>();
      for (const p of [...pathParams, ...opParams]) {
        const parsed = parseParam(p, resolver, swagger2);
        if (parsed) merged.set(`${parsed.in}:${parsed.name}`, parsed);
      }
      let requestBody: OpenApiBody | null = null;
      if (swagger2) requestBody = swagger2Body([...pathParams, ...opParams], op, root, resolver);
      else if (op.requestBody !== undefined) {
        const rb = isObj(op.requestBody) && typeof op.requestBody.$ref === "string" ? resolver.resolve(op.requestBody.$ref) : op.requestBody;
        if (isObj(rb)) {
          const schema = firstSchema(rb.content);
          requestBody = { required: rb.required === true, contentTypes: mediaTypes(rb.content), schema: schema === undefined ? "" : renderSchema(schema, resolver), example: exampleText(schema, resolver) };
        }
      }
      const tags = Array.isArray(op.tags) ? op.tags.map(str).filter(Boolean) : [];
      tags.forEach((t) => usedTags.add(t));
      operations.push({
        id: `${method}:${path}`,
        method: method.toUpperCase(),
        path,
        operationId: str(op.operationId),
        summary: str(op.summary),
        description: str(op.description),
        tags,
        deprecated: op.deprecated === true,
        parameters: Array.from(merged.values()),
        requestBody,
        responses: parseResponses(op.responses, op, root, resolver, swagger2),
        security: securityNames(op.security !== undefined ? op.security : root.security),
      });
    }
  }

  const schemaSource = swagger2 ? root.definitions : isObj(root.components) ? root.components.schemas : undefined;
  const schemaPrefix = swagger2 ? "#/definitions/" : "#/components/schemas/";
  const schemas: SchemaSummary[] = isObj(schemaSource)
    ? Object.entries(schemaSource)
        .slice(0, 500)
        .map(([name, s]) => ({
          name,
          type: renderSchema(s, resolver, 0, true),
          // Seed the chain with the schema's own ref so self-references collapse to the name.
          rendered: renderSchema(s, resolver, 0, false, [`${schemaPrefix}${name}`]),
          example: exampleText(s, resolver),
        }))
    : [];

  const declaredTags = Array.isArray(root.tags) ? root.tags.filter(isObj).map((t) => ({ name: str(t.name), description: str(t.description) })) : [];
  const tags = [...declaredTags];
  for (const t of usedTags) if (!tags.some((d) => d.name === t)) tags.push({ name: t, description: "" });

  if (resolver.unresolved.size) {
    const list = Array.from(resolver.unresolved).slice(0, 5).join(", ");
    warnings.push(`${resolver.unresolved.size} $ref${resolver.unresolved.size > 1 ? "s" : ""} could not be resolved (only local #/ refs are supported): ${list}`);
  }

  return {
    ok: true,
    version,
    info: { title: str(info.title), version: str(info.version), description: str(info.description) },
    servers: serverList(root, swagger2),
    tags,
    operations,
    schemas,
    securitySchemes: parseSecuritySchemes(swagger2 ? root.securityDefinitions : isObj(root.components) ? root.components.securitySchemes : undefined),
    warnings,
  };
}

export const OPENAPI_SAMPLE = `openapi: 3.0.3
info:
  title: Petstore
  version: 1.2.0
  description: A tiny pet shop API used to demo the viewer.
servers:
  - url: https://api.petstore.example/v1
tags:
  - name: pets
    description: Everything about pets
  - name: orders
    description: Purchases
paths:
  /pets:
    get:
      tags: [pets]
      summary: List pets
      operationId: listPets
      parameters:
        - name: limit
          in: query
          description: Max items to return
          schema: { type: integer, format: int32, default: 20 }
        - name: status
          in: query
          schema: { type: string, enum: [available, pending, sold] }
      responses:
        "200":
          description: A page of pets
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/Pet" }
    post:
      tags: [pets]
      summary: Create a pet
      operationId: createPet
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/NewPet" }
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Pet" }
        "400":
          description: Invalid input
  /pets/{petId}:
    parameters:
      - name: petId
        in: path
        required: true
        schema: { type: string, format: uuid }
    delete:
      tags: [pets]
      summary: Delete a pet
      operationId: deletePet
      deprecated: true
      responses:
        "204": { description: Deleted }
  /orders:
    post:
      tags: [orders]
      summary: Place an order
      operationId: placeOrder
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Order" }
      responses:
        "201":
          description: Order accepted
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Order" }
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    NewPet:
      type: object
      required: [name]
      properties:
        name: { type: string, example: Rex }
        tag: { type: string, description: Free-form label }
    Pet:
      allOf:
        - $ref: "#/components/schemas/NewPet"
        - type: object
          required: [id]
          properties:
            id: { type: string, format: uuid }
            status: { type: string, enum: [available, pending, sold] }
    Order:
      type: object
      required: [petId, quantity]
      properties:
        id: { type: integer, format: int64, readOnly: true }
        petId: { type: string, format: uuid }
        quantity: { type: integer, minimum: 1 }
        shipDate: { type: string, format: date-time }
        pet: { $ref: "#/components/schemas/Pet" }
security:
  - bearerAuth: []
`;

import type { JsonValue } from "@/lib/tools/json";

export type Delimiter = "," | ";" | "\t" | "|";

export interface CsvParseOptions {
  delimiter?: Delimiter | "auto";
  header?: boolean;
  infer?: boolean;
}

export interface CsvParseResult {
  ok: boolean;
  error?: string;
  delimiter: Delimiter;
  headers: string[];
  rows: JsonValue[][];
  /** Row objects when headers are used, else arrays */
  data: JsonValue;
  warnings: string[];
}

export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const candidates: Delimiter[] = [",", ";", "\t", "|"];
  let best: Delimiter = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = sample.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** RFC 4180 tokenizer: quoted fields, doubled quotes, delimiters/newlines inside quotes. */
export function parseCsvRows(text: string, delimiter: Delimiter): { rows: string[][]; error?: string } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/^﻿/, "");
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (field.length === 0) {
        inQuotes = true;
        i++;
        continue;
      }
      field += c; // stray quote inside unquoted field: keep literally
      i++;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (inQuotes) return { rows, error: "Unterminated quoted field: a closing \" is missing." };
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop trailing fully-empty rows
  while (rows.length && rows[rows.length - 1].every((f) => f === "")) rows.pop();
  return { rows };
}

function inferValue(s: string): JsonValue {
  if (s === "") return "";
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s) && s.length < 16) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return s;
}

export function csvToJson(text: string, opts: CsvParseOptions = {}): CsvParseResult {
  const delimiter: Delimiter = !opts.delimiter || opts.delimiter === "auto" ? detectDelimiter(text) : opts.delimiter;
  const header = opts.header ?? true;
  const infer = opts.infer ?? true;
  const warnings: string[] = [];
  if (!text.trim()) return { ok: false, error: "Input is empty.", delimiter, headers: [], rows: [], data: [], warnings };
  const { rows: raw, error } = parseCsvRows(text, delimiter);
  if (error) return { ok: false, error, delimiter, headers: [], rows: [], data: [], warnings };
  if (!raw.length) return { ok: false, error: "No rows found.", delimiter, headers: [], rows: [], data: [], warnings };

  let width = 0;
  for (const r of raw) if (r.length > width) width = r.length;
  let headers: string[] = [];
  let body = raw;
  if (header) {
    headers = raw[0].map((h, i) => (h.trim() ? h.trim() : `column${i + 1}`));
    const seen = new Map<string, number>();
    headers = headers.map((h) => {
      const n = (seen.get(h) ?? 0) + 1;
      seen.set(h, n);
      return n > 1 ? `${h}_${n}` : h;
    });
    body = raw.slice(1);
    while (headers.length < width) headers.push(`column${headers.length + 1}`);
  }
  const rows = body.map((r, idx) => {
    if (r.length !== width && r.length !== 1) warnings.push(`Row ${idx + (header ? 2 : 1)} has ${r.length} fields, expected ${width}.`);
    const padded = [...r];
    while (padded.length < width) padded.push("");
    return padded.map((f) => (infer ? inferValue(f) : f));
  });
  const data: JsonValue = header ? rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))) : rows;
  return { ok: true, delimiter, headers, rows, data, warnings: warnings.slice(0, 5) };
}

function escapeField(v: JsonValue, delimiter: Delimiter): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (s.includes('"') || s.includes(delimiter) || /[\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function jsonToCsv(value: JsonValue, delimiter: Delimiter = ","): { ok: boolean; csv: string; error?: string; columns: string[] } {
  let rows: JsonValue[];
  if (Array.isArray(value)) rows = value;
  else if (value && typeof value === "object") rows = [value];
  else return { ok: false, csv: "", error: "Expected a JSON array of objects (or a single object).", columns: [] };
  if (!rows.length) return { ok: true, csv: "", columns: [] };

  const allObjects = rows.every((r) => r && typeof r === "object" && !Array.isArray(r));
  if (allObjects) {
    const columns: string[] = [];
    for (const r of rows) for (const k of Object.keys(r as object)) if (!columns.includes(k)) columns.push(k);
    const lines = [columns.map((c) => escapeField(c, delimiter)).join(delimiter)];
    for (const r of rows) lines.push(columns.map((c) => escapeField((r as Record<string, JsonValue>)[c] ?? null, delimiter)).join(delimiter));
    return { ok: true, csv: lines.join("\n"), columns };
  }
  const allArrays = rows.every((r) => Array.isArray(r));
  if (allArrays) {
    return { ok: true, csv: rows.map((r) => (r as JsonValue[]).map((v) => escapeField(v, delimiter)).join(delimiter)).join("\n"), columns: [] };
  }
  return { ok: false, csv: "", error: "Array must contain only objects (rows with columns) or only arrays.", columns: [] };
}

export const CSV_SAMPLE = `id,name,email,active,score
1,"Doe, John",john@example.com,true,88.5
2,Jane Smith,jane@example.com,false,92
3,"Quote ""Q"" Test",q@example.com,true,`;

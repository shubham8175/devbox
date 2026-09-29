import { describe, expect, it } from "vitest";
import { MAX_NOTES, MAX_NOTE_BYTES, createNote, exportNotes, importNotes, isNote, isNoteArray, mergeNotes, noteStats, noteTitle, searchNotes, sortNotes, titleFromBody, updateNote, type Note } from "@/lib/tools/scratchpad";

const T0 = 1_700_000_000_000;
const mk = (over: Partial<Note> = {}, now = T0): Note => ({ ...createNote({ title: "t", body: "b" }, now), ...over });

describe("createNote / updateNote", () => {
  it("creates a note with defaults, timestamps and a unique id", () => {
    const a = createNote({}, T0);
    const b = createNote({ title: "x".repeat(300), body: "hi", language: "sql", pinned: true }, T0);
    expect(a).toMatchObject({ title: "", body: "", language: "text", pinned: false, createdAt: T0, updatedAt: T0 });
    expect(b.title).toHaveLength(200);
    expect(b).toMatchObject({ language: "sql", pinned: true });
    expect(a.id).not.toBe(b.id);
    expect(isNote(a)).toBe(true);
  });

  it("bumps updatedAt for content changes but not for pin toggles, never going backwards", () => {
    const n = mk({ updatedAt: T0 + 5000 });
    expect(updateNote(n, { pinned: true }, T0 + 10).updatedAt).toBe(T0 + 5000);
    expect(updateNote(n, { body: "new" }, T0 + 10).updatedAt).toBe(T0 + 5000);
    expect(updateNote(n, { body: "new" }, T0 + 9000).updatedAt).toBe(T0 + 9000);
    expect(updateNote(n, { body: "b" }, T0 + 9000)).toEqual(n);
    expect(updateNote(n, { title: "y".repeat(300) }, T0 + 9000).title).toHaveLength(200);
  });
});

describe("sortNotes / searchNotes / titles / stats", () => {
  const notes = [mk({ id: "a", title: "Alpha", body: "select * from users", language: "sql", updatedAt: T0 + 1 }), mk({ id: "b", title: "Beta", body: "# Heading\ntext", language: "markdown", updatedAt: T0 + 3 }), mk({ id: "c", title: "", body: "\n\n  ## Third note here", pinned: true, updatedAt: T0 + 2 })];

  it("sorts pinned first, then most recently updated, without mutating", () => {
    const sorted = sortNotes(notes);
    expect(sorted.map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(notes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("searches title, body and language, all terms required, case-insensitive", () => {
    expect(searchNotes(notes, "").map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(searchNotes(notes, "SELECT users").map((n) => n.id)).toEqual(["a"]);
    expect(searchNotes(notes, "markdown").map((n) => n.id)).toEqual(["b"]);
    expect(searchNotes(notes, "third").map((n) => n.id)).toEqual(["c"]);
    expect(searchNotes(notes, "alpha beta")).toEqual([]);
  });

  it("derives titles from the body", () => {
    expect(titleFromBody("")).toBe("Untitled");
    expect(titleFromBody("\n  # Hello world\nmore")).toBe("Hello world");
    expect(titleFromBody("- item")).toBe("item");
    expect(titleFromBody("x".repeat(100))).toHaveLength(60);
    expect(noteTitle(notes[2])).toBe("Third note here");
    expect(noteTitle(notes[0])).toBe("Alpha");
  });

  it("computes stats", () => {
    const s = noteStats(notes);
    expect(s.count).toBe(3);
    expect(s.pinned).toBe(1);
    expect(s.languages).toEqual({ sql: 1, markdown: 1, text: 1 });
    expect(s.bytes).toBe(notes.reduce((n, x) => n + new TextEncoder().encode(x.body + x.title).length, 0));
    expect(noteStats([])).toEqual({ count: 0, pinned: 0, bytes: 0, languages: {} });
  });
});

describe("validation and import/export", () => {
  it("round-trips through export and import", () => {
    const notes = [mk({ id: "a" }), mk({ id: "b", pinned: true })];
    const text = exportNotes(notes);
    expect(JSON.parse(text)).toMatchObject({ app: "devbox-scratchpad", version: 1 });
    const r = importNotes(text);
    expect(r).toEqual({ ok: true, notes });
    expect(importNotes(JSON.stringify(notes))).toEqual({ ok: true, notes });
  });

  it("drops unknown fields on import", () => {
    const r = importNotes(JSON.stringify([{ ...mk({ id: "a" }), extra: "x", __proto__: { polluted: true } }]));
    expect(r.ok && Object.keys(r.notes[0]).sort()).toEqual(["body", "createdAt", "id", "language", "pinned", "title", "updatedAt"]);
  });

  it("rejects bad shapes with a helpful message", () => {
    expect(importNotes("")).toMatchObject({ ok: false, error: /empty/ });
    expect(importNotes("{nope")).toMatchObject({ ok: false, error: /valid JSON/ });
    expect(importNotes('{"foo": 1}')).toMatchObject({ ok: false, error: /array/ });
    expect(importNotes(JSON.stringify([{ ...mk(), id: "" }]))).toMatchObject({ ok: false, error: /Note 1 is invalid: missing or invalid id/ });
    expect(importNotes(JSON.stringify([mk({ id: "a" }), { ...mk({ id: "b" }), language: "cobol" }]))).toMatchObject({ ok: false, error: /Note 2 is invalid: unknown language/ });
    expect(importNotes(JSON.stringify([{ ...mk(), pinned: "yes" }]))).toMatchObject({ ok: false, error: /pinned/ });
    expect(importNotes(JSON.stringify([{ ...mk(), updatedAt: "now" }]))).toMatchObject({ ok: false, error: /updatedAt/ });
    expect(importNotes(JSON.stringify([mk({ id: "dup" }), mk({ id: "dup" })]))).toMatchObject({ ok: false, error: /repeats the id/ });
    expect(importNotes(JSON.stringify(["x"]))).toMatchObject({ ok: false, error: /not an object/ });
  });

  it("rejects oversized notes and too many notes", () => {
    expect(importNotes(JSON.stringify([mk({ body: "x".repeat(MAX_NOTE_BYTES + 1) })]))).toMatchObject({ ok: false, error: /larger than 200 KB/ });
    expect(importNotes(JSON.stringify([mk({ body: "é".repeat(MAX_NOTE_BYTES / 2 + 1) })]))).toMatchObject({ ok: false, error: /larger/ });
    expect(isNote(mk({ body: "x".repeat(MAX_NOTE_BYTES) }))).toBe(true);
    const many = Array.from({ length: MAX_NOTES + 1 }, (_, i) => mk({ id: `n${i}` }));
    expect(importNotes(JSON.stringify(many))).toMatchObject({ ok: false, error: /limit is 200/ });
    expect(isNoteArray(many)).toBe(false);
    expect(isNoteArray(many.slice(0, MAX_NOTES))).toBe(true);
    expect(isNoteArray([mk({ id: "a" }), mk({ id: "a" })])).toBe(false);
    expect(isNoteArray("nope")).toBe(false);
  });

  it("merges imports by id and enforces the cap", () => {
    const existing = [mk({ id: "a", title: "old" }), mk({ id: "b" })];
    const r = mergeNotes(existing, [mk({ id: "a", title: "new" }), mk({ id: "c" })]);
    expect(r.ok && r.replaced).toBe(1);
    expect(r.ok && r.notes.map((n) => n.id)).toEqual(["a", "c", "b"]);
    expect(r.ok && r.notes[0].title).toBe("new");
    const full = Array.from({ length: MAX_NOTES }, (_, i) => mk({ id: `n${i}` }));
    expect(mergeNotes(full, [mk({ id: "extra" })])).toMatchObject({ ok: false, error: /limit/ });
  });
});

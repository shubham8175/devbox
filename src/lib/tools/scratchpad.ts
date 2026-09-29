/**
 * Scratchpad: pure helpers for notes. This is the only DevBox tool that may
 * store user content, and only after an explicit opt-in (see
 * src/lib/scratchpad-store.ts). Everything here is plain data manipulation.
 */

export type NoteLanguage = "text" | "markdown" | "json" | "javascript" | "sql" | "shell" | "other";

export interface Note {
  id: string;
  title: string;
  body: string;
  language: NoteLanguage;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
}

export const NOTE_LANGUAGES: ReadonlyArray<{ id: NoteLanguage; label: string }> = [
  { id: "text", label: "Plain text" },
  { id: "markdown", label: "Markdown" },
  { id: "json", label: "JSON" },
  { id: "javascript", label: "JavaScript" },
  { id: "sql", label: "SQL" },
  { id: "shell", label: "Shell" },
  { id: "other", label: "Other" },
];

export const MAX_NOTES = 200;
export const MAX_NOTE_BYTES = 200_000;
export const MAX_TITLE_LENGTH = 200;

const LANGUAGES = new Set<string>(NOTE_LANGUAGES.map((l) => l.id));

export function newNoteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function noteBytes(note: Pick<Note, "title" | "body">): number {
  return byteLength(note.body) + byteLength(note.title);
}

type NoteFields = Partial<Pick<Note, "title" | "body" | "language" | "pinned">>;

export function createNote(fields: NoteFields = {}, now: number = Date.now()): Note {
  return {
    id: newNoteId(),
    title: (fields.title ?? "").slice(0, MAX_TITLE_LENGTH),
    body: fields.body ?? "",
    language: fields.language ?? "text",
    createdAt: now,
    updatedAt: now,
    pinned: fields.pinned ?? false,
  };
}

/** Returns a new note; `updatedAt` only moves when content (not the pin) changes. */
export function updateNote(note: Note, patch: NoteFields, now: number = Date.now()): Note {
  const next: Note = { ...note };
  let contentChanged = false;
  if (patch.title !== undefined && patch.title !== note.title) {
    next.title = patch.title.slice(0, MAX_TITLE_LENGTH);
    contentChanged = true;
  }
  if (patch.body !== undefined && patch.body !== note.body) {
    next.body = patch.body;
    contentChanged = true;
  }
  if (patch.language !== undefined && patch.language !== note.language) {
    next.language = patch.language;
    contentChanged = true;
  }
  if (patch.pinned !== undefined) next.pinned = patch.pinned;
  if (contentChanged) next.updatedAt = Math.max(now, note.updatedAt);
  return next;
}

/** Pinned first, then most recently updated. Stable for equal keys. */
export function sortNotes(notes: readonly Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function searchNotes(notes: readonly Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...notes];
  const terms = q.split(/\s+/);
  return notes.filter((n) => {
    const hay = `${n.title}\n${n.body}\n${n.language}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

export function titleFromBody(body: string, max = 60): string {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s#>*\-`]+/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return "Untitled";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function noteTitle(note: Pick<Note, "title" | "body">): string {
  return note.title.trim() || titleFromBody(note.body);
}

export interface NoteStats {
  count: number;
  pinned: number;
  bytes: number;
  languages: Partial<Record<NoteLanguage, number>>;
}

export function noteStats(notes: readonly Note[]): NoteStats {
  const stats: NoteStats = { count: notes.length, pinned: 0, bytes: 0, languages: {} };
  for (const n of notes) {
    if (n.pinned) stats.pinned++;
    stats.bytes += noteBytes(n);
    stats.languages[n.language] = (stats.languages[n.language] ?? 0) + 1;
  }
  return stats;
}

/* -------------------------------- validation -------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Why a value is not a Note, or null when it is one. */
export function noteProblem(v: unknown): string | null {
  if (!isRecord(v)) return "not an object";
  if (typeof v.id !== "string" || !v.id || v.id.length > 64) return "missing or invalid id";
  if (typeof v.title !== "string" || v.title.length > MAX_TITLE_LENGTH) return "title must be a string of at most 200 characters";
  if (typeof v.body !== "string") return "body must be a string";
  if (typeof v.language !== "string" || !LANGUAGES.has(v.language)) return "unknown language";
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) return "createdAt must be a timestamp";
  if (typeof v.updatedAt !== "number" || !Number.isFinite(v.updatedAt)) return "updatedAt must be a timestamp";
  if (typeof v.pinned !== "boolean") return "pinned must be a boolean";
  if (v.body.length > MAX_NOTE_BYTES || byteLength(v.body) > MAX_NOTE_BYTES) return `body is larger than ${MAX_NOTE_BYTES / 1000} KB`;
  return null;
}

export function isNote(v: unknown): v is Note {
  return noteProblem(v) === null;
}

export function isNoteArray(v: unknown): v is Note[] {
  if (!Array.isArray(v) || v.length > MAX_NOTES) return false;
  const ids = new Set<string>();
  for (const n of v) {
    if (!isNote(n) || ids.has(n.id)) return false;
    ids.add(n.id);
  }
  return true;
}

/* ------------------------------- import/export ------------------------------ */

export const EXPORT_VERSION = 1;

export function exportNotes(notes: readonly Note[]): string {
  return JSON.stringify({ app: "devbox-scratchpad", version: EXPORT_VERSION, exportedAt: new Date().toISOString(), notes }, null, 2);
}

export type ImportResult = { ok: true; notes: Note[] } | { ok: false; error: string };

/** Accepts an export envelope or a bare array. Every note is validated; anything off is rejected as a whole. */
export function importNotes(text: string): ImportResult {
  if (!text.trim()) return { ok: false, error: "The file is empty." };
  if (text.length > MAX_NOTES * MAX_NOTE_BYTES) return { ok: false, error: "The file is too large to be a scratchpad export." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.notes) ? parsed.notes : null;
  if (!list) return { ok: false, error: "Expected a JSON array of notes or an export with a “notes” array." };
  if (list.length > MAX_NOTES) return { ok: false, error: `The file has ${list.length} notes; the limit is ${MAX_NOTES}.` };
  const notes: Note[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const problem = noteProblem(list[i]);
    if (problem) return { ok: false, error: `Note ${i + 1} is invalid: ${problem}.` };
    const raw = list[i] as Note;
    if (ids.has(raw.id)) return { ok: false, error: `Note ${i + 1} repeats the id “${raw.id}”.` };
    ids.add(raw.id);
    // Copy only the known fields so nothing extra rides along into storage.
    notes.push({ id: raw.id, title: raw.title, body: raw.body, language: raw.language, createdAt: raw.createdAt, updatedAt: raw.updatedAt, pinned: raw.pinned });
  }
  return { ok: true, notes };
}

/** Imported notes replace existing ones with the same id; the rest are kept. */
export function mergeNotes(existing: readonly Note[], imported: readonly Note[]): { ok: true; notes: Note[]; replaced: number } | { ok: false; error: string } {
  const importedIds = new Set(imported.map((n) => n.id));
  const kept = existing.filter((n) => !importedIds.has(n.id));
  const replaced = existing.length - kept.length;
  const notes = [...imported, ...kept];
  if (notes.length > MAX_NOTES) return { ok: false, error: `Importing would leave ${notes.length} notes; the limit is ${MAX_NOTES}.` };
  return { ok: true, notes, replaced };
}

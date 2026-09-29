"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pin, PinOff, Plus, Trash2, Upload } from "lucide-react";
import { MAX_NOTES, MAX_NOTE_BYTES, NOTE_LANGUAGES, createNote, exportNotes, importNotes, mergeNotes, noteBytes, noteTitle, searchNotes, sortNotes, updateNote, type Note, type NoteLanguage } from "@/lib/tools/scratchpad";
import { clearScratchpad, readStoredNotes, saveNotes, setScratchpadEnabled, useScratchpadEnabled, useScratchpadNotes } from "@/lib/scratchpad-store";
import { relativeTime } from "@/lib/tools/time";
import { useHydrated } from "@/hooks/use-hydrated";
import { useNow } from "@/hooks/use-now";
import { Card, CardHeader } from "@/components/ui/card";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function download(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const EXT: Record<NoteLanguage, string> = { text: "txt", markdown: "md", json: "json", javascript: "js", sql: "sql", shell: "sh", other: "txt" };

function NoteRow({ note, active, now, onSelect, onTogglePin }: { note: Note; active: boolean; now: Date | null; onSelect: () => void; onTogglePin: () => void }) {
  return (
    <div className={cn("group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors", active ? "border-accent bg-accent-soft/40" : "bg-bg-elevated hover:border-border-strong")}>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left cursor-pointer">
        <div className="truncate text-sm text-fg">{noteTitle(note)}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <Badge>{note.language}</Badge>
          {/* Relative time is client-only: useNow() is null during SSR so markup matches. */}
          <span>{now ? relativeTime(new Date(note.updatedAt), now) : ""}</span>
        </div>
      </button>
      <Button size="icon" variant="ghost" onClick={onTogglePin} aria-label={note.pinned ? "Unpin note" : "Pin note"} title={note.pinned ? "Unpin" : "Pin"} className={cn(note.pinned ? "text-accent-strong" : "opacity-40 group-hover:opacity-100")}>
        {note.pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export function ScratchpadTool() {
  const hydrated = useHydrated();
  const enabled = useScratchpadEnabled();
  const stored = useScratchpadNotes();
  const now = useNow(30_000);
  // Notes live in React state. When persistence is on they are also mirrored to
  // localStorage; the initializer hydrates from it on the client (empty on the server).
  const [notes, setNotes] = useState<Note[]>(() => (typeof window === "undefined" ? [] : readStoredNotes()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!confirmDelete) return;
    const id = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(id);
  }, [confirmDelete]);

  const commit = (next: Note[]) => {
    setNotes(next);
    saveNotes(next);
  };

  const visible = useMemo(() => sortNotes(searchNotes(notes, query)), [notes, query]);
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const addNote = () => {
    if (notes.length >= MAX_NOTES) {
      setMessage({ tone: "danger", text: `The scratchpad holds at most ${MAX_NOTES} notes.` });
      return;
    }
    const n = createNote();
    commit([n, ...notes]);
    setSelectedId(n.id);
    setQuery("");
  };
  const patch = (id: string, fields: Parameters<typeof updateNote>[1]) => commit(notes.map((n) => (n.id === id ? updateNote(n, fields) : n)));
  const remove = (id: string) => {
    commit(notes.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const togglePersistence = (on: boolean) => {
    setScratchpadEnabled(on, on ? notes : undefined);
    setConfirmDelete(false);
  };
  const deleteAllStored = () => {
    clearScratchpad();
    setNotes([]);
    setSelectedId(null);
    setConfirmDelete(false);
    setMessage({ tone: "success", text: "All notes were deleted from this browser." });
  };

  const onImportFile = (file: File) => {
    file
      .text()
      .then((text) => {
        const r = importNotes(text);
        if (!r.ok) {
          setMessage({ tone: "danger", text: r.error });
          return;
        }
        const merged = mergeNotes(notes, r.notes);
        if (!merged.ok) {
          setMessage({ tone: "danger", text: merged.error });
          return;
        }
        commit(merged.notes);
        setMessage({ tone: "success", text: `Imported ${r.notes.length} note${r.notes.length === 1 ? "" : "s"}${merged.replaced ? ` (${merged.replaced} replaced)` : ""}.` });
      })
      .catch(() => setMessage({ tone: "danger", text: "Could not read that file." }));
  };

  return (
    <div className="space-y-4">
      <Alert tone="info">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>
            Notes live only in this tab unless you turn on <strong>Keep notes in this browser</strong>. That stores them in localStorage on this device, unencrypted; nothing is ever uploaded.
          </span>
          <label className="flex items-center gap-2 text-xs text-fg">
            <input type="checkbox" className="accent-accent" checked={hydrated && enabled} onChange={(e) => togglePersistence(e.target.checked)} disabled={!hydrated} />
            Keep notes in this browser
          </label>
          {hydrated && enabled ? (
            <>
              <Badge tone="success">{stored.length} stored</Badge>
              {confirmDelete ? (
                <Button size="sm" variant="danger" onClick={deleteAllStored}>
                  Confirm: delete {notes.length} note{notes.length === 1 ? "" : "s"}
                </Button>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete all stored notes
                </Button>
              )}
            </>
          ) : null}
        </div>
      </Alert>
      {message ? (
        <Alert tone={message.tone}>
          <div className="flex items-center justify-between gap-3">
            <span>{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} className="text-xs underline-offset-2 hover:underline cursor-pointer">
              Dismiss
            </button>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Notes"
            description={`${notes.length} / ${MAX_NOTES}`}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} title="Import notes from a JSON export">
                  <Upload className="h-3.5 w-3.5" /> Import
                </Button>
                <Button size="sm" variant="ghost" onClick={() => download(exportNotes(notes), "devbox-scratchpad.json")} disabled={!notes.length} title="Download all notes as JSON">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button size="sm" variant="primary" onClick={addNote}>
                  <Plus className="h-3.5 w-3.5" /> New note
                </Button>
              </>
            }
          />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Import notes"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes…" aria-label="Search notes" className="mb-3" />
          {!hydrated ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-10 skeleton" />
              <div className="h-10 skeleton" />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState title={notes.length ? "No notes match" : "No notes yet"} description={notes.length ? "Try a different search." : "Create a note to start. It stays in this tab unless you opt in above."} className="py-8" />
          ) : (
            <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-0.5">
              {visible.map((n) => (
                <NoteRow key={n.id} note={n} active={n.id === selectedId} now={now} onSelect={() => setSelectedId(n.id)} onTogglePin={() => patch(n.id, { pinned: !n.pinned })} />
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3">
          {!selected ? (
            <EmptyState title="Select or create a note" description="Title, language and body are editable here." className="min-h-[400px]" />
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_180px]">
                <div>
                  <Label htmlFor="scratchpad-title">Title</Label>
                  <Input id="scratchpad-title" value={selected.title} onChange={(e) => patch(selected.id, { title: e.target.value })} placeholder={noteTitle(selected)} maxLength={200} />
                </div>
                <div>
                  <Label htmlFor="scratchpad-language">Language</Label>
                  <Select id="scratchpad-language" value={selected.language} onChange={(e) => patch(selected.id, { language: e.target.value as NoteLanguage })}>
                    {NOTE_LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <CodeTextarea value={selected.body} onChange={(e) => patch(selected.id, { body: e.target.value })} maxLength={MAX_NOTE_BYTES} placeholder="Write anything…" className="min-h-[360px]" aria-label="Note body" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={noteBytes(selected) > MAX_NOTE_BYTES * 0.9 ? "warning" : "neutral"}>{formatBytes(noteBytes(selected))}</Badge>
                <span className="text-[11px] text-fg-subtle">{hydrated ? `edited ${relativeTime(new Date(selected.updatedAt), now ?? new Date())}` : ""}</span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <CopyButton value={selected.body} variant="primary" />
                  <Button size="sm" onClick={() => download(selected.body, `${noteTitle(selected).replace(/[^\w.-]+/g, "-").toLowerCase() || "note"}.${EXT[selected.language]}`)} disabled={!selected.body}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(selected.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { formatMB, MAX_IMAGE_BYTES } from "@/lib/tools/canvas";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  /** Called with the selected file. Only the first matching file is used. */
  onFile: (file: File) => void;
  accept?: string;
  /** Also listen for paste events on the whole document */
  paste?: boolean;
  title?: string;
  description?: ReactNode;
  className?: string;
  compact?: boolean;
  /** Reject files above this size before handing them over. Defaults to the image limit for image/* accepts. */
  maxBytes?: number;
  /** Called with a friendly message when a file is rejected (also shown inline). */
  onReject?: (message: string) => void;
}

function isDirectoryDrop(dt: DataTransfer): boolean {
  try {
    for (const item of Array.from(dt.items ?? [])) {
      const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => { isDirectory?: boolean } | null }).webkitGetAsEntry?.();
      if (entry?.isDirectory) return true;
    }
  } catch {
    // ignore: not all browsers expose entries
  }
  return false;
}

/**
 * Drag & drop / click-to-upload / clipboard-paste target. Files never leave
 * the browser; the File object is handed straight to the caller.
 */
export function Dropzone({ onFile, accept = "image/*", paste = true, title, description, className, compact, maxBytes, onReject }: DropzoneProps) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const limit = maxBytes ?? (accept.startsWith("image") ? MAX_IMAGE_BYTES : undefined);

  const matches = useCallback(
    (file: File) => {
      if (!accept || accept === "*") return true;
      return accept.split(",").some((rule) => {
        const r = rule.trim();
        if (r.endsWith("/*")) return file.type.startsWith(r.slice(0, -1));
        if (r.startsWith(".")) return file.name.toLowerCase().endsWith(r.toLowerCase());
        return file.type === r;
      });
    },
    [accept],
  );

  const reject = useCallback(
    (message: string) => {
      setRejected(message);
      onReject?.(message);
    },
    [onReject],
  );

  const handleFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      if (!files) return;
      const list = Array.from(files);
      if (!list.length) return;
      const file = list.find(matches);
      if (!file) {
        reject(accept.startsWith("image") ? "That is not a supported image file." : "That file type is not supported here.");
        return;
      }
      if (limit !== undefined && file.size > limit) {
        reject(`This file is ${formatMB(file.size)}; the limit is ${formatMB(limit)}.`);
        return;
      }
      setRejected(null);
      onFile(file);
    },
    [matches, onFile, accept, limit, reject],
  );

  useEffect(() => {
    if (!paste) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        handleFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [paste, handleFiles]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title ?? "Upload file"}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (isDirectoryDrop(e.dataTransfer)) {
          reject("Folders cannot be processed. Drop a single file.");
          return;
        }
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors",
        compact ? "px-4 py-4" : "px-6 py-10",
        over ? "border-accent bg-accent-soft/60" : "border-border bg-bg-elevated hover:border-border-strong hover:bg-surface-hover",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className={cn("mb-3 flex items-center justify-center rounded-lg bg-surface text-fg-subtle", compact ? "h-8 w-8" : "h-10 w-10")}>
        {accept.startsWith("image") ? <ImagePlus className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
      </div>
      <p className="text-sm font-medium text-fg">{title ?? "Drop an image here"}</p>
      <p className="mt-1 text-xs text-fg-muted">
        {description ?? (
          <>
            or <span className="text-accent-strong">click to upload</span>
            {paste ? " · or paste from the clipboard" : ""}
          </>
        )}
      </p>
      {rejected ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {rejected}
        </p>
      ) : null}
    </div>
  );
}

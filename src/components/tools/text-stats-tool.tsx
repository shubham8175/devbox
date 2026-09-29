"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { analyzeText, formatDuration, HISTOGRAM_BUCKETS, READING_WPM, SPEAKING_WPM, TEXT_STATS_SAMPLE, type TextStatistics } from "@/lib/tools/text-stats";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const fmt = (n: number) => n.toLocaleString("en-US");

function summaryText(s: TextStatistics): string {
  return [
    `Characters: ${s.characters}`,
    `Characters (no spaces): ${s.charactersNoSpaces}`,
    `Words: ${s.words}`,
    `Unique words: ${s.uniqueWords}`,
    `Sentences: ${s.sentences}`,
    `Paragraphs: ${s.paragraphs}`,
    `Lines: ${s.lines}`,
    `Bytes (UTF-8): ${s.bytesUtf8}`,
    `Reading time: ${formatDuration(s.readingTimeSeconds)}`,
    `Speaking time: ${formatDuration(s.speakingTimeSeconds)}`,
  ].join("\n");
}

export function TextStatsTool() {
  const [text, setText] = useState("");
  const debounced = useDebounced(text, 120);
  const stats = useMemo(() => (debounced ? analyzeText(debounced) : null), [debounced]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="Text"
        description="Statistics update as you type. Nothing leaves this page and nothing is stored."
        actions={
          !text ? (
            <Button size="sm" variant="ghost" onClick={() => setText(TEXT_STATS_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setText("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type any text…" className="min-h-[420px] font-sans" aria-label="Text to analyse" />
      </InputPanel>

      <OutputPanel title="Statistics" actions={<CopyButton value={stats ? summaryText(stats) : ""} label="Copy summary" />}>
        {!stats ? (
          <EmptyState title="Nothing to count yet" description="Word, character, sentence and paragraph counts, reading time and word frequency appear here." />
        ) : (
          <div className="space-y-4">
            <OutputGrid>
              <OutputRow label="Characters" value={fmt(stats.characters)} hint={`${fmt(stats.charactersNoSpaces)} without spaces`} copyable={false} />
              <OutputRow label="Words" value={fmt(stats.words)} hint={`${fmt(stats.uniqueWords)} unique · avg ${stats.averageWordLength} letters`} copyable={false} />
              <OutputRow label="Sentences" value={fmt(stats.sentences)} copyable={false} />
              <OutputRow label="Paragraphs" value={fmt(stats.paragraphs)} copyable={false} />
              <OutputRow label="Lines" value={fmt(stats.lines)} hint={`${fmt(stats.nonEmptyLines)} non-empty`} copyable={false} />
              <OutputRow label="Bytes" value={`${fmt(stats.bytesUtf8)} UTF-8`} hint={`${fmt(stats.bytesUtf16)} UTF-16`} copyable={false} />
              <OutputRow label="Reading time" value={formatDuration(stats.readingTimeSeconds)} hint={`at ${READING_WPM} words per minute`} copyable={false} />
              <OutputRow label="Speaking time" value={formatDuration(stats.speakingTimeSeconds)} hint={`at ${SPEAKING_WPM} words per minute`} copyable={false} />
            </OutputGrid>

            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <Stat label="Letters" value={stats.letters} />
              <Stat label="Digits" value={stats.digits} />
              <Stat label="Punctuation" value={stats.punctuation} />
              <Stat label="Whitespace" value={stats.whitespace} />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={stats.hasCrlf ? "warning" : "neutral"}>{stats.hasCrlf ? "CRLF line endings" : "LF line endings"}</Badge>
              {stats.hasTabs ? <Badge tone="warning">Contains tabs</Badge> : null}
              {stats.trailingWhitespaceLines ? <Badge tone="warning">{fmt(stats.trailingWhitespaceLines)} lines with trailing whitespace</Badge> : null}
              {stats.emojiCount ? <Badge tone="accent">{fmt(stats.emojiCount)} emoji</Badge> : null}
              {stats.longestWord ? (
                <Badge>
                  Longest: <span className="font-mono">{stats.longestWord.length > 40 ? stats.longestWord.slice(0, 40) + "…" : stats.longestWord}</span>
                </Badge>
              ) : null}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium text-fg-muted">Top words</h3>
              {stats.topWords.length ? (
                <ul className="space-y-1">
                  {stats.topWords.map((w) => {
                    const max = stats.topWords[0].count;
                    return (
                      <li key={w.word} className="flex items-center gap-2 text-xs">
                        <span className="w-28 truncate font-mono text-fg" title={w.word}>
                          {w.word}
                        </span>
                        <div className="h-3 flex-1 overflow-hidden rounded bg-bg-elevated">
                          <div className="h-full rounded bg-accent/70" style={{ width: `${Math.max(2, (w.count / max) * 100)}%` }} />
                        </div>
                        <span className="w-20 shrink-0 text-right font-mono text-fg-muted">
                          {fmt(w.count)} · {w.percent}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-fg-subtle">No words longer than one letter outside the stop-word list.</p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium text-fg-muted">Word lengths</h3>
              <Histogram buckets={stats.wordLengthHistogram} />
            </div>
          </div>
        )}
      </OutputPanel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-bg-elevated p-2">
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-fg">{fmt(value)}</div>
    </div>
  );
}

function Histogram({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  return (
    <div className="flex h-24 items-end gap-1 rounded-lg border bg-bg-elevated p-2" role="img" aria-label="Histogram of word lengths">
      {buckets.map((count, i) => {
        const label = i === HISTOGRAM_BUCKETS - 1 ? `${HISTOGRAM_BUCKETS}+` : String(i + 1);
        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${label} letters: ${fmt(count)} words`}>
            <div className="w-full rounded-sm bg-accent/70" style={{ height: `${count ? Math.max(3, (count / max) * 100) : 0}%` }} />
            <span className="font-mono text-[9px] leading-none text-fg-subtle">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

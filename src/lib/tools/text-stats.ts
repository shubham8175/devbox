export interface TopWord {
  word: string;
  count: number;
  /** Share of all counted words, 0–100 */
  percent: number;
}

export interface TextStatistics {
  characters: number;
  charactersNoSpaces: number;
  letters: number;
  digits: number;
  punctuation: number;
  whitespace: number;
  words: number;
  uniqueWords: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  nonEmptyLines: number;
  bytesUtf8: number;
  bytesUtf16: number;
  averageWordLength: number;
  longestWord: string;
  readingTimeSeconds: number;
  speakingTimeSeconds: number;
  topWords: TopWord[];
  /** Index 0 = words of length 1 … index 14 = words of length 15 or more */
  wordLengthHistogram: number[];
  emojiCount: number;
  hasCrlf: boolean;
  hasTabs: boolean;
  trailingWhitespaceLines: number;
}

export const READING_WPM = 238;
export const SPEAKING_WPM = 150;
export const TOP_WORDS_LIMIT = 15;
export const HISTOGRAM_BUCKETS = 15;
/** Analysis is synchronous on the main thread, so keep it under the shared textarea cap. */
export const MAX_TEXT_STATS_CHARS = 2_000_000;

/** Small English stop-word list; only used to keep the "top words" list interesting. */
const STOP_WORDS = new Set(
  "a an and are as at be but by for from has have he her his i if in is it its me my no not of on or our she so that the their them they this to us was we were will with you your".split(" "),
);

const WORD_RE = /[\p{L}\p{N}_]+(?:['’\-.][\p{L}\p{N}_]+)*/gu;
const SENTENCE_RE = /[^.!?…]+(?:[.!?…]+|$)/gu;

type SegmenterCtor = new (locale: string, opts: { granularity: "grapheme" | "word" | "sentence" }) => {
  segment: (s: string) => Iterable<{ segment: string; isWordLike?: boolean }>;
};

function getSegmenter(): SegmenterCtor | undefined {
  return (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
}

function countGraphemes(text: string): number {
  const Seg = getSegmenter();
  if (Seg) {
    return Array.from(new Seg("en", { granularity: "grapheme" }).segment(text)).length;
  }
  return Array.from(text).length;
}

function splitWords(text: string): string[] {
  const Seg = getSegmenter();
  if (Seg) {
    const out: string[] = [];
    for (const s of new Seg("en", { granularity: "word" }).segment(text)) {
      if (s.isWordLike) out.push(s.segment);
    }
    return out;
  }
  return text.match(WORD_RE) ?? [];
}

function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const Seg = getSegmenter();
  if (Seg) {
    let n = 0;
    for (const s of new Seg("en", { granularity: "sentence" }).segment(trimmed)) {
      if (s.segment.trim()) n++;
    }
    return n;
  }
  return (trimmed.match(SENTENCE_RE) ?? []).filter((s) => s.trim()).length;
}

function isEmoji(ch: string): boolean {
  return /\p{Extended_Pictographic}/u.test(ch);
}

export function analyzeText(input: string): TextStatistics {
  const text = input.length > MAX_TEXT_STATS_CHARS ? input.slice(0, MAX_TEXT_STATS_CHARS) : input;

  let letters = 0;
  let digits = 0;
  let punctuation = 0;
  let whitespace = 0;
  let emojiCount = 0;
  let codePoints = 0;
  for (const ch of text) {
    codePoints++;
    if (/\s/u.test(ch)) whitespace++;
    else if (/\p{L}/u.test(ch)) letters++;
    else if (/\p{Nd}/u.test(ch)) digits++;
    else if (/[\p{P}\p{S}]/u.test(ch)) {
      punctuation++;
      if (isEmoji(ch)) emojiCount++;
    }
  }
  // Only pictographic symbols count as emoji; skin tones and ZWJ sequences count once.
  if (emojiCount === 0 && codePoints) {
    emojiCount = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  }

  const words = splitWords(text);
  const lines = text ? text.split(/\r?\n/) : [];
  const nonEmptyLines = lines.filter((l) => l.trim()).length;
  const paragraphs = text.trim() ? text.trim().split(/(?:\r?\n)[ \t]*(?:\r?\n)+/).filter((p) => p.trim()).length : 0;

  const freq = new Map<string, number>();
  const unique = new Set<string>();
  const histogram = new Array<number>(HISTOGRAM_BUCKETS).fill(0);
  let totalWordLength = 0;
  let longestWord = "";
  for (const w of words) {
    const lower = w.toLowerCase();
    unique.add(lower);
    const len = Array.from(w).length;
    totalWordLength += len;
    histogram[Math.min(len, HISTOGRAM_BUCKETS) - 1]++;
    if (len > Array.from(longestWord).length) longestWord = w;
    if (len >= 2 && !STOP_WORDS.has(lower) && !/^\d+$/.test(lower)) {
      freq.set(lower, (freq.get(lower) ?? 0) + 1);
    }
  }
  const topWords: TopWord[] = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_WORDS_LIMIT)
    .map(([word, count]) => ({ word, count, percent: words.length ? Math.round((count / words.length) * 1000) / 10 : 0 }));

  const characters = countGraphemes(text);
  const charactersNoSpaces = characters - (text.match(/\s/gu) ?? []).length;
  // UTF-16 without a BOM: every code unit is two bytes.
  const bytesUtf16 = text.length * 2;

  return {
    characters,
    charactersNoSpaces: Math.max(0, charactersNoSpaces),
    letters,
    digits,
    punctuation,
    whitespace,
    words: words.length,
    uniqueWords: unique.size,
    sentences: countSentences(text),
    paragraphs,
    lines: lines.length,
    nonEmptyLines,
    bytesUtf8: new TextEncoder().encode(text).length,
    bytesUtf16,
    averageWordLength: words.length ? Math.round((totalWordLength / words.length) * 10) / 10 : 0,
    longestWord,
    readingTimeSeconds: Math.round((words.length / READING_WPM) * 60),
    speakingTimeSeconds: Math.round((words.length / SPEAKING_WPM) * 60),
    topWords,
    wordLengthHistogram: histogram,
    emojiCount,
    hasCrlf: text.includes("\r\n"),
    hasTabs: text.includes("\t"),
    trailingWhitespaceLines: lines.filter((l) => /[ \t]+$/.test(l.replace(/\r$/, ""))).length,
  };
}

/** 80 → "1 min 20 s"; 5 → "5 s"; 3600 → "1 h 0 min" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h) return `${h} h ${m} min`;
  return `${m} min ${rest} s`;
}

export const TEXT_STATS_SAMPLE = `The quick brown fox jumps over the lazy dog. The dog, unimpressed, yawns and rolls over!

Text statistics help writers and developers understand their content: how long it takes to read, which words repeat, and whether the file has tabs or Windows line endings.

Did you know? The average adult reads about 238 words per minute. Speaking is slower — around 150 words per minute — so a two-minute talk is only about 300 words. 🦊`;

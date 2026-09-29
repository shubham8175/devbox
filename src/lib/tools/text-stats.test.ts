import { describe, expect, it } from "vitest";
import { analyzeText, formatDuration, HISTOGRAM_BUCKETS, TEXT_STATS_SAMPLE, TOP_WORDS_LIMIT } from "@/lib/tools/text-stats";

describe("analyzeText", () => {
  it("returns zeros for empty input", () => {
    const s = analyzeText("");
    expect(s.characters).toBe(0);
    expect(s.words).toBe(0);
    expect(s.sentences).toBe(0);
    expect(s.paragraphs).toBe(0);
    expect(s.lines).toBe(0);
    expect(s.bytesUtf8).toBe(0);
    expect(s.topWords).toEqual([]);
    expect(s.longestWord).toBe("");
    expect(s.averageWordLength).toBe(0);
    expect(s.readingTimeSeconds).toBe(0);
  });

  it("counts characters, words and sentences in plain ASCII", () => {
    const s = analyzeText("Hello world. This is a test!");
    expect(s.characters).toBe(28);
    expect(s.charactersNoSpaces).toBe(23);
    expect(s.words).toBe(6);
    expect(s.uniqueWords).toBe(6);
    expect(s.sentences).toBe(2);
    expect(s.paragraphs).toBe(1);
    expect(s.lines).toBe(1);
    expect(s.letters).toBe(21);
    expect(s.punctuation).toBe(2);
    expect(s.whitespace).toBe(5);
    expect(s.longestWord).toBe("Hello");
  });

  it("counts grapheme clusters, not code units, for unicode and emoji", () => {
    const s = analyzeText("héllo 👨‍👩‍👧 café");
    expect(s.characters).toBe(12);
    expect(s.words).toBe(2);
    expect(s.emojiCount).toBeGreaterThanOrEqual(1);
    expect(s.bytesUtf8).toBe(new TextEncoder().encode("héllo 👨‍👩‍👧 café").length);
    expect(s.bytesUtf16).toBe("héllo 👨‍👩‍👧 café".length * 2);
  });

  it("counts digits and mixed content", () => {
    const s = analyzeText("Order 42 costs $3.50");
    expect(s.digits).toBe(5);
    expect(s.words).toBe(4);
  });

  it("detects CRLF, tabs and trailing whitespace", () => {
    const s = analyzeText("one \r\ntwo\t\r\nthree\r\n\r\nfour");
    expect(s.hasCrlf).toBe(true);
    expect(s.hasTabs).toBe(true);
    expect(s.trailingWhitespaceLines).toBe(2);
    expect(s.lines).toBe(5);
    expect(s.nonEmptyLines).toBe(4);
    expect(s.paragraphs).toBe(2);
  });

  it("does not flag LF-only text", () => {
    const s = analyzeText("a\nb\nc");
    expect(s.hasCrlf).toBe(false);
    expect(s.hasTabs).toBe(false);
    expect(s.trailingWhitespaceLines).toBe(0);
    expect(s.lines).toBe(3);
  });

  it("counts paragraphs separated by blank lines", () => {
    expect(analyzeText("p1\n\np2\n\n\n\np3").paragraphs).toBe(3);
    expect(analyzeText("p1\n   \np2").paragraphs).toBe(2);
  });

  it("ranks top words case-insensitively and excludes stop words and short words", () => {
    const s = analyzeText("The cat and the Cat and a dog. THE cat!");
    expect(s.topWords[0]).toEqual({ word: "cat", count: 3, percent: 30 });
    expect(s.topWords.find((w) => w.word === "the")).toBeUndefined();
    expect(s.topWords.find((w) => w.word === "and")).toBeUndefined();
    expect(s.topWords.find((w) => w.word === "a")).toBeUndefined();
    expect(s.topWords.map((w) => w.word)).toContain("dog");
  });

  it("limits top words", () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    expect(analyzeText(text).topWords).toHaveLength(TOP_WORDS_LIMIT);
  });

  it("builds a word length histogram with an overflow bucket", () => {
    const s = analyzeText("a bb ccc supercalifragilisticexpialidocious");
    expect(s.wordLengthHistogram).toHaveLength(HISTOGRAM_BUCKETS);
    expect(s.wordLengthHistogram[0]).toBe(1);
    expect(s.wordLengthHistogram[1]).toBe(1);
    expect(s.wordLengthHistogram[2]).toBe(1);
    expect(s.wordLengthHistogram[HISTOGRAM_BUCKETS - 1]).toBe(1);
    expect(s.averageWordLength).toBe(10);
    expect(s.longestWord).toBe("supercalifragilisticexpialidocious");
  });

  it("computes reading and speaking time from the word count", () => {
    const text = Array.from({ length: 238 }, () => "word").join(" ");
    const s = analyzeText(text);
    expect(s.words).toBe(238);
    expect(s.readingTimeSeconds).toBe(60);
    expect(s.speakingTimeSeconds).toBe(95);
  });

  it("analyses the bundled sample", () => {
    const s = analyzeText(TEXT_STATS_SAMPLE);
    expect(s.paragraphs).toBe(3);
    expect(s.sentences).toBeGreaterThanOrEqual(6);
    expect(s.words).toBeGreaterThan(60);
    expect(s.emojiCount).toBe(1);
    expect(s.topWords[0].word).toBe("words");
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(5)).toBe("5 s");
    expect(formatDuration(80)).toBe("1 min 20 s");
    expect(formatDuration(3600)).toBe("1 h 0 min");
    expect(formatDuration(3725)).toBe("1 h 2 min");
    expect(formatDuration(-3)).toBe("0 s");
  });
});

export interface CheatRow {
  code: string;
  description: string;
}

export interface CheatSection {
  title: string;
  rows: CheatRow[];
}

export interface CommonPattern {
  id: string;
  label: string;
  pattern: string;
  flags: string;
  /** Text inserted into the test box when it is empty; must contain at least one match. */
  sample: string;
}

export const REGEX_CHEATSHEET: CheatSection[] = [
  {
    title: "Character classes",
    rows: [
      { code: ".", description: "Any character except newline (any with the s flag)" },
      { code: "\\d  \\D", description: "Digit 0–9 / not a digit" },
      { code: "\\w  \\W", description: "Word character [A-Za-z0-9_] / not" },
      { code: "\\s  \\S", description: "Whitespace (space, tab, newline…) / not" },
      { code: "[abc]", description: "One of a, b or c" },
      { code: "[^abc]", description: "Any character except a, b or c" },
      { code: "[a-z]", description: "Range: any lowercase letter" },
      { code: "\\p{L}  \\p{N}", description: "Unicode letter / number (needs the u flag)" },
      { code: "\\p{Script=Greek}", description: "Unicode script property (u flag)" },
      { code: "\\p{Emoji}", description: "Emoji characters (u flag)" },
    ],
  },
  {
    title: "Anchors & boundaries",
    rows: [
      { code: "^", description: "Start of string (start of line with m)" },
      { code: "$", description: "End of string (end of line with m)" },
      { code: "\\b", description: "Word boundary" },
      { code: "\\B", description: "Not a word boundary" },
    ],
  },
  {
    title: "Quantifiers",
    rows: [
      { code: "*", description: "0 or more" },
      { code: "+", description: "1 or more" },
      { code: "?", description: "0 or 1" },
      { code: "{n}", description: "Exactly n" },
      { code: "{n,}", description: "n or more" },
      { code: "{n,m}", description: "Between n and m" },
      { code: "*?  +?  ??", description: "Lazy: match as little as possible" },
    ],
  },
  {
    title: "Groups & references",
    rows: [
      { code: "(abc)", description: "Capturing group" },
      { code: "(?:abc)", description: "Non-capturing group" },
      { code: "(?<name>abc)", description: "Named group; read as groups.name or $<name>" },
      { code: "\\1  \\k<name>", description: "Back-reference to a group" },
      { code: "a|b", description: "Alternation: a or b" },
    ],
  },
  {
    title: "Lookarounds",
    rows: [
      { code: "(?=abc)", description: "Positive lookahead: followed by abc" },
      { code: "(?!abc)", description: "Negative lookahead: not followed by abc" },
      { code: "(?<=abc)", description: "Positive lookbehind: preceded by abc" },
      { code: "(?<!abc)", description: "Negative lookbehind: not preceded by abc" },
    ],
  },
  {
    title: "Escapes",
    rows: [
      { code: "\\.  \\*  \\?  \\(", description: "Literal metacharacter" },
      { code: "\\t  \\n  \\r", description: "Tab, newline, carriage return" },
      { code: "\\xhh  \\uhhhh", description: "Character by hex code" },
      { code: "\\u{1F600}", description: "Code point escape (u flag)" },
    ],
  },
  {
    title: "Flags",
    rows: [
      { code: "g", description: "Global: find every match" },
      { code: "i", description: "Ignore case" },
      { code: "m", description: "Multiline: ^ and $ match at line breaks" },
      { code: "s", description: "dotAll: . also matches newlines" },
      { code: "u", description: "Unicode: \\p{…}, \\u{…} and code-point matching" },
      { code: "y", description: "Sticky: match only at lastIndex" },
    ],
  },
];

export const COMMON_PATTERNS: CommonPattern[] = [
  { id: "email", label: "Email", pattern: "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+", flags: "gi", sample: "Reach ada@example.com or grace.hopper@navy.mil today." },
  { id: "url", label: "URL", pattern: "https?:\\/\\/[\\w.-]+(?::\\d+)?(?:\\/[^\\s]*)?", flags: "gi", sample: "Docs: https://devbox.dev/tools?x=1 and http://localhost:3000/health" },
  { id: "ipv4", label: "IPv4", pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b", flags: "g", sample: "Gateway 192.168.1.1, DNS 8.8.8.8, invalid 999.1.1.1" },
  { id: "ipv6", label: "IPv6 (simplified)", pattern: "(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:|::(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4}", flags: "gi", sample: "Loopback ::1, full 2001:0db8:85a3:0000:0000:8a2e:0370:7334" },
  { id: "uuid", label: "UUID", pattern: "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b", flags: "gi", sample: "id 123e4567-e89b-12d3-a456-426614174000 and 9b2c6d3e-8f1a-4c3b-9d2e-1f2a3b4c5d6e" },
  { id: "iso-date", label: "ISO date", pattern: "\\b\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])\\b", flags: "g", sample: "Released 2024-03-15, patched 2024-04-02, not 2024-13-40." },
  { id: "time-24h", label: "Time (24h)", pattern: "\\b(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b", flags: "g", sample: "Standup at 09:30, deploy at 23:45:10, never at 25:00." },
  { id: "hex-color", label: "Hex colour", pattern: "#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\\b", flags: "gi", sample: "Brand #7c8cff, accent #3ecf8e, short #fff, alpha #00000080" },
  { id: "slug", label: "Slug", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", flags: "gm", sample: "hello-world\nmy-post-2024\nNot A Slug\ndouble--dash" },
  { id: "semver", label: "Semver", pattern: "\\b(?<major>0|[1-9]\\d*)\\.(?<minor>0|[1-9]\\d*)\\.(?<patch>0|[1-9]\\d*)(?:-(?<pre>[0-9A-Za-z.-]+))?(?:\\+(?<build>[0-9A-Za-z.-]+))?\\b", flags: "g", sample: "Versions 1.0.0, 2.3.4-beta.1, 10.20.30+build.5" },
  { id: "phone-e164", label: "Phone (E.164)", pattern: "\\+[1-9]\\d{1,14}\\b", flags: "g", sample: "Call +14155552671 or +919876543210; not 555-1234." },
  { id: "credit-card", label: "Card number", pattern: "\\b(?:\\d[ -]?){12,18}\\d\\b", flags: "g", sample: "Card 4111 1111 1111 1111 or 5500-0000-0000-0004" },
  { id: "us-zip", label: "US ZIP", pattern: "\\b\\d{5}(?:-\\d{4})?\\b", flags: "g", sample: "Ship to 94103 or 10001-2345." },
  { id: "strong-password", label: "Strong password", pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{12,}$", flags: "gm", sample: "Correct-Horse-9-Battery\npassword123\nSh0rt!Pw" },
  { id: "html-tag", label: "HTML tag", pattern: "<\\/?([a-z][a-z0-9-]*)(?:\\s[^<>]*)?>", flags: "gi", sample: '<div class="card"><p>Hello <b>world</b></p><br/></div>' },
  { id: "trim", label: "Leading / trailing whitespace", pattern: "^\\s+|\\s+$", flags: "gm", sample: "   padded line   \n\tindented\nclean" },
  { id: "duplicate-words", label: "Duplicate words", pattern: "\\b(\\w+)\\s+\\1\\b", flags: "gi", sample: "This is is a test of the the pattern." },
  { id: "markdown-link", label: "Markdown link", pattern: "\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s\"[^\"]*\")?\\)", flags: "g", sample: 'See [DevBox](https://devbox.dev) and [docs](/docs "Documentation").' },
];

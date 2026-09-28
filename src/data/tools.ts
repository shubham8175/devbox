import {
  Clock, Database, Braces, GitCompare, KeyRound, Binary, Fingerprint, Hash, CaseSensitive, Link2, Regex, CalendarClock, Globe, Lock,
  Palette, HardDrive, Percent, Shuffle, CalendarRange, Globe2, Pipette, QrCode, ScanLine, Terminal, Microscope, Diff, Quote, ImageIcon,
  Ratio, MonitorSmartphone, FileType2, Table2, FileJson2, FileCode2, ShieldCheck, Cookie, ListTree, SlidersHorizontal, FileDiff, FileCheck2,
  EyeOff, Languages, AlignLeft, Link, Tags, PackageSearch, GitCommitHorizontal, FileX2, GitPullRequestArrow, Bug, ScrollText, DatabaseZap,
  Layers, Brackets, Route, KeySquare, ShieldAlert, FileDigit, Minimize2, Scaling, RefreshCw, FileImage, AppWindow, Ruler, Blend, BoxSelect,
  Tag, Share2, Smartphone, ExternalLink, MapPin, Compass, Network, Hash as HashIcon, Calculator, Cpu, Sparkles, ListOrdered, TimerReset,
} from "lucide-react";
import type { ToolCategory, ToolDefinition, ToolWithRoute } from "@/types/tool";

/** Category order used by the sidebar and homepage. */
export const categories: ToolCategory[] = [
  "Time",
  "MongoDB",
  "Database",
  "API & HTTP",
  "JSON & Data",
  "Encoding",
  "Security",
  "Text",
  "Git",
  "Web",
  "CSS",
  "Images & QR",
  "Mobile",
  "Networking & Geo",
  "Generators",
  "Utilities",
];

const definitions: ToolDefinition[] = [
  // ---- Time
  { id: "epoch", name: "Epoch Converter", description: "Convert Unix timestamps to human dates and back.", category: "Time", keywords: ["unix", "timestamp", "epoch", "milliseconds", "seconds", "iso", "date", "time"], icon: Clock, popular: true, shortcut: "g e" },
  { id: "date-diff", name: "Date Difference", description: "Duration between two dates in days, hours and more.", category: "Time", keywords: ["date", "diff", "difference", "duration", "between", "days", "hours", "age"], icon: CalendarRange },
  { id: "timezone", name: "Timezone Converter", description: "Convert a date and time between timezones.", category: "Time", keywords: ["timezone", "tz", "utc", "ist", "convert", "kolkata", "london", "new york", "offset"], icon: Globe2 },
  { id: "cron", name: "Cron Helper", description: "Explain cron expressions and preview upcoming runs.", category: "Time", keywords: ["cron", "crontab", "schedule", "job", "expression", "interval"], icon: CalendarClock },
  // ---- MongoDB
  { id: "objectid", name: "MongoDB ObjectId", description: "Decode an ObjectId's timestamp or generate new ones.", category: "MongoDB", keywords: ["mongo", "mongodb", "objectid", "object id", "mongodb id", "bson", "id", "timestamp", "generate"], icon: Database, popular: true, shortcut: "g o" },
  { id: "mongodb-query", name: "MongoDB Query Formatter", description: "Format find queries and aggregation pipelines.", category: "MongoDB", keywords: ["mongo", "mongodb", "query", "aggregate", "pipeline", "match", "group", "lookup", "project", "format", "shell"], icon: DatabaseZap },
  // ---- Database
  { id: "sql", name: "SQL Formatter", description: "Format or minify SQL with syntax highlighting.", category: "Database", keywords: ["sql", "format", "minify", "query", "select", "join", "postgres", "mysql", "beautify"], icon: Table2 },
  // ---- API & HTTP
  { id: "curl", name: "cURL Converter", description: "Turn a cURL command into fetch, Axios or Node code.", category: "API & HTTP", keywords: ["curl", "fetch", "axios", "node", "http", "request", "convert", "code"], icon: Terminal, popular: true },
  { id: "api-inspector", name: "API Response Inspector", description: "Analyse the shape, size and quirks of a JSON response.", category: "API & HTTP", keywords: ["api", "response", "json", "inspect", "analyze", "depth", "nulls", "duplicate ids", "tree", "browse"], icon: Microscope },
  { id: "http-status", name: "HTTP Status Codes", description: "Look up status codes, meanings and typical usage.", category: "API & HTTP", keywords: ["http", "status", "code", "404", "500", "response", "error", "rest", "api"], icon: Globe },
  { id: "http-headers", name: "HTTP Header Parser", description: "Parse raw headers into a table, JSON and back.", category: "API & HTTP", keywords: ["http", "headers", "parse", "raw", "json", "duplicate", "content-type", "authorization"], icon: ListTree },
  { id: "cookies", name: "Cookie Parser", description: "Parse Cookie and Set-Cookie strings, build Cookie headers.", category: "API & HTTP", keywords: ["cookie", "set-cookie", "httponly", "secure", "samesite", "domain", "path", "expires", "max-age"], icon: Cookie },
  { id: "query-string", name: "Query String Builder", description: "Build and parse URLs with properly encoded parameters.", category: "API & HTTP", keywords: ["query", "string", "url", "params", "parameters", "build", "encode", "search"], icon: SlidersHorizontal },
  { id: "pagination", name: "Pagination Calculator", description: "Offset, limit, page counts and item ranges.", category: "API & HTTP", keywords: ["pagination", "page", "offset", "limit", "page size", "total", "api"], icon: ListOrdered },
  { id: "backoff", name: "Retry / Backoff Calculator", description: "Preview an exponential backoff retry schedule.", category: "API & HTTP", keywords: ["retry", "backoff", "exponential", "jitter", "delay", "resilience", "timeout"], icon: TimerReset },
  // ---- JSON & Data
  { id: "json", name: "JSON Toolbox", description: "Format, minify, validate and sort JSON.", category: "JSON & Data", keywords: ["json", "format", "pretty", "minify", "validate", "sort keys", "beautify"], icon: Braces, popular: true, shortcut: "g j" },
  { id: "json-diff", name: "JSON Diff", description: "Compare two JSON documents and see what changed.", category: "JSON & Data", keywords: ["json", "diff", "compare", "difference", "changes"], icon: GitCompare },
  { id: "json-to-types", name: "JSON → Types", description: "Generate TypeScript interfaces, types and Zod schemas.", category: "JSON & Data", keywords: ["json", "typescript", "interface", "type", "zod", "schema", "generate", "types", "ts"], icon: FileType2, popular: true },
  { id: "csv-json", name: "CSV ↔ JSON", description: "Convert CSV to JSON and back, quotes handled.", category: "JSON & Data", keywords: ["csv", "json", "convert", "spreadsheet", "table", "excel", "delimiter"], icon: Table2 },
  { id: "yaml-json", name: "YAML ↔ JSON", description: "Convert and validate YAML and JSON.", category: "JSON & Data", keywords: ["yaml", "yml", "json", "convert", "config", "kubernetes", "docker compose"], icon: FileJson2 },
  { id: "xml-json", name: "XML ↔ JSON", description: "Convert, format and validate XML.", category: "JSON & Data", keywords: ["xml", "json", "convert", "format", "validate", "soap", "rss", "attributes"], icon: FileCode2 },
  { id: "object-flatten", name: "Flatten / Unflatten", description: "Flatten nested objects to dot paths and back.", category: "JSON & Data", keywords: ["flatten", "unflatten", "object", "nested", "dot", "path", "keys", "json"], icon: Layers },
  { id: "array", name: "Array Toolbox", description: "Dedupe, sort, group and extract from JSON arrays.", category: "JSON & Data", keywords: ["array", "json", "dedupe", "sort", "group by", "extract", "duplicates", "filter", "list"], icon: Brackets },
  { id: "jsonpath", name: "JSONPath Tester", description: "Query JSON with JSONPath expressions.", category: "JSON & Data", keywords: ["jsonpath", "json", "path", "query", "$", "filter", "select", "expression"], icon: Route },
  // ---- Encoding
  { id: "base64", name: "Base64", description: "Encode and decode Base64 with full Unicode support.", category: "Encoding", keywords: ["base64", "encode", "decode", "binary", "text"], icon: Binary, popular: true },
  { id: "escape", name: "Escape / Unescape", description: "JSON, HTML, URL and Unicode escaping, plus whitespace view.", category: "Encoding", keywords: ["escape", "unescape", "json", "html", "entities", "unicode", "url", "newline", "whitespace"], icon: Quote },
  // ---- Security
  { id: "jwt", name: "JWT Decoder", description: "Inspect JWT header, payload and expiry claims.", category: "Security", keywords: ["jwt", "token", "decode", "auth", "bearer", "claims", "exp", "iat"], icon: KeyRound, popular: true, shortcut: "g t" },
  { id: "hash", name: "Hash Generator", description: "SHA-1, SHA-256, SHA-384 and SHA-512 digests.", category: "Security", keywords: ["hash", "sha", "sha256", "sha512", "digest", "checksum", "crypto"], icon: Hash },
  { id: "hmac", name: "HMAC Generator", description: "HMAC SHA-256 / 384 / 512 in hex and Base64.", category: "Security", keywords: ["hmac", "signature", "secret", "sha256", "webhook", "sign", "verify", "mac"], icon: ShieldCheck },
  { id: "password", name: "Password Generator", description: "Cryptographically secure passwords with options.", category: "Security", keywords: ["password", "generate", "random", "secure", "passphrase", "symbols"], icon: KeySquare },
  { id: "password-strength", name: "Password Strength", description: "Estimate password strength locally, with weaknesses.", category: "Security", keywords: ["password", "strength", "entropy", "weak", "check", "audit"], icon: ShieldAlert },
  { id: "env-diff", name: ".env Comparator", description: "Compare two env files by key, values hidden by default.", category: "Security", keywords: ["env", ".env", "environment", "diff", "compare", "missing", "keys", "dotenv", "production", "staging"], icon: FileDiff },
  { id: "env-validator", name: ".env Validator", description: "Lint a .env file for duplicates, quoting and whitespace issues.", category: "Security", keywords: ["env", ".env", "dotenv", "validate", "lint", "duplicate", "quotes", "whitespace", "environment variables"], icon: FileDigit },
  { id: "checksum", name: "File Checksum", description: "SHA hashes of any file, computed in the browser.", category: "Security", keywords: ["checksum", "file", "sha256", "sha1", "hash", "verify", "integrity", "download"], icon: FileCheck2 },
  // ---- Text
  { id: "string-case", name: "String Case", description: "Convert text between camel, snake, kebab and more.", category: "Text", keywords: ["case", "camel", "snake", "kebab", "pascal", "constant", "title", "convert", "string"], icon: CaseSensitive },
  { id: "regex", name: "Regex Tester", description: "Test regular expressions with live match highlighting.", category: "Text", keywords: ["regex", "regexp", "regular expression", "pattern", "match", "test", "groups"], icon: Regex, popular: true, shortcut: "g r" },
  { id: "text-diff", name: "Text Diff", description: "Line-by-line comparison, side by side or inline.", category: "Text", keywords: ["diff", "text", "compare", "lines", "side by side", "inline", "changes"], icon: Diff },
  { id: "text", name: "Line & Text Toolbox", description: "Sort, dedupe, trim, prefix, replace and count text.", category: "Text", keywords: ["text", "lines", "sort", "dedupe", "unique", "trim", "replace", "prefix", "suffix", "shuffle", "crlf", "word count"], icon: AlignLeft },
  { id: "slug", name: "Slug Generator", description: "Turn any text into a clean URL slug.", category: "Text", keywords: ["slug", "url", "kebab", "seo", "permalink", "accents", "transliterate"], icon: Link },
  { id: "invisible-chars", name: "Invisible Characters", description: "Find and remove zero-width and hidden characters.", category: "Text", keywords: ["invisible", "hidden chars", "zero width", "whitespace", "unicode", "nbsp", "bom", "zwsp", "clean"], icon: EyeOff, popular: true },
  { id: "unicode", name: "Unicode Inspector", description: "Code points, UTF-8 and UTF-16 bytes for any text.", category: "Text", keywords: ["unicode", "utf-8", "utf-16", "code point", "emoji", "bytes", "escape", "character"], icon: Languages },
  // ---- Git
  { id: "git-commit", name: "Git Commit Builder", description: "Compose Conventional Commit messages.", category: "Git", keywords: ["git", "commit", "conventional", "feat", "fix", "message", "scope", "breaking change"], icon: GitCommitHorizontal },
  { id: "gitignore", name: ".gitignore Generator", description: "Combine local templates into one .gitignore.", category: "Git", keywords: ["gitignore", "git", "ignore", "node", "python", "xcode", "android", "template"], icon: FileX2 },
  { id: "git-diff", name: "Git Diff Viewer", description: "Render a raw git diff with hunks and a summary.", category: "Git", keywords: ["git", "diff", "patch", "hunk", "review", "unified", "changes"], icon: GitPullRequestArrow },
  { id: "semver", name: "Semver Tool", description: "Compare, validate, bump and sort semantic versions.", category: "Git", keywords: ["semver", "version", "bump", "major", "minor", "patch", "prerelease", "compare", "sort"], icon: Tags },
  { id: "npm-range", name: "npm Range Explainer", description: "Explain what versions a range like ^5.2.1 allows.", category: "Git", keywords: ["npm", "range", "caret", "tilde", "version", "semver", "package.json", "dependency"], icon: PackageSearch },
  // ---- Web
  { id: "url", name: "URL Toolbox", description: "Encode, decode and parse URLs and query strings.", category: "Web", keywords: ["url", "uri", "encode", "decode", "query", "params", "parse", "percent"], icon: Link2 },
  { id: "meta-tags", name: "Meta Tag Generator", description: "HTML meta, Open Graph and Twitter card tags.", category: "Web", keywords: ["meta", "seo", "open graph", "og", "twitter card", "head", "title", "description", "canonical"], icon: Tag },
  { id: "og-preview", name: "Open Graph Preview", description: "Preview how a link card looks on social platforms.", category: "Web", keywords: ["open graph", "og", "preview", "social", "card", "twitter", "linkedin", "slack", "share"], icon: Share2 },
  { id: "device-info", name: "Device & Browser Info", description: "What this browser reports about itself and the screen.", category: "Web", keywords: ["device", "browser", "user agent", "screen", "viewport", "dpr", "language", "timezone", "online"], icon: MonitorSmartphone },
  // ---- CSS
  { id: "color", name: "Color Converter", description: "Convert between HEX, RGB, RGBA and HSL.", category: "CSS", keywords: ["color", "colour", "hex", "rgb", "rgba", "hsl", "css", "picker"], icon: Palette },
  { id: "css-units", name: "CSS Unit Converter", description: "px, rem and em with a configurable root size.", category: "CSS", keywords: ["css", "px", "rem", "em", "units", "convert", "font size", "root"], icon: Ruler },
  { id: "gradient", name: "Gradient Generator", description: "Build linear and radial CSS gradients visually.", category: "CSS", keywords: ["css", "gradient", "linear", "radial", "color stops", "background", "angle"], icon: Blend },
  { id: "box-shadow", name: "Box Shadow Generator", description: "Tune shadows with a live preview and CSS output.", category: "CSS", keywords: ["css", "box-shadow", "shadow", "blur", "spread", "inset", "elevation"], icon: BoxSelect },
  // ---- Images & QR
  { id: "image-color", name: "Image Color Picker", description: "Pick pixel colors and extract a palette from any image.", category: "Images & QR", keywords: ["image", "color", "picker", "palette", "dominant", "eyedropper", "pixel", "hex", "screenshot"], icon: Pipette, popular: true },
  { id: "image-metadata", name: "Image Metadata", description: "Dimensions, type, size, color profile and EXIF.", category: "Images & QR", keywords: ["image", "metadata", "exif", "dimensions", "size", "icc", "profile", "photo", "camera"], icon: ImageIcon },
  { id: "image-compress", name: "Image Compressor", description: "Shrink JPEG, PNG and WebP with a quality slider.", category: "Images & QR", keywords: ["image", "compress", "optimize", "quality", "jpeg", "webp", "png", "size", "reduce"], icon: Minimize2 },
  { id: "image-resize", name: "Image Resizer", description: "Resize by pixels or percentage, keeping aspect ratio.", category: "Images & QR", keywords: ["image", "resize", "scale", "width", "height", "aspect", "thumbnail", "percent"], icon: Scaling },
  { id: "image-convert", name: "Image Format Converter", description: "Convert between PNG, JPEG and WebP.", category: "Images & QR", keywords: ["image", "convert", "png", "jpeg", "jpg", "webp", "format"], icon: RefreshCw },
  { id: "image-base64", name: "Image → Base64", description: "Data URLs and raw Base64 from images, and back.", category: "Images & QR", keywords: ["image", "base64", "data url", "data uri", "inline", "embed", "css", "decode"], icon: FileImage },
  { id: "app-icons", name: "App Icon Generator", description: "Favicon, PWA, iOS and Android icons from one image.", category: "Images & QR", keywords: ["app icon", "favicon", "pwa", "ios", "android", "launcher", "icon", "sizes", "zip", "apple-touch-icon"], icon: AppWindow, popular: true },
  { id: "aspect-ratio", name: "Aspect Ratio", description: "Simplify ratios and resize while keeping proportions.", category: "Images & QR", keywords: ["aspect", "ratio", "16:9", "4:3", "resize", "dimensions", "width", "height", "scale"], icon: Ratio },
  { id: "qr", name: "QR Code Generator", description: "QR codes for text, URLs, Wi-Fi, email, phone and SMS.", category: "Images & QR", keywords: ["qr", "qrcode", "generate", "wifi", "url", "sms", "email", "phone", "png", "svg"], icon: QrCode, popular: true },
  { id: "qr-reader", name: "QR Code Reader", description: "Decode a QR code from an image, screenshot or paste.", category: "Images & QR", keywords: ["qr", "read", "scan", "decode", "image", "screenshot", "paste"], icon: ScanLine },
  // ---- Mobile
  { id: "deep-link", name: "Deep Link Builder", description: "Build and parse custom-scheme and universal links.", category: "Mobile", keywords: ["deep link", "universal link", "app link", "scheme", "uri", "mobile", "ios", "android", "myapp://"], icon: Smartphone },
  { id: "android-intent", name: "Android Intent URI", description: "Compose intent:// URIs with package, action and fallback.", category: "Mobile", keywords: ["android", "intent", "uri", "package", "action", "category", "fallback", "chrome", "deep link"], icon: ExternalLink },
  // ---- Networking & Geo
  { id: "cidr", name: "IP / CIDR Calculator", description: "Network, broadcast, mask and host range for IPv4.", category: "Networking & Geo", keywords: ["cidr", "subnet", "ip", "ipv4", "network", "mask", "broadcast", "hosts", "range", "vpc"], icon: Network },
  { id: "ip-converter", name: "IP ↔ Integer", description: "Convert IPv4 addresses to integers and back.", category: "Networking & Geo", keywords: ["ip", "integer", "ipv4", "number", "convert", "long", "decimal", "hex"], icon: HashIcon },
  { id: "distance", name: "Coordinate Distance", description: "Haversine distance between two lat/lng points.", category: "Networking & Geo", keywords: ["distance", "haversine", "latitude", "longitude", "gps", "km", "miles", "geo", "coordinates"], icon: MapPin },
  { id: "coordinates", name: "Lat / Lng Formatter", description: "Decimal degrees ↔ degrees, minutes, seconds.", category: "Networking & Geo", keywords: ["latitude", "longitude", "dms", "decimal degrees", "coordinates", "gps", "format", "geo"], icon: Compass },
  // ---- Generators
  { id: "uuid", name: "UUID Generator", description: "Generate and validate UUIDs.", category: "Generators", keywords: ["uuid", "guid", "v4", "generate", "validate", "random"], icon: Fingerprint, popular: true, shortcut: "g u" },
  { id: "id-generator", name: "Random ID", description: "Generate prefixed, numeric or timestamp-based IDs.", category: "Generators", keywords: ["id", "random", "generate", "order", "prefix", "alphanumeric", "timestamp", "nanoid"], icon: Shuffle },
  { id: "mock-data", name: "Mock Data Generator", description: "Fake names, emails, dates and IDs as JSON.", category: "Generators", keywords: ["mock", "fake", "data", "seed", "fixtures", "names", "emails", "json", "faker", "test data"], icon: Sparkles },
  // ---- Utilities
  { id: "permissions", name: "Unix Permissions", description: "Convert between chmod numbers and rwx notation.", category: "Utilities", keywords: ["chmod", "permissions", "unix", "linux", "755", "rwx", "octal", "file mode"], icon: Lock },
  { id: "file-size", name: "File Size", description: "Convert bytes, KB, MB, GB and TB in decimal or binary.", category: "Utilities", keywords: ["bytes", "kb", "mb", "gb", "tb", "size", "storage", "binary", "kib", "mib"], icon: HardDrive },
  { id: "tax", name: "GST / VAT Calculator", description: "Add or remove tax from an amount.", category: "Utilities", keywords: ["gst", "vat", "tax", "percentage", "inclusive", "exclusive", "invoice"], icon: Percent },
  { id: "base-converter", name: "Number Base Converter", description: "Binary, octal, decimal and hex, kept in sync.", category: "Utilities", keywords: ["binary", "octal", "decimal", "hex", "hexadecimal", "base", "radix", "convert", "number"], icon: Calculator },
  { id: "bitwise", name: "Bitwise Calculator", description: "AND, OR, XOR, NOT and shifts in binary, decimal and hex.", category: "Utilities", keywords: ["bitwise", "and", "or", "xor", "not", "shift", "binary", "bits", "flags", "mask"], icon: Cpu },
  { id: "stack-trace", name: "Stack Trace Cleaner", description: "Highlight app frames and collapse framework noise.", category: "Utilities", keywords: ["stack trace", "error", "exception", "crash", "javascript", "node", "react native", "android", "java", "swift", "debug"], icon: Bug },
  { id: "logs", name: "Log Pretty Printer", description: "Color levels, filter, search and expand JSON logs.", category: "Utilities", keywords: ["logs", "log", "pretty", "json logs", "error", "warn", "info", "debug", "filter", "search", "timestamps"], icon: ScrollText },
];

export const tools: ToolWithRoute[] = definitions.map((t) => ({
  ...t,
  href: `/tools/${t.id}`,
}));

export const popularTools = tools.filter((t) => t.popular);

const byId = new Map(tools.map((t) => [t.id, t]));

export function getTool(id: string): ToolWithRoute | undefined {
  return byId.get(id);
}

export function toolsByCategory(category: ToolCategory): ToolWithRoute[] {
  return tools.filter((t) => t.category === category);
}

/** Bounded Levenshtein distance (early exit above `max`). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

interface Indexed {
  tool: ToolWithRoute;
  name: string;
  nameWords: string[];
  desc: string;
  cat: string;
  kws: string[];
  kwWords: string[];
}

const index: Indexed[] = tools.map((tool) => {
  const name = tool.name.toLowerCase();
  const kws = tool.keywords.map((k) => k.toLowerCase());
  return {
    tool,
    name,
    nameWords: name.split(/[^a-z0-9]+/).filter(Boolean),
    desc: tool.description.toLowerCase(),
    cat: tool.category.toLowerCase(),
    kws,
    kwWords: Array.from(new Set(kws.flatMap((k) => k.split(/[^a-z0-9]+/)).filter(Boolean))),
  };
});

/**
 * Ranked, forgiving search across name, description, keywords and category.
 * Tolerates a one-character typo on longer terms and matches word prefixes.
 */
export function searchTools(query: string): ToolWithRoute[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ tool: ToolWithRoute; score: number }> = [];
  for (const entry of index) {
    let score = 0;
    let matchedTerms = 0;
    for (const term of terms) {
      let s = 0;
      if (entry.name === term) s = 30;
      else if (entry.name.startsWith(term)) s = 18;
      else if (entry.nameWords.some((w) => w.startsWith(term))) s = 14;
      else if (entry.name.includes(term)) s = 10;
      if (entry.kws.includes(term)) s = Math.max(s, 14);
      else if (entry.kwWords.some((w) => w.startsWith(term))) s = Math.max(s, 8);
      else if (entry.kws.some((k) => k.includes(term))) s = Math.max(s, 6);
      if (entry.cat.includes(term)) s = Math.max(s, 5);
      if (entry.desc.includes(term)) s = Math.max(s, 3);
      if (s === 0 && term.length >= 3) {
        const max = term.length >= 7 ? 2 : 1;
        // Short terms only fuzz against name words to keep results relevant
        const pool = term.length >= 4 ? [...entry.nameWords, ...entry.kwWords] : entry.nameWords;
        const fuzzy = pool.some((w) => w.length >= 3 && editDistance(term, w, max) <= max);
        if (fuzzy) s = 4;
      }
      if (s > 0) matchedTerms++;
      score += s;
    }
    // Multi-word queries: require most terms to match somewhere
    if (matchedTerms === 0 || (terms.length > 1 && matchedTerms < terms.length - 1)) continue;
    if (entry.tool.popular) score += 1;
    scored.push({ tool: entry.tool, score });
  }
  scored.sort((a, b) => b.score - a.score || a.tool.name.length - b.tool.name.length || a.tool.name.localeCompare(b.tool.name));
  return scored.map((s) => s.tool);
}

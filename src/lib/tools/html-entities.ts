export type EntityCategory = "html" | "space" | "punctuation" | "currency" | "math" | "arrows" | "symbols" | "latin" | "greek";

export interface HtmlEntity {
  /** Entity name without & and ;, or null when the character has no named entity */
  name: string | null;
  char: string;
  code: number;
  description: string;
  category: EntityCategory;
}

export const ENTITY_CATEGORIES: Array<{ id: EntityCategory; label: string }> = [
  { id: "html", label: "HTML" },
  { id: "space", label: "Spaces" },
  { id: "punctuation", label: "Punctuation" },
  { id: "currency", label: "Currency" },
  { id: "math", label: "Math" },
  { id: "arrows", label: "Arrows" },
  { id: "symbols", label: "Symbols" },
  { id: "latin", label: "Latin" },
  { id: "greek", label: "Greek" },
];

type Row = [name: string | null, code: number, description: string, category: EntityCategory];

// Named entities per the HTML Living Standard. A few common characters without a
// name (e.g. ₹, ⚠) are listed with name: null so they still show up in Lookup.
const ROWS: Row[] = [
  ["amp", 38, "Ampersand", "html"],
  ["lt", 60, "Less-than sign", "html"],
  ["gt", 62, "Greater-than sign", "html"],
  ["quot", 34, "Double quotation mark", "html"],
  ["apos", 39, "Apostrophe (single quote)", "html"],
  ["nbsp", 160, "Non-breaking space", "space"],
  ["ensp", 8194, "En space", "space"],
  ["emsp", 8195, "Em space", "space"],
  ["thinsp", 8201, "Thin space", "space"],
  ["zwnj", 8204, "Zero-width non-joiner", "space"],
  ["zwj", 8205, "Zero-width joiner", "space"],
  ["lrm", 8206, "Left-to-right mark", "space"],
  ["rlm", 8207, "Right-to-left mark", "space"],
  ["shy", 173, "Soft hyphen", "space"],
  [null, 8203, "Zero-width space", "space"],
  ["iexcl", 161, "Inverted exclamation mark", "punctuation"],
  ["iquest", 191, "Inverted question mark", "punctuation"],
  ["sect", 167, "Section sign", "punctuation"],
  ["para", 182, "Pilcrow (paragraph sign)", "punctuation"],
  ["middot", 183, "Middle dot", "punctuation"],
  ["laquo", 171, "Left angle quotation mark", "punctuation"],
  ["raquo", 187, "Right angle quotation mark", "punctuation"],
  ["ndash", 8211, "En dash", "punctuation"],
  ["mdash", 8212, "Em dash", "punctuation"],
  ["lsquo", 8216, "Left single quotation mark", "punctuation"],
  ["rsquo", 8217, "Right single quotation mark", "punctuation"],
  ["sbquo", 8218, "Single low-9 quotation mark", "punctuation"],
  ["ldquo", 8220, "Left double quotation mark", "punctuation"],
  ["rdquo", 8221, "Right double quotation mark", "punctuation"],
  ["bdquo", 8222, "Double low-9 quotation mark", "punctuation"],
  ["dagger", 8224, "Dagger", "punctuation"],
  ["Dagger", 8225, "Double dagger", "punctuation"],
  ["bull", 8226, "Bullet", "punctuation"],
  ["hellip", 8230, "Horizontal ellipsis", "punctuation"],
  ["permil", 8240, "Per mille sign", "punctuation"],
  ["prime", 8242, "Prime (minutes, feet)", "punctuation"],
  ["Prime", 8243, "Double prime (seconds, inches)", "punctuation"],
  ["lsaquo", 8249, "Single left angle quotation mark", "punctuation"],
  ["rsaquo", 8250, "Single right angle quotation mark", "punctuation"],
  ["oline", 8254, "Overline", "punctuation"],
  ["brvbar", 166, "Broken vertical bar", "punctuation"],
  ["uml", 168, "Diaeresis (umlaut)", "punctuation"],
  ["macr", 175, "Macron", "punctuation"],
  ["acute", 180, "Acute accent", "punctuation"],
  ["cedil", 184, "Cedilla", "punctuation"],
  ["ordf", 170, "Feminine ordinal indicator", "punctuation"],
  ["ordm", 186, "Masculine ordinal indicator", "punctuation"],
  ["sup1", 185, "Superscript one", "punctuation"],
  ["sup2", 178, "Superscript two", "punctuation"],
  ["sup3", 179, "Superscript three", "punctuation"],
  ["frasl", 8260, "Fraction slash", "punctuation"],
  ["circ", 710, "Modifier letter circumflex accent", "punctuation"],
  ["tilde", 732, "Small tilde", "punctuation"],
  ["hyphen", 8208, "Hyphen", "punctuation"],
  ["caret", 8257, "Caret insertion point", "punctuation"],
  ["cent", 162, "Cent sign", "currency"],
  ["pound", 163, "Pound sign", "currency"],
  ["curren", 164, "Generic currency sign", "currency"],
  ["yen", 165, "Yen / yuan sign", "currency"],
  ["euro", 8364, "Euro sign", "currency"],
  [null, 8377, "Indian rupee sign", "currency"],
  [null, 8381, "Russian ruble sign", "currency"],
  [null, 8361, "Won sign", "currency"],
  [null, 8362, "New sheqel sign", "currency"],
  [null, 8378, "Turkish lira sign", "currency"],
  [null, 8383, "Bitcoin sign", "currency"],
  ["copy", 169, "Copyright sign", "symbols"],
  ["reg", 174, "Registered trademark sign", "symbols"],
  ["trade", 8482, "Trademark sign", "symbols"],
  ["deg", 176, "Degree sign", "symbols"],
  ["micro", 181, "Micro sign", "symbols"],
  ["hearts", 9829, "Black heart suit", "symbols"],
  ["spades", 9824, "Black spade suit", "symbols"],
  ["clubs", 9827, "Black club suit", "symbols"],
  ["diams", 9830, "Black diamond suit", "symbols"],
  ["loz", 9674, "Lozenge", "symbols"],
  ["check", 10003, "Check mark", "symbols"],
  ["cross", 10007, "Ballot X", "symbols"],
  ["starf", 9733, "Black star", "symbols"],
  ["star", 9734, "White star", "symbols"],
  ["phone", 9742, "Black telephone", "symbols"],
  ["female", 9792, "Female sign", "symbols"],
  ["male", 9794, "Male sign", "symbols"],
  ["sung", 9834, "Eighth note", "symbols"],
  ["flat", 9837, "Music flat sign", "symbols"],
  ["natural", 9838, "Music natural sign", "symbols"],
  ["sharp", 9839, "Music sharp sign", "symbols"],
  ["sext", 10038, "Six-pointed black star", "symbols"],
  ["malt", 10016, "Maltese cross", "symbols"],
  ["bigstar", 9733, "Black star", "symbols"],
  ["boxh", 9472, "Box drawing horizontal", "symbols"],
  ["boxv", 9474, "Box drawing vertical", "symbols"],
  ["squ", 9633, "White square", "symbols"],
  ["squf", 9642, "Black small square", "symbols"],
  ["cir", 9675, "White circle", "symbols"],
  ["blk14", 9617, "Light shade block", "symbols"],
  ["blk12", 9618, "Medium shade block", "symbols"],
  ["blk34", 9619, "Dark shade block", "symbols"],
  ["block", 9608, "Full block", "symbols"],
  [null, 9745, "Ballot box with check", "symbols"],
  [null, 9888, "Warning sign", "symbols"],
  [null, 9993, "Envelope", "symbols"],
  [null, 9728, "Black sun with rays", "symbols"],
  [null, 9729, "Cloud", "symbols"],
  [null, 9731, "Snowman", "symbols"],
  [null, 9835, "Beamed eighth notes", "symbols"],
  [null, 10084, "Heavy black heart", "symbols"],
  [null, 11088, "White medium star", "symbols"],
  ["plusmn", 177, "Plus-minus sign", "math"],
  ["times", 215, "Multiplication sign", "math"],
  ["divide", 247, "Division sign", "math"],
  ["minus", 8722, "Minus sign", "math"],
  ["lowast", 8727, "Asterisk operator", "math"],
  ["radic", 8730, "Square root", "math"],
  ["prop", 8733, "Proportional to", "math"],
  ["infin", 8734, "Infinity", "math"],
  ["ang", 8736, "Angle", "math"],
  ["and", 8743, "Logical and", "math"],
  ["or", 8744, "Logical or", "math"],
  ["cap", 8745, "Intersection", "math"],
  ["cup", 8746, "Union", "math"],
  ["int", 8747, "Integral", "math"],
  ["there4", 8756, "Therefore", "math"],
  ["sim", 8764, "Tilde operator (similar to)", "math"],
  ["cong", 8773, "Approximately equal to", "math"],
  ["asymp", 8776, "Almost equal to", "math"],
  ["ne", 8800, "Not equal to", "math"],
  ["equiv", 8801, "Identical to", "math"],
  ["le", 8804, "Less-than or equal to", "math"],
  ["ge", 8805, "Greater-than or equal to", "math"],
  ["sub", 8834, "Subset of", "math"],
  ["sup", 8835, "Superset of", "math"],
  ["nsub", 8836, "Not a subset of", "math"],
  ["sube", 8838, "Subset of or equal to", "math"],
  ["supe", 8839, "Superset of or equal to", "math"],
  ["oplus", 8853, "Circled plus", "math"],
  ["otimes", 8855, "Circled times", "math"],
  ["perp", 8869, "Up tack (perpendicular)", "math"],
  ["sdot", 8901, "Dot operator", "math"],
  ["forall", 8704, "For all", "math"],
  ["part", 8706, "Partial differential", "math"],
  ["exist", 8707, "There exists", "math"],
  ["empty", 8709, "Empty set", "math"],
  ["nabla", 8711, "Nabla", "math"],
  ["isin", 8712, "Element of", "math"],
  ["notin", 8713, "Not an element of", "math"],
  ["ni", 8715, "Contains as member", "math"],
  ["prod", 8719, "N-ary product", "math"],
  ["sum", 8721, "N-ary summation", "math"],
  ["fnof", 402, "Latin small f with hook (function)", "math"],
  ["weierp", 8472, "Script capital P", "math"],
  ["image", 8465, "Blackletter capital I", "math"],
  ["real", 8476, "Blackletter capital R", "math"],
  ["alefsym", 8501, "Alef symbol", "math"],
  ["lceil", 8968, "Left ceiling", "math"],
  ["rceil", 8969, "Right ceiling", "math"],
  ["lfloor", 8970, "Left floor", "math"],
  ["rfloor", 8971, "Right floor", "math"],
  ["lang", 10216, "Left angle bracket", "math"],
  ["rang", 10217, "Right angle bracket", "math"],
  ["frac12", 189, "Fraction one half", "math"],
  ["frac14", 188, "Fraction one quarter", "math"],
  ["frac34", 190, "Fraction three quarters", "math"],
  ["frac13", 8531, "Fraction one third", "math"],
  ["frac23", 8532, "Fraction two thirds", "math"],
  ["frac18", 8539, "Fraction one eighth", "math"],
  ["not", 172, "Not sign", "math"],
  ["percnt", 37, "Percent sign", "math"],
  ["half", 189, "Fraction one half", "math"],
  ["approx", 8776, "Almost equal to", "math"],
  ["leq", 8804, "Less-than or equal to", "math"],
  ["geq", 8805, "Greater-than or equal to", "math"],
  ["neq", 8800, "Not equal to", "math"],
  ["Sqrt", 8730, "Square root", "math"],
  ["emptyset", 8709, "Empty set", "math"],
  ["in", 8712, "Element of", "math"],
  ["larr", 8592, "Leftwards arrow", "arrows"],
  ["uarr", 8593, "Upwards arrow", "arrows"],
  ["rarr", 8594, "Rightwards arrow", "arrows"],
  ["darr", 8595, "Downwards arrow", "arrows"],
  ["harr", 8596, "Left-right arrow", "arrows"],
  ["crarr", 8629, "Carriage return arrow", "arrows"],
  ["lArr", 8656, "Leftwards double arrow", "arrows"],
  ["uArr", 8657, "Upwards double arrow", "arrows"],
  ["rArr", 8658, "Rightwards double arrow", "arrows"],
  ["dArr", 8659, "Downwards double arrow", "arrows"],
  ["hArr", 8660, "Left-right double arrow", "arrows"],
  ["varr", 8597, "Up-down arrow", "arrows"],
  ["nwarr", 8598, "North west arrow", "arrows"],
  ["nearr", 8599, "North east arrow", "arrows"],
  ["searr", 8600, "South east arrow", "arrows"],
  ["swarr", 8601, "South west arrow", "arrows"],
  ["larrhk", 8617, "Leftwards arrow with hook", "arrows"],
  ["rarrhk", 8618, "Rightwards arrow with hook", "arrows"],
  ["lrarr", 8646, "Leftwards arrow over rightwards arrow", "arrows"],
  ["rlarr", 8644, "Rightwards arrow over leftwards arrow", "arrows"],
  ["map", 8614, "Rightwards arrow from bar (maps to)", "arrows"],
  ["Rarr", 8608, "Rightwards two-headed arrow", "arrows"],
  ["Larr", 8606, "Leftwards two-headed arrow", "arrows"],
  [null, 10132, "Black rightwards arrow", "arrows"],
  [null, 10145, "Black rightwards arrow (emoji style)", "arrows"],
  ["Alpha", 913, "Greek capital letter alpha", "greek"],
  ["alpha", 945, "Greek small letter alpha", "greek"],
  ["Beta", 914, "Greek capital letter beta", "greek"],
  ["beta", 946, "Greek small letter beta", "greek"],
  ["Gamma", 915, "Greek capital letter gamma", "greek"],
  ["gamma", 947, "Greek small letter gamma", "greek"],
  ["Delta", 916, "Greek capital letter delta", "greek"],
  ["delta", 948, "Greek small letter delta", "greek"],
  ["Epsilon", 917, "Greek capital letter epsilon", "greek"],
  ["epsilon", 949, "Greek small letter epsilon", "greek"],
  ["Zeta", 918, "Greek capital letter zeta", "greek"],
  ["zeta", 950, "Greek small letter zeta", "greek"],
  ["Eta", 919, "Greek capital letter eta", "greek"],
  ["eta", 951, "Greek small letter eta", "greek"],
  ["Theta", 920, "Greek capital letter theta", "greek"],
  ["theta", 952, "Greek small letter theta", "greek"],
  ["Iota", 921, "Greek capital letter iota", "greek"],
  ["iota", 953, "Greek small letter iota", "greek"],
  ["Kappa", 922, "Greek capital letter kappa", "greek"],
  ["kappa", 954, "Greek small letter kappa", "greek"],
  ["Lambda", 923, "Greek capital letter lambda", "greek"],
  ["lambda", 955, "Greek small letter lambda", "greek"],
  ["Mu", 924, "Greek capital letter mu", "greek"],
  ["mu", 956, "Greek small letter mu", "greek"],
  ["Nu", 925, "Greek capital letter nu", "greek"],
  ["nu", 957, "Greek small letter nu", "greek"],
  ["Xi", 926, "Greek capital letter xi", "greek"],
  ["xi", 958, "Greek small letter xi", "greek"],
  ["Omicron", 927, "Greek capital letter omicron", "greek"],
  ["omicron", 959, "Greek small letter omicron", "greek"],
  ["Pi", 928, "Greek capital letter pi", "greek"],
  ["pi", 960, "Greek small letter pi", "greek"],
  ["Rho", 929, "Greek capital letter rho", "greek"],
  ["rho", 961, "Greek small letter rho", "greek"],
  ["Sigma", 931, "Greek capital letter sigma", "greek"],
  ["sigma", 963, "Greek small letter sigma", "greek"],
  ["Tau", 932, "Greek capital letter tau", "greek"],
  ["tau", 964, "Greek small letter tau", "greek"],
  ["Upsilon", 933, "Greek capital letter upsilon", "greek"],
  ["upsilon", 965, "Greek small letter upsilon", "greek"],
  ["Phi", 934, "Greek capital letter phi", "greek"],
  ["phi", 966, "Greek small letter phi", "greek"],
  ["Chi", 935, "Greek capital letter chi", "greek"],
  ["chi", 967, "Greek small letter chi", "greek"],
  ["Psi", 936, "Greek capital letter psi", "greek"],
  ["psi", 968, "Greek small letter psi", "greek"],
  ["Omega", 937, "Greek capital letter omega", "greek"],
  ["omega", 969, "Greek small letter omega", "greek"],
  ["sigmaf", 962, "Greek small letter final sigma", "greek"],
  ["thetasym", 977, "Greek theta symbol", "greek"],
  ["upsih", 978, "Greek upsilon with hook symbol", "greek"],
  ["piv", 982, "Greek pi symbol", "greek"],
  ["Agrave", 192, "Latin Capital letter a with grave", "latin"],
  ["Aacute", 193, "Latin Capital letter a with acute", "latin"],
  ["Acirc", 194, "Latin Capital letter a with circumflex", "latin"],
  ["Atilde", 195, "Latin Capital letter a with tilde", "latin"],
  ["Auml", 196, "Latin Capital letter a with diaeresis", "latin"],
  ["Aring", 197, "Latin Capital letter a with ring above", "latin"],
  ["AElig", 198, "Latin Capital letter ae", "latin"],
  ["Ccedil", 199, "Latin Capital letter c with cedilla", "latin"],
  ["Egrave", 200, "Latin Capital letter e with grave", "latin"],
  ["Eacute", 201, "Latin Capital letter e with acute", "latin"],
  ["Ecirc", 202, "Latin Capital letter e with circumflex", "latin"],
  ["Euml", 203, "Latin Capital letter e with diaeresis", "latin"],
  ["Igrave", 204, "Latin Capital letter i with grave", "latin"],
  ["Iacute", 205, "Latin Capital letter i with acute", "latin"],
  ["Icirc", 206, "Latin Capital letter i with circumflex", "latin"],
  ["Iuml", 207, "Latin Capital letter i with diaeresis", "latin"],
  ["ETH", 208, "Latin Capital letter eth", "latin"],
  ["Ntilde", 209, "Latin Capital letter n with tilde", "latin"],
  ["Ograve", 210, "Latin Capital letter o with grave", "latin"],
  ["Oacute", 211, "Latin Capital letter o with acute", "latin"],
  ["Ocirc", 212, "Latin Capital letter o with circumflex", "latin"],
  ["Otilde", 213, "Latin Capital letter o with tilde", "latin"],
  ["Ouml", 214, "Latin Capital letter o with diaeresis", "latin"],
  ["Oslash", 216, "Latin Capital letter o with stroke", "latin"],
  ["Ugrave", 217, "Latin Capital letter u with grave", "latin"],
  ["Uacute", 218, "Latin Capital letter u with acute", "latin"],
  ["Ucirc", 219, "Latin Capital letter u with circumflex", "latin"],
  ["Uuml", 220, "Latin Capital letter u with diaeresis", "latin"],
  ["Yacute", 221, "Latin Capital letter y with acute", "latin"],
  ["THORN", 222, "Latin Capital letter thorn", "latin"],
  ["szlig", 223, "Latin Small letter sharp s", "latin"],
  ["agrave", 224, "Latin Small letter a with grave", "latin"],
  ["aacute", 225, "Latin Small letter a with acute", "latin"],
  ["acirc", 226, "Latin Small letter a with circumflex", "latin"],
  ["atilde", 227, "Latin Small letter a with tilde", "latin"],
  ["auml", 228, "Latin Small letter a with diaeresis", "latin"],
  ["aring", 229, "Latin Small letter a with ring above", "latin"],
  ["aelig", 230, "Latin Small letter ae", "latin"],
  ["ccedil", 231, "Latin Small letter c with cedilla", "latin"],
  ["egrave", 232, "Latin Small letter e with grave", "latin"],
  ["eacute", 233, "Latin Small letter e with acute", "latin"],
  ["ecirc", 234, "Latin Small letter e with circumflex", "latin"],
  ["euml", 235, "Latin Small letter e with diaeresis", "latin"],
  ["igrave", 236, "Latin Small letter i with grave", "latin"],
  ["iacute", 237, "Latin Small letter i with acute", "latin"],
  ["icirc", 238, "Latin Small letter i with circumflex", "latin"],
  ["iuml", 239, "Latin Small letter i with diaeresis", "latin"],
  ["eth", 240, "Latin Small letter eth", "latin"],
  ["ntilde", 241, "Latin Small letter n with tilde", "latin"],
  ["ograve", 242, "Latin Small letter o with grave", "latin"],
  ["oacute", 243, "Latin Small letter o with acute", "latin"],
  ["ocirc", 244, "Latin Small letter o with circumflex", "latin"],
  ["otilde", 245, "Latin Small letter o with tilde", "latin"],
  ["ouml", 246, "Latin Small letter o with diaeresis", "latin"],
  ["oslash", 248, "Latin Small letter o with stroke", "latin"],
  ["ugrave", 249, "Latin Small letter u with grave", "latin"],
  ["uacute", 250, "Latin Small letter u with acute", "latin"],
  ["ucirc", 251, "Latin Small letter u with circumflex", "latin"],
  ["uuml", 252, "Latin Small letter u with diaeresis", "latin"],
  ["yacute", 253, "Latin Small letter y with acute", "latin"],
  ["thorn", 254, "Latin Small letter thorn", "latin"],
  ["yuml", 255, "Latin Small letter y with diaeresis", "latin"],
  ["OElig", 338, "Latin capital ligature OE", "latin"],
  ["oelig", 339, "Latin small ligature oe", "latin"],
  ["Scaron", 352, "Latin capital letter S with caron", "latin"],
  ["scaron", 353, "Latin small letter s with caron", "latin"],
  ["Yuml", 376, "Latin capital letter Y with diaeresis", "latin"],
  ["Zcaron", 381, "Latin capital letter Z with caron", "latin"],
  ["zcaron", 382, "Latin small letter z with caron", "latin"],
  ["inodot", 305, "Latin small letter dotless i", "latin"],
  ["Lstrok", 321, "Latin capital letter L with stroke", "latin"],
  ["lstrok", 322, "Latin small letter l with stroke", "latin"],];

export const HTML_ENTITIES: HtmlEntity[] = ROWS.map(([name, code, description, category]) => ({ name, char: String.fromCodePoint(code), code, description, category }));

const BY_NAME = new Map<string, HtmlEntity>();
const BY_CHAR = new Map<string, HtmlEntity>();
for (const e of HTML_ENTITIES) {
  if (e.name && !BY_NAME.has(e.name)) BY_NAME.set(e.name, e);
  if (!BY_CHAR.has(e.char) && e.name) BY_CHAR.set(e.char, e);
}

/** Entities browsers decode even without a trailing semicolon (HTML4 legacy). */
const LEGACY_NO_SEMICOLON = new Set(["amp", "lt", "gt", "quot", "nbsp", "copy", "reg"]);

/** Browsers map numeric references in the C1 control range to Windows-1252 characters. */
const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d,
  0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

export type EncodeMode = "named" | "numeric" | "hex";

export interface EncodeOptions {
  mode: EncodeMode;
  /** Only escape & < > " ' (what you need to embed text safely in HTML). */
  onlyUnsafe: boolean;
}

const UNSAFE = new Set(["&", "<", ">", '"', "'"]);

function numericRef(code: number, mode: EncodeMode): string {
  return mode === "hex" ? `&#x${code.toString(16).toUpperCase()};` : `&#${code};`;
}

export function encodeEntities(text: string, opts: EncodeOptions): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const unsafe = UNSAFE.has(ch);
    if (!unsafe && (opts.onlyUnsafe || code < 0x7f)) {
      out += ch;
      continue;
    }
    if (opts.mode === "named") {
      const named = BY_CHAR.get(ch);
      out += named?.name ? `&${named.name};` : numericRef(code, "numeric");
    } else {
      out += numericRef(code, opts.mode);
    }
  }
  return out;
}

/**
 * Decode named, decimal and hex references in one pass (so "&amp;lt;" becomes
 * "&lt;", never "<"). Unknown or malformed references are left untouched.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{0,31}))(;?)/g, (whole, hex: string | undefined, dec: string | undefined, name: string | undefined, semi: string) => {
    if (name !== undefined) {
      if (!semi && !LEGACY_NO_SEMICOLON.has(name)) return whole;
      const e = BY_NAME.get(name);
      return e ? e.char : whole;
    }
    let code = hex !== undefined ? parseInt(hex, 16) : parseInt(dec ?? "", 10);
    if (!Number.isFinite(code)) return whole;
    if (code in CP1252) code = CP1252[code];
    if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

export function entityForChar(char: string): HtmlEntity | undefined {
  const first = Array.from(char)[0];
  if (!first) return undefined;
  return BY_CHAR.get(first) ?? HTML_ENTITIES.find((e) => e.char === first);
}

/** Match by name, character, code (decimal, 0x hex or U+ hex) or description. */
export function searchEntities(query: string, category?: EntityCategory): HtmlEntity[] {
  const q = query.trim();
  const pool = category ? HTML_ENTITIES.filter((e) => e.category === category) : HTML_ENTITIES;
  if (!q) return pool;
  const lower = q.toLowerCase();
  const bare = lower.replace(/^&/, "").replace(/;$/, "");
  let codeQuery: number | null = null;
  if (/^(0x|u\+|#x)[0-9a-f]+$/i.test(bare)) codeQuery = parseInt(bare.replace(/^(0x|u\+|#x)/i, ""), 16);
  else if (/^#?\d+$/.test(bare)) codeQuery = parseInt(bare.replace("#", ""), 10);
  const scored: Array<{ e: HtmlEntity; score: number }> = [];
  for (const e of pool) {
    const name = e.name?.toLowerCase() ?? "";
    let score = 0;
    if (e.char === q) score = 100;
    else if (codeQuery !== null && e.code === codeQuery) score = 90;
    else if (name && name === bare) score = 80;
    else if (name && name.startsWith(bare)) score = 60;
    else if (name && name.includes(bare)) score = 40;
    else if (e.description.toLowerCase().includes(lower)) score = 20;
    if (score) scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.e.code - b.e.code).map((s) => s.e);
}

export const HTML_ENTITIES_SAMPLE = `<a href="/docs?x=1&y=2">Tom & Jerry's “Guide”</a> — © 2024 · Price: €9.99 → ½ off!`;

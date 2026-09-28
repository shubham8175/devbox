export interface StrengthFinding {
  severity: "high" | "medium" | "low";
  message: string;
}

export interface StrengthReport {
  length: number;
  classes: { lower: boolean; upper: boolean; digit: boolean; symbol: boolean; other: boolean };
  classCount: number;
  charsetSize: number;
  naiveEntropy: number;
  adjustedEntropy: number;
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  guessesOrder: string;
  findings: StrengthFinding[];
}

const COMMON = new Set([
  "123456", "password", "123456789", "12345678", "12345", "1234567", "qwerty", "abc123", "111111", "123123", "admin", "letmein", "welcome", "monkey",
  "dragon", "login", "princess", "football", "iloveyou", "sunshine", "master", "shadow", "ashley", "michael", "superman", "batman", "trustno1", "passw0rd",
  "password1", "password123", "qwerty123", "1q2w3e4r", "zaq12wsx", "1qaz2wsx", "000000", "654321", "987654321", "666666", "121212", "112233", "aa123456",
  "google", "hello", "hello123", "charlie", "donald", "starwars", "whatever", "freedom", "secret", "summer", "winter", "cheese", "computer", "internet",
  "pokemon", "flower", "jordan", "hunter", "ranger", "buster", "soccer", "hockey", "killer", "george", "andrew", "thomas", "jessica", "pepper", "daniel",
  "access", "mustang", "maggie", "biteme", "ginger", "harley", "cookie", "silver", "orange", "purple", "banana", "test", "test123", "root", "toor",
  "changeme", "default", "guest", "user", "temp", "temp123", "pass", "pass123", "qwertyuiop", "asdfghjkl", "zxcvbnm", "asdf", "asdfasdf", "qazwsx",
  "abcdef", "abcd1234", "1234", "12345678910", "india123", "welcome1", "welcome123", "admin123", "administrator", "p@ssw0rd", "p@ssword", "letmein123",
]);

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "!@#$%^&*()"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

function unleet(s: string): string {
  return Array.from(s.toLowerCase(), (c) => LEET[c] ?? c).join("");
}

function hasSequence(s: string, minLen = 4): boolean {
  const lower = s.toLowerCase();
  for (let i = 0; i + minLen <= lower.length; i++) {
    const chunk = lower.slice(i, i + minLen);
    const codes = Array.from(chunk, (c) => c.charCodeAt(0));
    const asc = codes.every((c, k) => k === 0 || c === codes[k - 1] + 1);
    const desc = codes.every((c, k) => k === 0 || c === codes[k - 1] - 1);
    if (asc || desc) return true;
  }
  return false;
}

function hasKeyboardRun(s: string, minLen = 4): boolean {
  const lower = s.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    const rev = row.split("").reverse().join("");
    for (let i = 0; i + minLen <= row.length; i++) {
      if (lower.includes(row.slice(i, i + minLen)) || lower.includes(rev.slice(i, i + minLen))) return true;
    }
  }
  return false;
}

function repeatedRun(s: string): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    run = s[i] === s[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function repeatedPattern(s: string): string | null {
  for (let len = 1; len <= Math.floor(s.length / 2); len++) {
    const unit = s.slice(0, len);
    if (unit.repeat(Math.ceil(s.length / len)).slice(0, s.length) === s && s.length >= len * 2) return unit;
  }
  return null;
}

export function analyzePassword(pw: string): StrengthReport | null {
  if (!pw) return null;
  const chars = Array.from(pw);
  const classes = {
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9\s]/.test(pw),
    other: /\s|[^\x20-\x7e]/.test(pw),
  };
  const classCount = [classes.lower, classes.upper, classes.digit, classes.symbol].filter(Boolean).length;
  let charsetSize = 0;
  if (classes.lower) charsetSize += 26;
  if (classes.upper) charsetSize += 26;
  if (classes.digit) charsetSize += 10;
  if (classes.symbol) charsetSize += 33;
  if (classes.other) charsetSize += 100;
  const naiveEntropy = charsetSize ? chars.length * Math.log2(charsetSize) : 0;

  const findings: StrengthFinding[] = [];
  let penalty = 0;

  const lower = pw.toLowerCase();
  const stripped = unleet(pw).replace(/[^a-z]/g, "");
  const strippedDigits = lower.replace(/\D/g, "");
  if (COMMON.has(lower) || COMMON.has(unleet(pw))) {
    findings.push({ severity: "high", message: "This is one of the most commonly used passwords. It would be guessed almost immediately." });
    penalty += naiveEntropy;
  } else if ([...COMMON].some((c) => c.length >= 5 && (lower.includes(c) || stripped.includes(c) || strippedDigits === c))) {
    findings.push({ severity: "high", message: "Contains a very common password or word (even with letter/number substitutions)." });
    penalty += Math.min(naiveEntropy * 0.6, 40);
  }
  if (chars.length < 8) {
    findings.push({ severity: "high", message: `Only ${chars.length} characters. Anything under 8 is trivial to brute-force; 12+ is a sensible minimum.` });
  } else if (chars.length < 12) {
    findings.push({ severity: "medium", message: `${chars.length} characters. Longer passwords (12–16+) add far more strength than extra symbols.` });
  }
  if (classCount <= 1) findings.push({ severity: "medium", message: "Uses a single character class. Mixing letters, numbers and symbols enlarges the search space." });
  else if (classCount === 2) findings.push({ severity: "low", message: "Two character classes. Adding a third helps against dictionary-style attacks." });
  const run = repeatedRun(pw);
  if (run >= 3) {
    findings.push({ severity: "medium", message: `A character repeats ${run} times in a row (e.g. “${pw.match(/(.)\1{2,}/)?.[0]}”). Repeats add little strength.` });
    penalty += (run - 1) * 3;
  }
  const unit = repeatedPattern(pw);
  if (unit) {
    findings.push({ severity: "high", message: `The whole password is “${unit}” repeated. Attackers try repeated patterns early.` });
    penalty += naiveEntropy / 2;
  }
  if (hasSequence(pw)) {
    findings.push({ severity: "medium", message: "Contains a straight sequence like abcd or 1234." });
    penalty += 10;
  }
  if (hasKeyboardRun(pw)) {
    findings.push({ severity: "medium", message: "Contains a keyboard walk like qwerty or asdf." });
    penalty += 10;
  }
  if (/^(19|20)\d{2}$/.test(strippedDigits) || /(19|20)\d{2}/.test(pw)) {
    findings.push({ severity: "low", message: "Looks like it includes a year. Dates are among the first guesses." });
    penalty += 6;
  }
  if (/^[A-Z][a-z]+\d{1,4}[!?.]?$/.test(pw)) {
    findings.push({ severity: "medium", message: "Follows the classic “Word123!” shape that cracking rules target first." });
    penalty += 12;
  }
  if (/[^\x20-\x7e]/.test(pw)) findings.push({ severity: "low", message: "Contains non-ASCII characters. Strong, but check every login form accepts them." });

  const adjustedEntropy = Math.max(0, naiveEntropy - penalty);
  let score: StrengthReport["score"] = 0;
  if (adjustedEntropy >= 80) score = 4;
  else if (adjustedEntropy >= 60) score = 3;
  else if (adjustedEntropy >= 40) score = 2;
  else if (adjustedEntropy >= 25) score = 1;
  const label = ["Very weak", "Weak", "Fair", "Strong", "Very strong"][score];
  const guesses = Math.pow(2, adjustedEntropy);
  const exp = Math.floor(Math.log10(Math.max(1, guesses)));
  const guessesOrder = exp < 3 ? `under a thousand` : `about 10^${exp}`;

  if (!findings.length) findings.push({ severity: "low", message: "No obvious weaknesses detected by these heuristics." });

  return {
    length: chars.length,
    classes,
    classCount,
    charsetSize,
    naiveEntropy: Math.round(naiveEntropy * 10) / 10,
    adjustedEntropy: Math.round(adjustedEntropy * 10) / 10,
    score,
    label,
    guessesOrder,
    findings,
  };
}

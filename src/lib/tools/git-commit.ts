export const COMMIT_TYPES: Array<{ type: string; label: string; hint: string }> = [
  { type: "feat", label: "feat", hint: "A new feature" },
  { type: "fix", label: "fix", hint: "A bug fix" },
  { type: "docs", label: "docs", hint: "Documentation only" },
  { type: "style", label: "style", hint: "Formatting, no code change" },
  { type: "refactor", label: "refactor", hint: "Neither a fix nor a feature" },
  { type: "perf", label: "perf", hint: "Performance improvement" },
  { type: "test", label: "test", hint: "Adding or fixing tests" },
  { type: "build", label: "build", hint: "Build system or dependencies" },
  { type: "ci", label: "ci", hint: "CI configuration" },
  { type: "chore", label: "chore", hint: "Maintenance tasks" },
  { type: "revert", label: "revert", hint: "Reverts a previous commit" },
];

export interface CommitFields {
  type: string;
  scope: string;
  description: string;
  body: string;
  breaking: boolean;
  breakingDescription: string;
  issues: string;
}

export interface CommitLint {
  level: "warning" | "info";
  message: string;
}

const NON_IMPERATIVE = /^(added|adds|adding|fixed|fixes|fixing|updated|updates|updating|removed|removes|removing|changed|changes|changing|implemented|implements|created|creates|refactored|improved|improves)\b/i;

export function buildCommit(f: CommitFields): { subject: string; message: string; command: string; lint: CommitLint[] } {
  const scope = f.scope.trim() ? `(${f.scope.trim()})` : "";
  const bang = f.breaking ? "!" : "";
  const desc = f.description.trim();
  const subject = `${f.type}${scope}${bang}: ${desc}`;
  const parts: string[] = [subject];
  const body = f.body.trim();
  if (body) parts.push("", body);
  const footers: string[] = [];
  if (f.breaking) footers.push(`BREAKING CHANGE: ${f.breakingDescription.trim() || desc}`);
  const issues = f.issues
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("#") ? s : `#${s.replace(/^#/, "")}`));
  if (issues.length) footers.push(`Closes ${issues.join(", ")}`);
  if (footers.length) parts.push("", ...footers);
  const message = parts.join("\n");

  const lint: CommitLint[] = [];
  if (!desc) lint.push({ level: "warning", message: "Description is required." });
  if (subject.length > 72) lint.push({ level: "warning", message: `Subject is ${subject.length} characters; keep it at 72 or fewer (50 is ideal).` });
  else if (subject.length > 50) lint.push({ level: "info", message: `Subject is ${subject.length} characters; under 50 shows fully in most git tools.` });
  if (desc.endsWith(".")) lint.push({ level: "warning", message: "Drop the trailing period from the description." });
  if (desc && /^[A-Z]/.test(desc)) lint.push({ level: "info", message: "Conventional Commits usually start the description in lowercase." });
  if (NON_IMPERATIVE.test(desc)) lint.push({ level: "info", message: "Prefer the imperative mood: “add”, not “added” / “adds”." });
  if (f.scope && /\s/.test(f.scope.trim())) lint.push({ level: "warning", message: "Scope should be a single token like auth or api." });
  if (body && body.split("\n").some((l) => l.length > 72)) lint.push({ level: "info", message: "Wrap body lines at 72 characters." });

  const quote = (s: string) => `"${s.replace(/(["\\$`])/g, "\\$1")}"`;
  const cmdParts = [`git commit -m ${quote(subject)}`];
  if (body) cmdParts.push(`-m ${quote(body)}`);
  if (footers.length) cmdParts.push(`-m ${quote(footers.join("\n"))}`);
  const command = cmdParts.join(" \\\n  ");

  return { subject, message, command, lint };
}

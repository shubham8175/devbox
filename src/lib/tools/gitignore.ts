import { GITIGNORE_TEMPLATES } from "@/data/gitignore-templates";

export function buildGitignore(selected: string[]): { content: string; lines: number; duplicatesRemoved: number } {
  const seen = new Set<string>();
  const out: string[] = ["# Generated with DevBox — combined .gitignore", ""];
  let duplicatesRemoved = 0;
  for (const id of selected) {
    const t = GITIGNORE_TEMPLATES.find((x) => x.id === id);
    if (!t) continue;
    out.push(`# ---- ${t.name}`);
    for (const rawLine of t.content.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line || line.startsWith("#")) {
        if (line.startsWith("#")) out.push(line);
        continue;
      }
      if (seen.has(line)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(line);
      out.push(line);
    }
    out.push("");
  }
  const content = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  return { content, lines: seen.size, duplicatesRemoved };
}

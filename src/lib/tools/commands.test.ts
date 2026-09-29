import { describe, expect, it } from "vitest";
import { COMMAND_SECTIONS, COMMAND_STACKS, TOTAL_COMMANDS, platformOf, searchCommands, splitPlaceholders } from "@/lib/tools/commands";

describe("command data integrity", () => {
  it("has a broad set of sections with unique ids", () => {
    expect(TOTAL_COMMANDS).toBeGreaterThanOrEqual(850);
    const ids = COMMAND_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of COMMAND_SECTIONS) {
      expect(COMMAND_STACKS).toContain(s.stack);
      expect(s.title).toBeTruthy();
      expect(s.entries.length, s.id).toBeGreaterThanOrEqual(5);
    }
  });

  it("every stack has at least one section", () => {
    for (const stack of COMMAND_STACKS) expect(COMMAND_SECTIONS.some((s) => s.stack === stack), stack).toBe(true);
  });

  it("entries are filled in, trimmed and unique within a section", () => {
    for (const s of COMMAND_SECTIONS) {
      const seen = new Set<string>();
      for (const e of s.entries) {
        expect(e.cmd.trim(), s.id).toBe(e.cmd);
        expect(e.cmd.length).toBeGreaterThan(0);
        expect(e.description.length, e.cmd).toBeGreaterThan(5);
        expect(e.description.endsWith("."), e.cmd).toBe(false);
        expect(seen.has(e.cmd), `${s.id}: ${e.cmd}`).toBe(false);
        seen.add(e.cmd);
      }
    }
  });

  it("flags the obviously destructive commands", () => {
    const all = COMMAND_SECTIONS.flatMap((s) => s.entries);
    for (const cmd of ["git reset --hard HEAD", "git clean -fd", "rm -rf <dir>", "docker system prune -a", "kill -9 <pid>", "redis-cli FLUSHALL", "terraform destroy", "npx prisma migrate reset", "Remove-Item -Recurse -Force node_modules"]) {
      expect(all.find((e) => e.cmd === cmd)?.danger, cmd).toBe(true);
    }
    expect(all.find((e) => e.cmd === "git status")?.danger).toBeUndefined();
  });

  it("covers the requested stacks", () => {
    const ids = COMMAND_SECTIONS.map((s) => s.id);
    for (const id of ["git", "github-cli", "node", "npm", "nextjs", "svelte", "python", "django", "react-native", "android", "ios", "docker", "kubernetes", "go", "rust", "java", "dotnet", "php", "powershell", "linux-server", "cloud", "fixes"]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe("platforms", () => {
  it("keeps OS names out of descriptions and in the platform field", () => {
    for (const s of COMMAND_SECTIONS) {
      for (const e of s.entries) expect(e.description, e.cmd).not.toMatch(/\((macOS|Linux|Windows)\)$/);
    }
  });

  it("inherits the section platform unless the entry overrides it", () => {
    const find = (id: string, cmd: string) => {
      const section = COMMAND_SECTIONS.find((s) => s.id === id)!;
      return platformOf(section.entries.find((e) => e.cmd === cmd)!, section);
    };
    expect(find("powershell", "wsl --install")).toBe("Windows");
    expect(find("processes", "ss -tulpn")).toBe("Linux");
    expect(find("processes", "kill <pid>")).toBeUndefined();
    expect(find("fixes", "sudo usermod -aG docker $USER")).toBe("Linux");
  });

  it("matches platform names in search", () => {
    const hits = searchCommands("windows port").flatMap((r) => r.hits.map((h) => h.entry.cmd));
    expect(hits).toContain("Get-NetTCPConnection -LocalPort <port>");
    expect(hits).toContain("netstat -ano | findstr :<port>");
    expect(hits).not.toContain("lsof -i :<port>");
  });
});

describe("searchCommands", () => {
  it("finds fixes by the error message people paste", () => {
    for (const [q, cmd] of [
      ["EADDRINUSE", "lsof -ti :<port> | xargs kill -9"],
      ["ERESOLVE", "npm i --legacy-peer-deps"],
      ["heap out of memory", "export NODE_OPTIONS=--max-old-space-size=4096"],
      ["dubious ownership", "git config --global --add safe.directory <path>"],
    ]) {
      const [first] = searchCommands(q, { stack: "Troubleshooting" });
      expect(first?.hits.map((h) => h.entry.cmd), q).toContain(cmd);
    }
  });

  it("returns every section in curated order without a query", () => {
    const r = searchCommands("");
    expect(r.map((x) => x.section.id)).toEqual(COMMAND_SECTIONS.map((s) => s.id));
    expect(r.reduce((n, x) => n + x.hits.length, 0)).toBe(TOTAL_COMMANDS);
  });

  it("finds commands by task wording, not only by command text", () => {
    const undo = searchCommands("undo commit").flatMap((r) => r.hits.map((h) => h.entry.cmd));
    expect(undo).toContain("git reset --soft HEAD~1");
    const port = searchCommands("kill port").flatMap((r) => r.hits.map((h) => h.entry.cmd));
    expect(port).toContain("npx kill-port <port>");
  });

  it("requires every term to match", () => {
    const hits = searchCommands("docker volumes").flatMap((r) => r.hits.map((h) => h.entry.cmd));
    expect(hits).toContain("docker compose down -v");
    expect(hits).not.toContain("docker ps -a");
  });

  it("ranks command-text matches above description matches", () => {
    const [first] = searchCommands("pytest");
    expect(first.section.id).toBe("python-quality");
    expect(first.hits[0].entry.cmd).toBe("pytest");
  });

  it("filters by stack and by section", () => {
    const mobile = searchCommands("", { stack: "Mobile" });
    expect(mobile.every((r) => r.section.stack === "Mobile")).toBe(true);
    expect(mobile.length).toBe(COMMAND_SECTIONS.filter((s) => s.stack === "Mobile").length);
    const ios = searchCommands("deep link", { sectionId: "ios" });
    expect(ios).toHaveLength(1);
    expect(ios[0].hits.map((h) => h.entry.cmd)).toEqual(['xcrun simctl openurl booted "<url>"']);
  });

  it("returns nothing for nonsense and survives huge or odd input", () => {
    expect(searchCommands("zzqqxxnotacommand")).toEqual([]);
    expect(() => searchCommands("a".repeat(100_000))).not.toThrow();
    expect(() => searchCommands("(.*+?[")).not.toThrow();
  });
});

describe("splitPlaceholders", () => {
  it("separates placeholders from literal text", () => {
    expect(splitPlaceholders("kill -9 <pid>")).toEqual([
      { text: "kill -9 ", placeholder: false },
      { text: "<pid>", placeholder: true },
    ]);
    expect(splitPlaceholders("gh repo clone <owner/repo>").at(-1)).toEqual({ text: "<owner/repo>", placeholder: true });
  });

  it("does not treat shell redirects as placeholders", () => {
    expect(splitPlaceholders("psql <db> < backup.sql").filter((p) => p.placeholder).map((p) => p.text)).toEqual(["<db>"]);
    expect(splitPlaceholders("<cmd> > out.txt 2>&1").filter((p) => p.placeholder).map((p) => p.text)).toEqual(["<cmd>"]);
    expect(splitPlaceholders("git status")).toEqual([{ text: "git status", placeholder: false }]);
  });
});

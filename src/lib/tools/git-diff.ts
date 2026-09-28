export type DiffLineKind = "add" | "del" | "context" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: "modified" | "added" | "deleted" | "renamed" | "binary";
  hunks: DiffHunk[];
  added: number;
  removed: number;
  binary: boolean;
}

export interface ParsedDiff {
  files: DiffFile[];
  totalAdded: number;
  totalRemoved: number;
}

function stripPrefix(p: string): string {
  const t = p.trim().replace(/\t.*$/, "");
  if (t === "/dev/null") return t;
  return t.replace(/^[ab]\//, "");
}

export function parseGitDiff(input: string): ParsedDiff {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  const newFile = (oldPath: string, newPath: string): DiffFile => {
    const f: DiffFile = { oldPath, newPath, status: "modified", hunks: [], added: 0, removed: 0, binary: false };
    files.push(f);
    return f;
  };

  for (const raw of lines) {
    const line = raw;
    const gitHeader = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (gitHeader) {
      file = newFile(gitHeader[1], gitHeader[2]);
      hunk = null;
      continue;
    }
    if (line.startsWith("--- ")) {
      const p = stripPrefix(line.slice(4));
      if (!file || file.hunks.length) file = newFile(p, p);
      else file.oldPath = p;
      if (p === "/dev/null") file.status = "added";
      continue;
    }
    if (line.startsWith("+++ ")) {
      const p = stripPrefix(line.slice(4));
      if (!file) file = newFile(p, p);
      file.newPath = p;
      if (p === "/dev/null") file.status = "deleted";
      continue;
    }
    if (/^(new file mode|deleted file mode|rename from|rename to|similarity index|index |old mode|new mode|copy from|copy to)/.test(line)) {
      if (file) {
        if (line.startsWith("new file")) file.status = "added";
        else if (line.startsWith("deleted file")) file.status = "deleted";
        else if (line.startsWith("rename from")) {
          file.status = "renamed";
          file.oldPath = line.slice("rename from ".length).trim();
        } else if (line.startsWith("rename to")) {
          file.status = "renamed";
          file.newPath = line.slice("rename to ".length).trim();
        }
      }
      continue;
    }
    if (/^Binary files? /.test(line) || line.startsWith("GIT binary patch")) {
      if (file) {
        file.binary = true;
        if (file.status === "modified") file.status = "binary";
      }
      continue;
    }
    const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
    if (hunkHeader) {
      if (!file) file = newFile("(unknown)", "(unknown)");
      hunk = {
        header: line,
        oldStart: Number(hunkHeader[1]),
        oldLines: hunkHeader[2] === undefined ? 1 : Number(hunkHeader[2]),
        newStart: Number(hunkHeader[3]),
        newLines: hunkHeader[4] === undefined ? 1 : Number(hunkHeader[4]),
        lines: [],
      };
      oldNo = hunk.oldStart;
      newNo = hunk.newStart;
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk || !file) continue;
    if (line.startsWith("+")) {
      hunk.lines.push({ kind: "add", text: line.slice(1), oldNo: null, newNo: newNo++ });
      file.added++;
    } else if (line.startsWith("-")) {
      hunk.lines.push({ kind: "del", text: line.slice(1), oldNo: oldNo++, newNo: null });
      file.removed++;
    } else if (line.startsWith("\\")) {
      hunk.lines.push({ kind: "meta", text: line, oldNo: null, newNo: null });
    } else if (line.startsWith(" ") || line === "") {
      hunk.lines.push({ kind: "context", text: line.slice(1), oldNo: oldNo++, newNo: newNo++ });
    }
  }

  return {
    files,
    totalAdded: files.reduce((a, f) => a + f.added, 0),
    totalRemoved: files.reduce((a, f) => a + f.removed, 0),
  };
}

export const GIT_DIFF_SAMPLE = `diff --git a/src/lib/auth.ts b/src/lib/auth.ts
index 3f2a1b0..9c4d2e1 100644
--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -1,9 +1,12 @@
 import { createToken } from "./token";
+import { rateLimit } from "./rate-limit";

 export async function login(email: string, password: string) {
-  const user = await findUser(email);
-  if (!user) throw new Error("Invalid credentials");
+  await rateLimit(email);
+  const user = await findUser(email.toLowerCase());
+  if (!user || !(await verify(password, user.hash))) {
+    throw new Error("Invalid credentials");
+  }
   return createToken(user.id);
 }
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -10,3 +10,4 @@ ## Usage
 npm install
 npm run dev
+npm test
 npm run build
diff --git a/old-name.ts b/new-name.ts
similarity index 100%
rename from old-name.ts
rename to new-name.ts
diff --git a/logo.png b/logo.png
new file mode 100644
Binary files /dev/null and b/logo.png differ`;

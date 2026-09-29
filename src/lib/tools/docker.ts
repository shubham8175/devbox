/**
 * Dockerfile & Compose linter. Everything here is pure string / object work so
 * the file stays testable in node. Compose YAML is parsed by the UI (lazy
 * `yaml` module) and the parsed object is handed to `lintCompose`.
 */

export type DockerSeverity = "error" | "warning" | "info";

export interface DockerInstruction {
  line: number;
  /** Upper-cased keyword, e.g. FROM, RUN, COPY */
  instruction: string;
  /** Raw arguments after the keyword, continuation lines joined with a space (heredoc bodies keep their newlines). */
  args: string;
  /** Zero-based build stage index; undefined for instructions that appear before the first FROM. */
  stage?: number;
}

export interface DockerFinding {
  line: number;
  rule: string;
  severity: DockerSeverity;
  message: string;
  fix?: string;
}

export interface DockerParseResult {
  instructions: DockerInstruction[];
  directives: { syntax?: string; escape: string };
  /** Parser-level problems (unknown instruction, instruction before FROM). */
  warnings: DockerFinding[];
  /** Number of build stages (FROM instructions). */
  stages: number;
}

export interface DockerExplanation {
  line: number;
  instruction: string;
  args: string;
  stage?: number;
  explanation: string;
}

export const MAX_DOCKERFILE_CHARS = 200_000;

const KNOWN_INSTRUCTIONS = new Set([
  "FROM",
  "RUN",
  "CMD",
  "LABEL",
  "MAINTAINER",
  "EXPOSE",
  "ENV",
  "ADD",
  "COPY",
  "ENTRYPOINT",
  "VOLUME",
  "USER",
  "WORKDIR",
  "ARG",
  "ONBUILD",
  "STOPSIGNAL",
  "HEALTHCHECK",
  "SHELL",
]);

const HEREDOC_RE = /<<-?\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_][\w-]*))/g;

function isComment(line: string): boolean {
  return /^\s*#/.test(line);
}

export function parseDockerfile(input: string): DockerParseResult {
  const text = input.length > MAX_DOCKERFILE_CHARS ? input.slice(0, MAX_DOCKERFILE_CHARS) : input;
  const lines = text.split(/\r?\n/);
  const instructions: DockerInstruction[] = [];
  const warnings: DockerFinding[] = [];
  const directives: DockerParseResult["directives"] = { escape: "\\" };

  // Parser directives are only honoured at the very top of the file.
  let i = 0;
  while (i < lines.length) {
    const m = /^#\s*(syntax|escape)\s*=\s*(\S+)\s*$/i.exec(lines[i]);
    if (!m) break;
    const key = m[1].toLowerCase();
    if (key === "syntax") directives.syntax = m[2];
    else if (m[2] === "`" || m[2] === "\\") directives.escape = m[2];
    i++;
  }
  const escape = directives.escape;

  let stage = -1;
  while (i < lines.length) {
    const line = lines[i];
    const startLine = i + 1;
    if (!line.trim() || isComment(line)) {
      i++;
      continue;
    }
    // Join continuation lines; comment lines inside a continued instruction are ignored, like Docker does.
    let body = line;
    while (body.trimEnd().endsWith(escape) && i + 1 < lines.length) {
      body = body.trimEnd().slice(0, -1);
      i++;
      while (i < lines.length && isComment(lines[i])) i++;
      if (i < lines.length) body = `${body.trimEnd()} ${lines[i].trim()}`;
    }
    i++;
    const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(body);
    if (!m) continue;
    const instruction = m[1].toUpperCase();
    let args = m[2].trim();

    // Heredocs: `RUN <<EOF ... EOF` keeps the body as part of the same instruction.
    const delimiters: string[] = [];
    for (const h of args.matchAll(HEREDOC_RE)) delimiters.push(h[1] ?? h[2] ?? h[3]);
    for (const delim of delimiters) {
      const bodyLines: string[] = [];
      let closed = false;
      while (i < lines.length) {
        const l = lines[i++];
        if (l.trim() === delim) {
          closed = true;
          break;
        }
        bodyLines.push(l);
      }
      args += `\n${bodyLines.join("\n")}`;
      if (!closed) warnings.push({ line: startLine, rule: "unterminated-heredoc", severity: "error", message: `Heredoc “${delim}” is never closed.`, fix: `Add a line containing only ${delim}.` });
    }

    if (instruction === "FROM") stage++;
    const ins: DockerInstruction = { line: startLine, instruction, args };
    if (stage >= 0) ins.stage = stage;
    instructions.push(ins);

    if (!KNOWN_INSTRUCTIONS.has(instruction)) {
      warnings.push({ line: startLine, rule: "unknown-instruction", severity: "error", message: `Unknown instruction “${instruction}”.`, fix: "Check the spelling; Dockerfile keywords are FROM, RUN, COPY, ENV, …" });
    } else if (stage < 0 && instruction !== "ARG") {
      warnings.push({ line: startLine, rule: "before-from", severity: "error", message: `${instruction} appears before the first FROM.`, fix: "Only ARG may precede FROM. Move this instruction below a FROM." });
    }
  }

  return { instructions, directives, warnings, stages: stage + 1 };
}

/* ---------------------------------- helpers --------------------------------- */

interface FromParts {
  image: string;
  tag?: string;
  digest?: string;
  alias?: string;
  platform?: string;
}

function parseFrom(args: string): FromParts {
  const tokens = args.split(/\s+/).filter(Boolean);
  const out: FromParts = { image: "" };
  let idx = 0;
  while (tokens[idx]?.startsWith("--")) {
    const t = tokens[idx];
    if (t.startsWith("--platform=")) out.platform = t.slice("--platform=".length);
    idx++;
  }
  const ref = tokens[idx] ?? "";
  const asIdx = tokens.findIndex((t, k) => k > idx && t.toUpperCase() === "AS");
  if (asIdx >= 0 && tokens[asIdx + 1]) out.alias = tokens[asIdx + 1];
  const at = ref.indexOf("@");
  let base = ref;
  if (at >= 0) {
    out.digest = ref.slice(at + 1);
    base = ref.slice(0, at);
  }
  // A colon after the last slash is a tag; earlier colons belong to a registry port.
  const lastSlash = base.lastIndexOf("/");
  const colon = base.indexOf(":", lastSlash + 1);
  if (colon >= 0) {
    out.image = base.slice(0, colon);
    out.tag = base.slice(colon + 1);
  } else out.image = base;
  return out;
}

function isExecForm(args: string): boolean {
  return args.trimStart().startsWith("[");
}

interface CopyParts {
  from?: string;
  chown?: string;
  chmod?: string;
  link: boolean;
  sources: string[];
  dest: string;
}

function parseCopy(args: string): CopyParts {
  const out: CopyParts = { link: false, sources: [], dest: "" };
  let tokens: string[];
  if (isExecForm(args)) {
    try {
      const arr = JSON.parse(args) as unknown;
      tokens = Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      tokens = [];
    }
  } else {
    tokens = args.split(/\s+/).filter(Boolean);
    while (tokens[0]?.startsWith("--")) {
      const t = tokens.shift() as string;
      if (t.startsWith("--from=")) out.from = t.slice(7);
      else if (t.startsWith("--chown=")) out.chown = t.slice(8);
      else if (t.startsWith("--chmod=")) out.chmod = t.slice(8);
      else if (t === "--link") out.link = true;
    }
  }
  out.dest = tokens.length ? tokens[tokens.length - 1] : "";
  out.sources = tokens.slice(0, -1);
  return out;
}

function parseKeyValues(args: string): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];
  const firstLine = args.split("\n")[0];
  if (/^[^\s=]+=/.test(firstLine)) {
    const re = /([^\s=]+)=("(?:[^"\\]|\\.)*"|'[^']*'|\S*)/g;
    for (const m of firstLine.matchAll(re)) pairs.push({ key: m[1], value: m[2].replace(/^["']|["']$/g, "") });
  } else {
    const m = /^(\S+)\s*([\s\S]*)$/.exec(firstLine);
    if (m) pairs.push({ key: m[1], value: m[2].trim() });
  }
  return pairs;
}

function shortCmd(s: string, max = 60): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/* --------------------------------- explain ---------------------------------- */

export function explainInstruction(ins: DockerInstruction): string {
  const { instruction, args } = ins;
  switch (instruction) {
    case "FROM": {
      const f = parseFrom(args);
      const parts: string[] = [];
      if (f.image === "scratch") parts.push("Starts a build stage from an empty image (scratch) — no OS, no shell");
      else parts.push(`Starts build stage ${(ins.stage ?? 0) + 1} from base image “${f.image}”`);
      if (f.tag) parts.push(`tag “${f.tag}”`);
      else if (f.digest) parts.push(`pinned to digest ${f.digest.slice(0, 19)}…`);
      else if (f.image !== "scratch") parts.push("no tag, so Docker uses :latest");
      if (f.platform) parts.push(`for platform ${f.platform}`);
      if (f.alias) parts.push(`named “${f.alias}” so later stages can COPY --from=${f.alias}`);
      return `${parts.join(", ")}.`;
    }
    case "RUN": {
      const mount = /--mount=\S+/.exec(args)?.[0];
      const heredoc = args.includes("\n");
      if (isExecForm(args)) return `Runs ${shortCmd(args)} directly, without a shell (exec form), and commits the result as a new layer.`;
      return `Runs “${shortCmd(heredoc ? args.split("\n").slice(1).join("; ") : args)}” through /bin/sh -c during the build${heredoc ? " (heredoc body)" : ""}${mount ? `, with a build ${mount}` : ""}, creating a new image layer.`;
    }
    case "COPY":
    case "ADD": {
      const c = parseCopy(args);
      const glob = c.sources.some((s) => /[*?[]/.test(s));
      const remote = instruction === "ADD" && c.sources.some((s) => /^https?:\/\//i.test(s));
      const src = c.sources.length ? c.sources.join(", ") : "(nothing)";
      let s = `Copies ${src} ${c.from ? `from stage/image “${c.from}” ` : "from the build context "}into “${c.dest || "?"}”`;
      if (glob) s += " (glob pattern)";
      if (c.chown) s += `, owned by ${c.chown}`;
      if (c.chmod) s += `, with mode ${c.chmod}`;
      if (c.link) s += ", as an independent layer (--link)";
      if (instruction === "ADD") s += remote ? "; ADD also downloads remote URLs" : "; ADD auto-extracts local tar archives";
      return `${s}.`;
    }
    case "ENV": {
      const kv = parseKeyValues(args);
      return `Sets environment variable${kv.length === 1 ? "" : "s"} ${kv.map((p) => p.key).join(", ")} for the rest of the build and for every container started from the image.`;
    }
    case "ARG": {
      const kv = parseKeyValues(args);
      const p = kv[0];
      return `Declares build argument “${p?.key ?? args}”${p?.value ? ` with default “${p.value}”` : " with no default"}; it is available only while building, not in the running container.`;
    }
    case "EXPOSE":
      return `Documents that the container listens on port${args.includes(" ") ? "s" : ""} ${args}; it does not publish them — use -p when running.`;
    case "WORKDIR":
      return `Sets the working directory to “${args}” for the following RUN, CMD, ENTRYPOINT, COPY and ADD instructions (created if it does not exist).`;
    case "USER":
      return `Switches to user “${args}” for the following instructions and for the running container.`;
    case "CMD":
      return isExecForm(args)
        ? `Sets the default command ${shortCmd(args)} (exec form); “docker run image …” replaces it, and it becomes the arguments if an ENTRYPOINT is set.`
        : `Sets the default command “${shortCmd(args)}” run via /bin/sh -c (shell form), so the shell is PID 1 and signals are not forwarded.`;
    case "ENTRYPOINT":
      return isExecForm(args)
        ? `Makes ${shortCmd(args)} the container's executable (exec form); CMD and “docker run” arguments are appended to it.`
        : `Makes “${shortCmd(args)}” the executable via /bin/sh -c (shell form); CMD and run arguments are ignored and signals are not forwarded.`;
    case "HEALTHCHECK": {
      if (/^NONE$/i.test(args.trim())) return "Disables any health check inherited from the base image.";
      const opts = Array.from(args.matchAll(/--(interval|timeout|start-period|retries)=(\S+)/g)).map((m) => `${m[1]} ${m[2]}`);
      const cmd = args.replace(/--\S+/g, "").replace(/^\s*CMD\s*/i, "").trim();
      return `Tells Docker to check container health by running “${shortCmd(cmd)}”${opts.length ? ` (${opts.join(", ")})` : ""}.`;
    }
    case "VOLUME":
      return `Declares mount point${args.includes(" ") || args.includes(",") ? "s" : ""} ${args}; data written there lives in a volume, outside the container's writable layer.`;
    case "LABEL": {
      const kv = parseKeyValues(args);
      return `Adds metadata label${kv.length === 1 ? "" : "s"} ${kv.map((p) => p.key).join(", ")} to the image.`;
    }
    case "SHELL":
      return `Changes the shell used for shell-form RUN, CMD and ENTRYPOINT to ${shortCmd(args)}.`;
    case "STOPSIGNAL":
      return `Sets ${args} as the signal sent to the container's main process on “docker stop”.`;
    case "ONBUILD":
      return `Registers “${shortCmd(args)}” to run later, when another Dockerfile uses this image in FROM.`;
    case "MAINTAINER":
      return `Sets the (deprecated) maintainer field to “${args}”.`;
    default:
      return `Unknown instruction; Docker will reject this line.`;
  }
}

export function explainDockerfile(instructions: DockerInstruction[]): DockerExplanation[] {
  return instructions.map((ins) => ({ line: ins.line, instruction: ins.instruction, args: ins.args, stage: ins.stage, explanation: explainInstruction(ins) }));
}

/* ----------------------------------- lint ----------------------------------- */

const SECRET_KEY_RE = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|AUTH)/i;
const INSTALL_RE = /\b(npm (install|i|ci)|yarn( install)?|pnpm (install|i)|pip3? install|apt-get install|apk add|bundle install|go mod download|cargo (build|fetch)|composer install|dotnet restore|mvn|gradle)\b/;

function shellSegments(cmd: string): string[] {
  return cmd
    .replace(/\\\s*\n/g, " ")
    .split(/&&|\|\||;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function lintDockerfile(instructions: DockerInstruction[]): DockerFinding[] {
  const findings: DockerFinding[] = [];
  const push = (line: number, rule: string, severity: DockerSeverity, message: string, fix?: string) => findings.push({ line, rule, severity, message, fix });

  if (!instructions.some((i) => i.instruction === "FROM")) {
    push(1, "no-from", "error", "No FROM instruction: every Dockerfile must start from a base image.", "Add e.g. FROM node:22-alpine as the first instruction.");
  }

  const stageCount = instructions.reduce((n, i) => (i.instruction === "FROM" ? n + 1 : n), 0);
  const finalStage = stageCount - 1;
  const stageNames = new Set<string>();

  let prev: DockerInstruction | null = null;
  let copiedAllAt: number | null = null;
  const perStage = new Map<number, { cmd: number; entrypoint: number; healthcheck: number; user: string | null; workdir: boolean }>();
  const stageState = (s: number) => {
    let st = perStage.get(s);
    if (!st) {
      st = { cmd: 0, entrypoint: 0, healthcheck: 0, user: null, workdir: false };
      perStage.set(s, st);
    }
    return st;
  };

  for (const ins of instructions) {
    const { line, instruction, args } = ins;
    const st = stageState(ins.stage ?? 0);
    if (instruction === "FROM") {
      copiedAllAt = null;
      const f = parseFrom(args);
      if (f.alias) stageNames.add(f.alias);
      const isStageRef = stageNames.has(f.image) && !f.tag && !f.digest;
      if (f.tag === "latest") push(line, "no-latest-tag", "warning", `Base image “${f.image}” uses the :latest tag, so builds are not reproducible.`, "Pin a specific version tag or a @sha256 digest.");
      else if (!f.tag && !f.digest && f.image !== "scratch" && !isStageRef && !/^\$/.test(f.image)) push(line, "untagged-image", "warning", `Base image “${f.image}” has no tag; Docker will pull :latest.`, `Use ${f.image}:<version> so the base cannot change under you.`);
    }
    if (instruction === "MAINTAINER") push(line, "maintainer-deprecated", "warning", "MAINTAINER is deprecated.", 'Use LABEL org.opencontainers.image.authors="…" instead.');
    if (instruction === "ADD") {
      const c = parseCopy(args);
      const onlyLocalPlain = c.sources.length > 0 && c.sources.every((s) => !/^https?:\/\//i.test(s) && !/\.(tar|tgz|tar\.gz|tar\.xz|tar\.bz2|txz|tbz2)$/i.test(s));
      if (onlyLocalPlain) push(line, "add-vs-copy", "warning", "ADD used for plain local files; its extra behaviours (URL download, auto-extract) are surprising.", "Use COPY unless you need tar auto-extraction.");
    }
    if (instruction === "COPY" || instruction === "ADD") {
      const c = parseCopy(args);
      if (!c.from && c.sources.some((s) => s === "." || s === "./")) copiedAllAt = line;
    }
    if (instruction === "RUN") {
      const cmd = args;
      if (copiedAllAt !== null && INSTALL_RE.test(cmd)) {
        push(line, "copy-before-install", "warning", `Dependencies are installed after “COPY .” on line ${copiedAllAt}, so any source change invalidates the install cache.`, "Copy only the manifest (package.json, requirements.txt, go.mod…) first, install, then COPY the rest.");
        copiedAllAt = null;
      }
      if (/\bapt-get\s+install\b/.test(cmd)) {
        if (!/--no-install-recommends/.test(cmd)) push(line, "apt-no-recommends", "info", "apt-get install without --no-install-recommends pulls in optional packages.", "Add --no-install-recommends to keep the image small.");
        if (!/rm\s+-rf?\s+\/var\/lib\/apt\/lists/.test(cmd)) push(line, "apt-cleanup", "warning", "apt lists are left in the layer after apt-get install.", "Append && rm -rf /var/lib/apt/lists/* in the same RUN.");
        const pkgs = /apt-get\s+install\s+((?:-\S+\s+|--\S+\s+)*)([^&|;\n]*)/.exec(cmd)?.[2] ?? "";
        const names = pkgs.split(/\s+/).filter((p) => p && !p.startsWith("-"));
        if (names.length && names.some((p) => !p.includes("="))) push(line, "apt-pin", "info", "apt packages are not pinned to a version.", "Use package=version for reproducible builds, e.g. curl=8.5.0-2.");
      }
      if (/\bpip3?\s+install\b/.test(cmd) && !/--no-cache-dir/.test(cmd)) push(line, "pip-no-cache", "info", "pip install keeps its download cache in the image.", "Add --no-cache-dir.");
      if (/\bnpm\s+(install|i)\b/.test(cmd) && !/\bnpm\s+ci\b/.test(cmd)) push(line, "npm-ci", "info", "npm install may update the lockfile; builds are not reproducible.", "Use npm ci (requires package-lock.json).");
      if (/\bsudo\b/.test(cmd)) push(line, "sudo-in-run", "warning", "sudo in RUN: the build already runs as root, and sudo is rarely installed in images.", "Drop sudo, or switch users with USER instead.");
      if (/\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(cmd)) push(line, "curl-pipe-sh", "warning", "Piping a download straight into a shell runs unverified remote code.", "Download to a file, verify a checksum, then execute.");
      const segs = shellSegments(cmd.replace(/^--\S+\s+/g, ""));
      if (segs.some((s) => /^cd\s+/.test(s))) push(line, "cd-in-run", "info", "cd inside RUN only affects that one instruction.", "Use WORKDIR to change directory for the following instructions.");
      if (prev && prev.instruction === "RUN" && prev.stage === ins.stage) push(line, "consecutive-run", "info", "Consecutive RUN instructions each create a layer.", "Chain the commands with && in one RUN to reduce layers.");
    }
    if (instruction === "ENV" || instruction === "ARG") {
      for (const kv of parseKeyValues(args)) {
        if (SECRET_KEY_RE.test(kv.key) && kv.value && !/^\$/.test(kv.value)) {
          push(line, "secret-in-env", instruction === "ENV" ? "error" : "warning", `${kv.key} looks like a secret with a literal value; it is baked into ${instruction === "ENV" ? "the image and every container" : "the build history"}.`, "Use --mount=type=secret in RUN, or inject the value at runtime.");
        }
      }
    }
    if (instruction === "EXPOSE") {
      for (const p of args.split(/\s+/).filter(Boolean)) {
        const num = Number(p.split("/")[0]);
        if (!/^\$/.test(p) && (!Number.isInteger(num) || num < 1 || num > 65535)) push(line, "expose-out-of-range", "error", `EXPOSE port “${p}” is not in 1–65535.`, "Use a valid TCP/UDP port.");
      }
    }
    if (instruction === "WORKDIR") {
      st.workdir = true;
      if (!/^(\/|[A-Za-z]:[\\/]|\$)/.test(args)) push(line, "absolute-workdir", "warning", `WORKDIR “${args}” is relative; it resolves against the previous WORKDIR, which is easy to get wrong.`, "Use an absolute path such as /app.");
    }
    if (instruction === "USER") st.user = args.trim();
    if (instruction === "CMD" || instruction === "ENTRYPOINT") {
      if (instruction === "CMD") st.cmd++;
      else st.entrypoint++;
      if (!isExecForm(args)) push(line, "cmd-shell-form", "warning", `${instruction} uses shell form, so /bin/sh is PID 1 and SIGTERM never reaches your process.`, `Use exec form: ${instruction} ["executable", "arg"].`);
      if ((instruction === "CMD" && st.cmd === 2) || (instruction === "ENTRYPOINT" && st.entrypoint === 2)) push(line, "multiple-cmd", "warning", `More than one ${instruction} in this stage; only the last one takes effect.`, "Remove the earlier one.");
    }
    if (instruction === "HEALTHCHECK") st.healthcheck++;
    prev = ins;
  }

  if (stageCount > 0) {
    const st = stageState(finalStage);
    const lastLine = instructions[instructions.length - 1]?.line ?? 1;
    if (!st.user || /^(root|0)(:|$)/.test(st.user)) push(lastLine, "root-user", "warning", "The final stage never switches away from root, so the container runs as root.", "Add a USER instruction with a non-root user before CMD.");
    if (!st.workdir && instructions.some((i) => i.stage === finalStage && (i.instruction === "COPY" || i.instruction === "ADD" || i.instruction === "RUN"))) push(lastLine, "no-workdir", "info", "No WORKDIR in the final stage; relative paths resolve against /.", "Add WORKDIR /app (or similar).");
    if (!st.healthcheck && (st.cmd || st.entrypoint)) push(lastLine, "healthcheck-missing", "info", "No HEALTHCHECK; orchestrators cannot tell a hung container from a healthy one.", 'Add HEALTHCHECK CMD curl -f http://localhost:PORT/health || exit 1.');
  }

  findings.sort((a, b) => a.line - b.line);
  return findings;
}

/* --------------------------------- compose ---------------------------------- */

export interface ComposeFinding {
  /** Dot path into the compose document, e.g. services.web.ports[0] */
  path: string;
  rule: string;
  severity: DockerSeverity;
  message: string;
  fix?: string;
}

export interface ComposeServiceSummary {
  name: string;
  image?: string;
  build?: string;
  ports: string[];
  volumes: string[];
  envCount: number;
  dependsOn: string[];
  summary: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function imageTag(image: string): string | null {
  const at = image.indexOf("@");
  if (at >= 0) return image.slice(at + 1);
  const lastSlash = image.lastIndexOf("/");
  const colon = image.indexOf(":", lastSlash + 1);
  return colon >= 0 ? image.slice(colon + 1) : null;
}

interface PortSpec {
  hostIp?: string;
  hostPort?: string;
  containerPort: string;
  text: string;
}

function parsePort(p: unknown): PortSpec | null {
  if (typeof p === "number") return { containerPort: String(p), text: String(p) };
  if (typeof p === "string") {
    const text = p;
    const noProto = p.replace(/\/(tcp|udp)$/i, "");
    const parts = noProto.split(":");
    if (parts.length === 1) return { containerPort: parts[0], text };
    if (parts.length === 2) return { hostPort: parts[0], containerPort: parts[1], text };
    return { hostIp: parts.slice(0, -2).join(":"), hostPort: parts[parts.length - 2], containerPort: parts[parts.length - 1], text };
  }
  if (isObj(p)) {
    const target = p.target !== undefined ? String(p.target) : "";
    const published = p.published !== undefined ? String(p.published) : undefined;
    const hostIp = typeof p.host_ip === "string" ? p.host_ip : undefined;
    return { hostIp, hostPort: published, containerPort: target, text: `${hostIp ? `${hostIp}:` : ""}${published ? `${published}:` : ""}${target}` };
  }
  return null;
}

function envEntries(env: unknown): Array<{ key: string; value: string | null }> {
  const out: Array<{ key: string; value: string | null }> = [];
  if (Array.isArray(env)) {
    for (const e of env) {
      if (typeof e !== "string") continue;
      const eq = e.indexOf("=");
      out.push(eq < 0 ? { key: e, value: null } : { key: e.slice(0, eq), value: e.slice(eq + 1) });
    }
  } else if (isObj(env)) {
    for (const [key, v] of Object.entries(env)) out.push({ key, value: v === null || v === undefined ? null : String(v) });
  }
  return out;
}

function dependsOnNames(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (isObj(v)) return Object.keys(v);
  return [];
}

function volumeHostPath(v: unknown): string | null {
  if (typeof v === "string") {
    const parts = v.split(":");
    return parts.length >= 2 ? parts[0] : null;
  }
  if (isObj(v) && typeof v.source === "string") return v.source;
  return null;
}

export function lintCompose(doc: unknown): ComposeFinding[] {
  const findings: ComposeFinding[] = [];
  const push = (path: string, rule: string, severity: DockerSeverity, message: string, fix?: string) => findings.push({ path, rule, severity, message, fix });
  if (!isObj(doc)) {
    push("", "not-an-object", "error", "A Compose file must be a YAML mapping with a “services” key.");
    return findings;
  }
  if ("version" in doc) push("version", "version-deprecated", "info", "The top-level “version” key is obsolete in the Compose specification and is ignored.", "Remove it.");
  const services = doc.services;
  if (!isObj(services) || Object.keys(services).length === 0) {
    push("services", "no-services", "error", "No services are defined.", "Add at least one service under “services:”.");
    return findings;
  }
  const names = new Set(Object.keys(services));
  const hostPorts = new Map<string, string>();

  for (const [name, svcRaw] of Object.entries(services)) {
    const p = `services.${name}`;
    if (!isObj(svcRaw)) {
      push(p, "service-not-object", "error", `Service “${name}” must be a mapping.`);
      continue;
    }
    const svc = svcRaw;
    const image = typeof svc.image === "string" ? svc.image : null;
    if (!image && svc.build === undefined) push(p, "no-image-or-build", "error", `Service “${name}” has neither “image” nor “build”.`, "Add image: <name:tag> or build: <context>.");
    if (image && !/^\$\{/.test(image)) {
      const tag = imageTag(image);
      if (tag === "latest") push(`${p}.image`, "image-latest", "warning", `“${image}” uses :latest; the image can change between deploys.`, "Pin a version tag or digest.");
      else if (tag === null) push(`${p}.image`, "image-untagged", "warning", `“${image}” has no tag, which means :latest.`, `Use ${image}:<version>.`);
    }
    if (svc.privileged === true) push(`${p}.privileged`, "privileged", "warning", `“${name}” runs privileged, with full access to the host's devices and kernel.`, "Grant specific capabilities with cap_add instead.");
    if (svc.network_mode === "host") push(`${p}.network_mode`, "network-host", "warning", `“${name}” shares the host network namespace, bypassing container isolation.`, "Publish specific ports instead.");
    if (typeof svc.container_name === "string") push(`${p}.container_name`, "container-name", "info", `container_name “${svc.container_name}” prevents scaling this service beyond one replica.`, "Remove it unless another tool needs a fixed name.");
    if (svc.restart === undefined && !isObj(svc.deploy)) push(`${p}.restart`, "no-restart", "info", `“${name}” has no restart policy; it stays down after a crash or reboot.`, "Add restart: unless-stopped.");
    if (svc.healthcheck === undefined) push(`${p}.healthcheck`, "no-healthcheck", "info", `“${name}” has no healthcheck, so depends_on cannot wait for it to be ready.`, "Add a healthcheck with test/interval/retries.");
    if (svc.links !== undefined) push(`${p}.links`, "links-deprecated", "warning", "“links” is a legacy feature; services on the same network already resolve each other by name.", "Remove links and use depends_on if ordering matters.");

    if (Array.isArray(svc.ports)) {
      svc.ports.forEach((raw, i) => {
        const port = parsePort(raw);
        if (!port) return;
        const pp = `${p}.ports[${i}]`;
        if (port.hostPort) {
          if (!port.hostIp || port.hostIp === "0.0.0.0" || port.hostIp === "::") push(pp, "port-bind-all", "info", `Port ${port.hostPort} is published on all interfaces (0.0.0.0).`, `Bind to localhost only with 127.0.0.1:${port.hostPort}:${port.containerPort} if it should not be reachable from outside.`);
          if (!port.hostPort.includes("-")) {
            const key = `${port.hostIp ?? "0.0.0.0"}:${port.hostPort}`;
            const other = hostPorts.get(key);
            if (other) push(pp, "duplicate-host-port", "error", `Host port ${port.hostPort} is already published by service “${other}”.`, "Only one container can bind a host port; change one of them.");
            else hostPorts.set(key, name);
          }
        }
      });
    }

    for (const { key, value } of envEntries(svc.environment)) {
      if (SECRET_KEY_RE.test(key) && value && !/^\$/.test(value)) push(`${p}.environment.${key}`, "secret-in-environment", "warning", `${key} has a literal value in the Compose file.`, `Use ${key}=\${${key}} with a .env file, or Compose secrets.`);
    }

    if (Array.isArray(svc.volumes)) {
      svc.volumes.forEach((v, i) => {
        const host = volumeHostPath(v);
        if (host && /(^|[\\/])\.\.([\\/]|$)/.test(host)) push(`${p}.volumes[${i}]`, "volume-parent-path", "warning", `Volume mounts a host path outside the project directory (“${host}”).`, "Mount only what the container needs.");
      });
    }

    for (const dep of dependsOnNames(svc.depends_on)) {
      if (!names.has(dep)) push(`${p}.depends_on`, "depends-on-unknown", "error", `“${name}” depends on “${dep}”, which is not a defined service.`, "Fix the service name.");
    }
  }
  return findings;
}

export function explainCompose(doc: unknown): ComposeServiceSummary[] {
  if (!isObj(doc) || !isObj(doc.services)) return [];
  return Object.entries(doc.services).map(([name, raw]) => {
    const svc = isObj(raw) ? raw : {};
    const image = typeof svc.image === "string" ? svc.image : undefined;
    const build = typeof svc.build === "string" ? svc.build : isObj(svc.build) && typeof svc.build.context === "string" ? svc.build.context : svc.build !== undefined ? "." : undefined;
    const ports = Array.isArray(svc.ports) ? svc.ports.map(parsePort).filter((x): x is PortSpec => x !== null).map((x) => x.text) : [];
    const volumes = Array.isArray(svc.volumes) ? svc.volumes.map((v) => (typeof v === "string" ? v : isObj(v) ? `${String(v.source ?? "")}:${String(v.target ?? "")}` : "")).filter(Boolean) : [];
    const envCount = envEntries(svc.environment).length;
    const dependsOn = dependsOnNames(svc.depends_on);
    const bits: string[] = [];
    bits.push(image ? `runs image ${image}` : build ? `builds from ${build}` : "has no image or build");
    if (ports.length) bits.push(`publishes ${ports.join(", ")}`);
    if (volumes.length) bits.push(`mounts ${volumes.length} volume${volumes.length === 1 ? "" : "s"}`);
    if (envCount) bits.push(`sets ${envCount} environment variable${envCount === 1 ? "" : "s"}`);
    if (dependsOn.length) bits.push(`starts after ${dependsOn.join(", ")}`);
    return { name, image, build, ports, volumes, envCount, dependsOn, summary: `${name} ${bits.join("; ")}.` };
  });
}

/* --------------------------------- samples ---------------------------------- */

export const DOCKERFILE_SAMPLE = `# syntax=docker/dockerfile:1
FROM node:latest AS build
MAINTAINER devbox <hello@example.com>
WORKDIR app
COPY . .
RUN npm install
RUN npm run build

FROM node
ENV NODE_ENV=production \\
    API_TOKEN=sk-live-123456
RUN apt-get update && apt-get install -y curl \\
    && cd /tmp && curl -sSL https://example.com/install.sh | sh
ADD config.json /app/config.json
COPY --from=build /app/dist /app/dist
EXPOSE 3000 70000
RUN <<EOF
echo "prepared"
touch /app/ready
EOF
CMD node /app/dist/server.js
`;

export const COMPOSE_SAMPLE = `version: "3.9"
services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://app:hunter2@db:5432/app
      JWT_SECRET: change-me
    depends_on:
      - db
      - cache
    volumes:
      - ../secrets:/run/secrets:ro
    links:
      - db
    container_name: web
  db:
    image: postgres
    privileged: true
    environment:
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    ports:
      - "3000:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "pg_isready"]
      interval: 10s
  proxy:
    image: nginx:latest
    network_mode: host
volumes:
  pgdata:
`;

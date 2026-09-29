import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { COMPOSE_SAMPLE, DOCKERFILE_SAMPLE, explainCompose, explainDockerfile, explainInstruction, lintCompose, lintDockerfile, parseDockerfile, type DockerInstruction } from "@/lib/tools/docker";

const rules = (text: string) => lintDockerfile(parseDockerfile(text).instructions).map((f) => f.rule);
const composeRules = (yaml: string) => lintCompose(parse(yaml)).map((f) => f.rule);

describe("parseDockerfile", () => {
  it("joins line continuations and skips comments inside them", () => {
    const r = parseDockerfile("FROM alpine:3.20\nRUN apk add \\\n  # a comment\n  curl \\\n  git\n");
    expect(r.instructions).toHaveLength(2);
    expect(r.instructions[1]).toEqual({ line: 2, instruction: "RUN", args: "apk add curl git", stage: 0 });
  });

  it("honours the escape directive and records syntax", () => {
    const r = parseDockerfile("# syntax=docker/dockerfile:1\n# escape=`\nFROM alpine:3.20\nRUN echo a `\n  b\n");
    expect(r.directives).toEqual({ syntax: "docker/dockerfile:1", escape: "`" });
    expect(r.instructions[1].args).toBe("echo a b");
  });

  it("keeps a heredoc body inside one instruction", () => {
    const r = parseDockerfile("FROM alpine:3.20\nRUN <<EOF\necho hi\ntouch /x\nEOF\nCMD [\"sh\"]\n");
    expect(r.instructions.map((i) => i.instruction)).toEqual(["FROM", "RUN", "CMD"]);
    expect(r.instructions[1].args).toBe("<<EOF\necho hi\ntouch /x");
    expect(r.instructions[2].line).toBe(6);
  });

  it("reports an unterminated heredoc", () => {
    const r = parseDockerfile("FROM alpine:3.20\nRUN <<EOF\necho hi\n");
    expect(r.warnings.map((w) => w.rule)).toContain("unterminated-heredoc");
  });

  it("numbers multi-stage builds and flags instructions before FROM", () => {
    const r = parseDockerfile("ARG V=1\nRUN echo early\nFROM node:22 AS build\nRUN a\nFROM nginx:1.27\nCOPY --from=build /x /y\n");
    expect(r.stages).toBe(2);
    expect(r.instructions.map((i) => i.stage)).toEqual([undefined, undefined, 0, 0, 1, 1]);
    expect(r.warnings).toEqual([expect.objectContaining({ line: 2, rule: "before-from" })]);
  });

  it("flags unknown instructions and caps input size", () => {
    expect(parseDockerfile("FROM a:1\nFROMM b\n").warnings[0].rule).toBe("unknown-instruction");
    const big = `FROM a:1\n${"RUN x\n".repeat(100_000)}`;
    expect(parseDockerfile(big).instructions.length).toBeLessThan(100_000);
  });
});

describe("explainDockerfile", () => {
  const ex = (instruction: string, args: string, stage = 0) => explainInstruction({ line: 1, instruction, args, stage });

  it("explains FROM with tag, digest, platform and alias", () => {
    expect(ex("FROM", "node:22-alpine AS build")).toMatch(/base image “node”, tag “22-alpine”, named “build”/);
    expect(ex("FROM", "ghcr.io/org/app@sha256:abcdef0123456789")).toMatch(/pinned to digest/);
    expect(ex("FROM", "--platform=linux/amd64 ubuntu")).toMatch(/uses :latest.*linux\/amd64/);
    expect(ex("FROM", "scratch")).toMatch(/empty image/);
  });

  it("distinguishes shell and exec forms", () => {
    expect(ex("RUN", '["npm", "ci"]')).toMatch(/without a shell/);
    expect(ex("CMD", "node server.js")).toMatch(/shell form/);
    expect(ex("ENTRYPOINT", '["nginx", "-g", "daemon off;"]')).toMatch(/exec form/);
  });

  it("explains COPY flags and globs", () => {
    expect(ex("COPY", "--from=build --chown=node:node dist/*.js /app/")).toMatch(/from stage\/image “build”.*glob.*owned by node:node/);
    expect(ex("ADD", "https://example.com/a.tgz /tmp/")).toMatch(/downloads remote URLs/);
  });

  it("covers the remaining instructions", () => {
    expect(ex("ENV", "A=1 B=2")).toMatch(/variables A, B/);
    expect(ex("ARG", "VERSION=1.2")).toMatch(/default “1.2”/);
    expect(ex("EXPOSE", "80 443")).toMatch(/ports 80 443/);
    expect(ex("WORKDIR", "/app")).toMatch(/working directory to “\/app”/);
    expect(ex("USER", "node")).toMatch(/user “node”/);
    expect(ex("HEALTHCHECK", "--interval=30s CMD curl -f http://localhost/ || exit 1")).toMatch(/interval 30s/);
    expect(ex("HEALTHCHECK", "NONE")).toMatch(/Disables/);
    expect(ex("VOLUME", "/data")).toMatch(/mount point \/data/);
    expect(ex("LABEL", 'a="1" b="2"')).toMatch(/labels a, b/);
    expect(ex("SHELL", '["powershell"]')).toMatch(/Changes the shell/);
    expect(ex("STOPSIGNAL", "SIGQUIT")).toMatch(/SIGQUIT/);
    expect(ex("ONBUILD", "RUN echo")).toMatch(/Registers/);
    expect(ex("MAINTAINER", "me")).toMatch(/deprecated/);
    expect(ex("BOGUS", "x")).toMatch(/Unknown/);
    expect(explainDockerfile(parseDockerfile(DOCKERFILE_SAMPLE).instructions)).toHaveLength(14);
  });
});

describe("lintDockerfile rules", () => {
  const base = "FROM node:22-alpine\nWORKDIR /app\nUSER node\nHEALTHCHECK CMD true\n";

  it("no-latest-tag / untagged-image", () => {
    expect(rules("FROM node:latest\n")).toContain("no-latest-tag");
    expect(rules("FROM node\n")).toContain("untagged-image");
    expect(rules("FROM node:22 AS build\nFROM build\n")).not.toContain("untagged-image");
    expect(rules("FROM scratch\n")).not.toContain("untagged-image");
  });

  it("add-vs-copy only for plain local files", () => {
    expect(rules(`${base}ADD app.js /app/\n`)).toContain("add-vs-copy");
    expect(rules(`${base}ADD app.tar.gz /app/\n`)).not.toContain("add-vs-copy");
    expect(rules(`${base}ADD https://x/y /app/\n`)).not.toContain("add-vs-copy");
  });

  it("apt rules", () => {
    const r = rules(`${base}RUN apt-get update && apt-get install -y curl\n`);
    expect(r).toEqual(expect.arrayContaining(["apt-no-recommends", "apt-cleanup", "apt-pin"]));
    const good = rules(`${base}RUN apt-get update && apt-get install -y --no-install-recommends curl=8.5.0 && rm -rf /var/lib/apt/lists/*\n`);
    expect(good).not.toEqual(expect.arrayContaining(["apt-no-recommends", "apt-cleanup", "apt-pin"]));
  });

  it("pip-no-cache and npm-ci", () => {
    expect(rules(`${base}RUN pip install flask\n`)).toContain("pip-no-cache");
    expect(rules(`${base}RUN pip install --no-cache-dir flask\n`)).not.toContain("pip-no-cache");
    expect(rules(`${base}RUN npm install\n`)).toContain("npm-ci");
    expect(rules(`${base}RUN npm ci\n`)).not.toContain("npm-ci");
  });

  it("root-user, no-workdir, healthcheck-missing apply to the final stage", () => {
    const r = rules('FROM node:22\nCOPY a b\nCMD ["node"]\n');
    expect(r).toEqual(expect.arrayContaining(["root-user", "no-workdir", "healthcheck-missing"]));
    expect(rules('FROM node:22\nUSER root\nCMD ["node"]\n')).toContain("root-user");
    expect(rules(`${base}CMD ["node"]\n`)).not.toEqual(expect.arrayContaining(["root-user", "no-workdir", "healthcheck-missing"]));
  });

  it("cmd-shell-form and multiple-cmd", () => {
    expect(rules(`${base}CMD node app.js\n`)).toContain("cmd-shell-form");
    expect(rules(`${base}CMD ["a"]\nCMD ["b"]\n`)).toContain("multiple-cmd");
    expect(rules(`${base}ENTRYPOINT ["a"]\nENTRYPOINT ["b"]\n`)).toContain("multiple-cmd");
  });

  it("secret-in-env for literal values only", () => {
    const f = lintDockerfile(parseDockerfile(`${base}ENV API_TOKEN=abc123\nARG DB_PASSWORD=x\nENV SECRET_KEY=$FROM_ARG\n`).instructions);
    const secrets = f.filter((x) => x.rule === "secret-in-env");
    expect(secrets.map((s) => s.severity)).toEqual(["error", "warning"]);
  });

  it("consecutive-run and copy-before-install", () => {
    expect(rules(`${base}RUN a\nRUN b\n`)).toContain("consecutive-run");
    expect(rules(`${base}COPY . .\nRUN npm ci\n`)).toContain("copy-before-install");
    expect(rules(`${base}COPY package.json .\nRUN npm ci\nCOPY . .\n`)).not.toContain("copy-before-install");
  });

  it("expose-out-of-range, sudo, curl-pipe-sh, maintainer, absolute-workdir, cd-in-run", () => {
    expect(rules(`${base}EXPOSE 80 70000\n`)).toContain("expose-out-of-range");
    expect(rules(`${base}EXPOSE 8080/udp\n`)).not.toContain("expose-out-of-range");
    expect(rules(`${base}RUN sudo apk add x\n`)).toContain("sudo-in-run");
    expect(rules(`${base}RUN curl -fsSL https://x/i.sh | bash\n`)).toContain("curl-pipe-sh");
    expect(rules(`${base}RUN wget -qO- https://x | sh\n`)).toContain("curl-pipe-sh");
    expect(rules(`${base}MAINTAINER me\n`)).toContain("maintainer-deprecated");
    expect(rules("FROM node:22\nWORKDIR app\n")).toContain("absolute-workdir");
    expect(rules(`${base}RUN cd /tmp && ls\n`)).toContain("cd-in-run");
    expect(rules("RUN x\n")).toContain("no-from");
  });

  it("the sample triggers a broad set of rules and findings are sorted by line", () => {
    const f = lintDockerfile(parseDockerfile(DOCKERFILE_SAMPLE).instructions);
    const r = f.map((x) => x.rule);
    expect(r).toEqual(expect.arrayContaining(["no-latest-tag", "untagged-image", "maintainer-deprecated", "absolute-workdir", "copy-before-install", "consecutive-run", "secret-in-env", "apt-cleanup", "curl-pipe-sh", "cd-in-run", "add-vs-copy", "expose-out-of-range", "cmd-shell-form", "root-user"]));
    for (let i = 1; i < f.length; i++) expect(f[i].line).toBeGreaterThanOrEqual(f[i - 1].line);
  });

  it("never throws on odd input", () => {
    const weird: DockerInstruction[] = [{ line: 1, instruction: "COPY", args: "[not json" }, { line: 2, instruction: "FROM", args: "" }, { line: 3, instruction: "EXPOSE", args: "" }];
    expect(() => lintDockerfile(weird)).not.toThrow();
    expect(() => explainDockerfile(weird)).not.toThrow();
  });
});

describe("lintCompose", () => {
  it("rejects non-object documents and empty services", () => {
    expect(lintCompose("nope")[0].rule).toBe("not-an-object");
    expect(composeRules("services: {}")).toContain("no-services");
  });

  it("checks version, image, privileged, network_mode, container_name, restart, healthcheck, links", () => {
    const r = composeRules("version: '3'\nservices:\n  a:\n    image: redis\n    privileged: true\n    network_mode: host\n    container_name: a\n    links: [b]\n  b:\n    image: redis:latest\n  c:\n    restart: always\n");
    expect(r).toEqual(expect.arrayContaining(["version-deprecated", "image-untagged", "image-latest", "privileged", "network-host", "container-name", "no-restart", "no-healthcheck", "links-deprecated", "no-image-or-build"]));
  });

  it("checks ports: bind-all vs localhost, duplicates, long syntax", () => {
    const f = lintCompose(parse("services:\n  a:\n    image: x:1\n    ports: ['8080:80', '127.0.0.1:9090:90']\n  b:\n    image: y:1\n    ports:\n      - target: 80\n        published: 8080\n"));
    const bind = f.filter((x) => x.rule === "port-bind-all");
    expect(bind.map((x) => x.path)).toEqual(["services.a.ports[0]", "services.b.ports[0]"]);
    expect(f.find((x) => x.rule === "duplicate-host-port")?.path).toBe("services.b.ports[0]");
  });

  it("flags literal secrets in environment (map and list) but not ${VAR}", () => {
    const f = lintCompose(parse("services:\n  a:\n    image: x:1\n    environment:\n      DB_PASSWORD: hunter2\n      API_KEY: ${API_KEY}\n  b:\n    image: x:1\n    environment:\n      - JWT_SECRET=abc\n      - NODE_ENV=prod\n"));
    expect(f.filter((x) => x.rule === "secret-in-environment").map((x) => x.path)).toEqual(["services.a.environment.DB_PASSWORD", "services.b.environment.JWT_SECRET"]);
  });

  it("flags parent-directory volumes and unknown depends_on", () => {
    const r = composeRules("services:\n  a:\n    image: x:1\n    volumes: ['../x:/x', './y:/y', 'named:/z']\n    depends_on:\n      db:\n        condition: service_healthy\n");
    expect(r.filter((x) => x === "volume-parent-path")).toHaveLength(1);
    expect(r).toContain("depends-on-unknown");
  });

  it("lints the bundled sample and summarises services", () => {
    const doc = parse(COMPOSE_SAMPLE);
    const r = lintCompose(doc).map((x) => x.rule);
    expect(r).toEqual(expect.arrayContaining(["version-deprecated", "secret-in-environment", "depends-on-unknown", "volume-parent-path", "links-deprecated", "container-name", "image-untagged", "privileged", "duplicate-host-port", "image-latest", "network-host"]));
    const s = explainCompose(doc);
    expect(s.map((x) => x.name)).toEqual(["web", "db", "proxy"]);
    expect(s[0]).toMatchObject({ build: ".", ports: ["3000:3000"], envCount: 3, dependsOn: ["db", "cache"] });
    expect(s[1].summary).toMatch(/runs image postgres; publishes 3000:5432; mounts 1 volume; sets 1 environment variable/);
    expect(explainCompose(null)).toEqual([]);
  });
});

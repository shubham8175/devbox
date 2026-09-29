import { describe, expect, it } from "vitest";
import { parse, parseAllDocuments } from "yaml";
import { GHA_SAMPLE, K8S_SAMPLE, detectYamlKind, lintGithubActions, lintKubernetes, lintYamlDocument } from "@/lib/tools/yaml-lint";

const ghaRules = (doc: unknown) => lintGithubActions(doc).map((f) => f.rule);
const k8sRules = (doc: unknown) => lintKubernetes(doc).map((f) => f.rule);

/** A workflow with nothing to complain about, used as the base for single-rule tests. */
const GOOD_GHA = {
  name: "CI",
  on: { pull_request: {} },
  permissions: { contents: "read" },
  jobs: {
    test: {
      "runs-on": "ubuntu-24.04",
      "timeout-minutes": 10,
      steps: [{ uses: "actions/checkout@0123456789abcdef0123456789abcdef01234567" }, { run: "npm test" }],
    },
  },
};
const withJob = (extra: Record<string, unknown>, steps?: unknown[]) => ({ ...GOOD_GHA, jobs: { test: { ...GOOD_GHA.jobs.test, ...extra, ...(steps ? { steps } : {}) } } });

describe("detectYamlKind", () => {
  it("recognises each kind", () => {
    expect(detectYamlKind({ on: "push", jobs: {} })).toBe("github-actions");
    expect(detectYamlKind({ true: "push", jobs: {} })).toBe("github-actions");
    expect(detectYamlKind({ apiVersion: "v1", kind: "Pod" })).toBe("kubernetes");
    expect(detectYamlKind({ services: { web: {} } })).toBe("docker-compose");
    expect(detectYamlKind({ stages: ["build"], build: { script: ["make"] } })).toBe("gitlab-ci");
    expect(detectYamlKind({ foo: 1 })).toBe("unknown");
    expect(detectYamlKind("text")).toBe("unknown");
    expect(detectYamlKind(null)).toBe("unknown");
  });

  it("routes compose and gitlab documents to informational findings", () => {
    expect(lintYamlDocument({ services: {} }).findings[0].rule).toBe("use-docker-tool");
    expect(lintYamlDocument({ stages: [] }).findings[0].rule).toBe("gitlab-ci-minimal");
    expect(lintYamlDocument({ x: 1 })).toEqual({ kind: "unknown", findings: [] });
  });
});

describe("lintGithubActions", () => {
  it("passes a clean workflow", () => {
    expect(lintGithubActions(GOOD_GHA)).toEqual([]);
  });

  it("checks structure: name, on, jobs, runs-on, steps", () => {
    expect(lintGithubActions("x")[0].rule).toBe("not-an-object");
    expect(ghaRules({ jobs: {} })).toEqual(expect.arrayContaining(["no-name", "no-trigger", "no-jobs"]));
    expect(ghaRules({ on: [], jobs: { a: { steps: [] } } })).toEqual(expect.arrayContaining(["no-trigger", "no-runs-on", "no-steps"]));
    expect(ghaRules({ on: "push", jobs: { a: "nope" } })).toContain("job-not-object");
    expect(ghaRules({ on: "push", jobs: { a: { "runs-on": "x", steps: ["nope"] } } })).toContain("step-not-object");
  });

  it("reusable workflow jobs do not need runs-on or steps", () => {
    const r = ghaRules({ ...GOOD_GHA, jobs: { call: { uses: "org/repo/.github/workflows/x.yml@v1", permissions: {} } } });
    expect(r).not.toContain("no-runs-on");
    expect(r).not.toContain("no-steps");
  });

  it("flags floating runners, missing timeout, continue-on-error, always(), matrix fail-fast", () => {
    const r = ghaRules(withJob({ "runs-on": "ubuntu-latest", "timeout-minutes": undefined, "continue-on-error": true, if: "always()", strategy: { matrix: { node: [20] } } }));
    expect(r).toEqual(expect.arrayContaining(["runs-on-latest", "no-timeout", "continue-on-error", "if-always", "matrix-fail-fast"]));
    expect(ghaRules(withJob({ strategy: { matrix: {}, "fail-fast": false } }))).not.toContain("matrix-fail-fast");
  });

  it("checks uses: unversioned, branch, tag, outdated, local actions ignored", () => {
    const f = lintGithubActions(withJob({}, [{ uses: "actions/checkout" }, { uses: "actions/setup-node@main" }, { uses: "actions/setup-node@v2" }, { uses: "./local" }, { uses: "docker://alpine:3.20" }]));
    expect(f.filter((x) => x.path === "jobs.test.steps[0].uses").map((x) => x.rule)).toEqual(["uses-unversioned"]);
    expect(f.filter((x) => x.path === "jobs.test.steps[1].uses").map((x) => x.rule)).toEqual(["uses-branch"]);
    expect(f.filter((x) => x.path === "jobs.test.steps[2].uses").map((x) => x.rule)).toEqual(["uses-not-sha", "uses-outdated"]);
    expect(f.some((x) => x.path.startsWith("jobs.test.steps[3]") || x.path.startsWith("jobs.test.steps[4]"))).toBe(false);
  });

  it("flags both uses and run, and neither", () => {
    expect(ghaRules(withJob({}, [{ uses: "a/b@v1", run: "x" }, { name: "empty" }]))).toEqual(expect.arrayContaining(["uses-and-run", "step-empty"]));
  });

  it("detects script injection and secret echo in run", () => {
    const f = lintGithubActions(withJob({}, [{ run: 'echo "${{ github.event.pull_request.title }}"' }, { run: "echo ${{ github.head_ref }}" }, { run: "echo ${{ secrets.TOKEN }}" }, { run: 'echo "${{ github.sha }}"' }]));
    expect(f.filter((x) => x.rule === "script-injection").map((x) => x.path)).toEqual(["jobs.test.steps[0].run", "jobs.test.steps[1].run"]);
    expect(f.filter((x) => x.rule === "secret-echo").map((x) => x.path)).toEqual(["jobs.test.steps[2].run"]);
    expect(f.some((x) => x.path === "jobs.test.steps[3].run")).toBe(false);
  });

  it("flags deprecated workflow commands and step-level options", () => {
    const r = ghaRules(withJob({}, [{ run: 'echo "::set-output name=a::b"', "continue-on-error": true, if: "always()" }, { run: 'echo "::save-state name=a::b"' }]));
    expect(r).toEqual(expect.arrayContaining(["set-output-deprecated", "save-state-deprecated", "continue-on-error", "if-always"]));
  });

  it("warns about permissions once, listing jobs without them", () => {
    const f = lintGithubActions({ ...GOOD_GHA, permissions: undefined, jobs: { a: GOOD_GHA.jobs.test, b: { ...GOOD_GHA.jobs.test, permissions: { contents: "read" } } } });
    const p = f.filter((x) => x.rule === "no-permissions");
    expect(p).toHaveLength(1);
    expect(p[0].message).toContain("job a;");
    expect(ghaRules({ ...GOOD_GHA, permissions: undefined, jobs: { b: { ...GOOD_GHA.jobs.test, permissions: {} } } })).not.toContain("no-permissions");
  });

  it("flags pull_request_target checking out the PR head, and push without concurrency", () => {
    const doc = { ...GOOD_GHA, on: ["push", "pull_request_target"], jobs: { test: { ...GOOD_GHA.jobs.test, steps: [{ uses: "actions/checkout@v4", with: { ref: "${{ github.event.pull_request.head.sha }}" } }] } } };
    const r = ghaRules(doc);
    expect(r).toContain("pr-target-checkout");
    expect(r).toContain("no-concurrency");
    expect(ghaRules({ ...doc, concurrency: "ci" })).not.toContain("no-concurrency");
  });

  it("lints the bundled sample", () => {
    const r = ghaRules(parse(GHA_SAMPLE));
    expect(r).toEqual(expect.arrayContaining(["no-name", "runs-on-latest", "uses-outdated", "pr-target-checkout", "uses-unversioned", "script-injection", "secret-echo", "set-output-deprecated", "uses-branch", "uses-and-run", "continue-on-error", "no-permissions", "no-concurrency", "matrix-fail-fast"]));
  });
});

describe("lintKubernetes", () => {
  const container = { name: "app", image: "ghcr.io/acme/app:1.2.3", resources: { requests: { cpu: "100m" }, limits: { memory: "256Mi" } }, livenessProbe: {}, readinessProbe: {}, securityContext: { allowPrivilegeEscalation: false, runAsNonRoot: true } };
  const GOOD_DEPLOY = { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "app", namespace: "prod", labels: { app: "app" } }, spec: { replicas: 3, template: { spec: { containers: [container] } } } };
  const withContainer = (c: Record<string, unknown>, pod: Record<string, unknown> = {}) => ({ ...GOOD_DEPLOY, spec: { ...GOOD_DEPLOY.spec, template: { spec: { ...pod, containers: [{ ...container, ...c }] } } } });

  it("passes a clean deployment", () => {
    expect(lintKubernetes(GOOD_DEPLOY)).toEqual([]);
  });

  it("checks structure and metadata", () => {
    expect(lintKubernetes(42)[0].rule).toBe("not-an-object");
    expect(k8sRules({})).toEqual(expect.arrayContaining(["no-api-version", "no-kind", "no-name", "no-labels"]));
    expect(k8sRules({ apiVersion: "v1", kind: "ConfigMap", metadata: { name: "x", labels: { tier: "web" } } })).toEqual(["no-app-label", "no-namespace"]);
    expect(k8sRules({ apiVersion: "v1", kind: "Namespace", metadata: { name: "x", labels: { app: "x" } } })).toEqual([]);
    expect(k8sRules({ apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "x", namespace: "a", labels: { app: "x" } } })).toContain("no-spec");
    expect(k8sRules({ ...GOOD_DEPLOY, spec: { replicas: 2 } })).toContain("no-pod-spec");
    expect(k8sRules({ ...GOOD_DEPLOY, spec: { replicas: 2, template: { spec: {} } } })).toContain("no-containers");
  });

  it("flags deprecated apiVersions", () => {
    for (const v of ["extensions/v1beta1", "apps/v1beta1", "apps/v1beta2", "networking.k8s.io/v1beta1", "batch/v1beta1", "policy/v1beta1"]) {
      const f = lintKubernetes({ apiVersion: v, kind: "Thing", metadata: { name: "x" } }).find((x) => x.rule === "deprecated-api-version");
      expect(f?.severity).toBe("error");
    }
  });

  it("checks images: latest, untagged, pull policy", () => {
    expect(k8sRules(withContainer({ image: "nginx:latest" }))).toContain("image-latest");
    expect(k8sRules(withContainer({ image: "nginx" }))).toContain("image-untagged");
    expect(k8sRules(withContainer({ image: "nginx:1.27", imagePullPolicy: "Always" }))).toContain("pull-always");
    expect(k8sRules(withContainer({ image: undefined }))).toContain("no-image");
  });

  it("checks resources, probes and security context", () => {
    expect(k8sRules(withContainer({ resources: undefined }))).toEqual(expect.arrayContaining(["no-resource-requests", "no-resource-limits"]));
    expect(k8sRules(withContainer({ livenessProbe: undefined, readinessProbe: undefined }))).toEqual(expect.arrayContaining(["no-liveness-probe", "no-readiness-probe"]));
    expect(k8sRules(withContainer({ securityContext: { privileged: true } }))).toEqual(expect.arrayContaining(["privileged", "privilege-escalation", "run-as-root"]));
    // runAsNonRoot at pod level satisfies the container check.
    expect(k8sRules(withContainer({ securityContext: { allowPrivilegeEscalation: false } }, { securityContext: { runAsNonRoot: true } }))).not.toContain("run-as-root");
  });

  it("checks host namespaces, hostPath and secret-like env", () => {
    const r = k8sRules(withContainer({ env: [{ name: "DB_PASSWORD", value: "x" }, { name: "API_KEY", valueFrom: { secretKeyRef: { name: "s", key: "k" } } }] }, { hostNetwork: true, hostPID: true, hostIPC: true, volumes: [{ name: "sock", hostPath: { path: "/var/run/docker.sock" } }] }));
    expect(r).toEqual(expect.arrayContaining(["host-network", "host-pid", "host-ipc", "host-path"]));
    expect(r.filter((x) => x === "secret-in-env")).toHaveLength(1);
  });

  it("flags single-replica deployments only for Deployments", () => {
    expect(k8sRules({ ...GOOD_DEPLOY, spec: { ...GOOD_DEPLOY.spec, replicas: 1 } })).toContain("single-replica");
    expect(k8sRules({ ...GOOD_DEPLOY, spec: { ...GOOD_DEPLOY.spec, replicas: undefined } })).toContain("single-replica");
    expect(k8sRules({ ...GOOD_DEPLOY, kind: "StatefulSet", spec: { ...GOOD_DEPLOY.spec, replicas: 1 } })).not.toContain("single-replica");
  });

  it("handles CronJob, Pod and init containers", () => {
    const cron = { apiVersion: "batch/v1", kind: "CronJob", metadata: { name: "c", namespace: "a", labels: { app: "c" } }, spec: { jobTemplate: { spec: { template: { spec: { containers: [container], initContainers: [{ ...container, livenessProbe: undefined, readinessProbe: undefined }] } } } } } };
    const r = k8sRules(cron);
    expect(r).not.toContain("no-liveness-probe");
    expect(r).not.toContain("no-pod-spec");
    const pod = { apiVersion: "v1", kind: "Pod", metadata: { name: "p", namespace: "a", labels: { app: "p" } }, spec: { containers: [{ name: "x", image: "busybox:1" }] } };
    expect(k8sRules(pod)).toEqual(expect.arrayContaining(["no-resource-requests", "no-liveness-probe", "run-as-root"]));
  });

  it("checks Service, Secret and Ingress", () => {
    const base = { metadata: { name: "x", namespace: "a", labels: { app: "x" } } };
    expect(k8sRules({ apiVersion: "v1", kind: "Service", ...base, spec: { ports: [] } })).toEqual(["service-no-selector"]);
    expect(k8sRules({ apiVersion: "v1", kind: "Service", ...base, spec: { type: "ExternalName", externalName: "x.io" } })).toEqual([]);
    expect(k8sRules({ apiVersion: "v1", kind: "Service", ...base })).toEqual(["no-spec"]);
    expect(k8sRules({ apiVersion: "v1", kind: "Secret", ...base, stringData: { password: "x" } })).toEqual(["secret-string-data"]);
    expect(k8sRules({ apiVersion: "networking.k8s.io/v1", kind: "Ingress", ...base, spec: { rules: [] } })).toEqual(["ingress-no-tls"]);
    expect(k8sRules({ apiVersion: "networking.k8s.io/v1", kind: "Ingress", ...base, spec: { tls: [{ secretName: "t" }] } })).toEqual([]);
  });

  it("lints every document of the bundled multi-document sample", () => {
    const docs = parseAllDocuments(K8S_SAMPLE).map((d) => d.toJS() as unknown);
    expect(docs).toHaveLength(3);
    const results = docs.map(lintYamlDocument);
    expect(results.every((r) => r.kind === "kubernetes")).toBe(true);
    expect(results[0].findings.map((f) => f.rule)).toEqual(expect.arrayContaining(["single-replica", "host-network", "host-path", "image-untagged", "secret-in-env", "privileged", "no-namespace"]));
    expect(results[1].findings.map((f) => f.rule)).toContain("service-no-selector");
    expect(results[2].findings.map((f) => f.rule)).toEqual(expect.arrayContaining(["deprecated-api-version", "ingress-no-tls"]));
  });
});

/**
 * Linter for GitHub Actions workflows and Kubernetes manifests. It works on
 * already-parsed YAML documents (the UI parses with the lazy `yaml` module,
 * supporting multi-document files) so this file has no dependencies.
 */

export type YamlSeverity = "error" | "warning" | "info";
export type YamlKind = "github-actions" | "kubernetes" | "docker-compose" | "gitlab-ci" | "unknown";

export interface YamlFinding {
  /** Dot path into the document, e.g. jobs.build.steps[2] */
  path: string;
  rule: string;
  severity: YamlSeverity;
  message: string;
  fix?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function detectYamlKind(doc: unknown): YamlKind {
  if (!isObj(doc)) return "unknown";
  // YAML 1.1 parsers turn a bare `on:` key into boolean true; accept both spellings.
  if (("on" in doc || "true" in doc) && "jobs" in doc) return "github-actions";
  if (typeof doc.apiVersion === "string" && typeof doc.kind === "string") return "kubernetes";
  if (isObj(doc.services)) return "docker-compose";
  if (Array.isArray(doc.stages) || Object.values(doc).some((v) => isObj(v) && ("script" in v || "stage" in v))) return "gitlab-ci";
  return "unknown";
}

/* ------------------------------ GitHub Actions ------------------------------ */

const SECRET_NAME_RE = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)/i;
const FLOATING_REFS = new Set(["main", "master", "develop", "dev", "latest", "trunk", "HEAD"]);
const OUTDATED_ACTIONS: Record<string, { old: RegExp; current: string }> = {
  "actions/checkout": { old: /^v[123]$/, current: "v4" },
  "actions/setup-node": { old: /^v[123]$/, current: "v4" },
  "actions/setup-python": { old: /^v[1234]$/, current: "v5" },
  "actions/setup-go": { old: /^v[1234]$/, current: "v5" },
  "actions/setup-java": { old: /^v[123]$/, current: "v4" },
  "actions/cache": { old: /^v[123]$/, current: "v4" },
  "actions/upload-artifact": { old: /^v[123]$/, current: "v4" },
  "actions/download-artifact": { old: /^v[123]$/, current: "v4" },
  "actions/github-script": { old: /^v[123456]$/, current: "v7" },
};
/** Untrusted event fields that must never be interpolated straight into a shell script. */
const INJECTION_RE = /\$\{\{\s*(github\.event\.(issue|pull_request|comment|review|review_comment|discussion|head_commit|commits|workflow_run|inputs|pages|release)\b[^}]*|github\.head_ref|inputs\.[A-Za-z_][\w-]*)\s*\}\}/;

function triggerNames(on: unknown): string[] {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.filter((x): x is string => typeof x === "string");
  if (isObj(on)) return Object.keys(on);
  return [];
}

export function lintGithubActions(doc: unknown): YamlFinding[] {
  const out: YamlFinding[] = [];
  const push = (path: string, rule: string, severity: YamlSeverity, message: string, fix?: string) => out.push({ path, rule, severity, message, fix });
  if (!isObj(doc)) {
    push("", "not-an-object", "error", "A workflow must be a YAML mapping.");
    return out;
  }
  if (!str(doc.name)) push("name", "no-name", "info", "Workflow has no name; the file name is shown in the Actions tab instead.", "Add name: CI.");

  const on = "on" in doc ? doc.on : doc.true;
  const triggers = triggerNames(on);
  if (on === undefined || on === null || triggers.length === 0) push("on", "no-trigger", "error", "“on” is missing or empty; the workflow will never run.", "Add on: [push, pull_request] or an event mapping.");
  if (triggers.includes("push") && doc.concurrency === undefined) push("concurrency", "no-concurrency", "info", "Push-triggered workflow without concurrency; rapid pushes queue redundant runs.", "Add concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }.");

  const jobs = doc.jobs;
  if (!isObj(jobs) || Object.keys(jobs).length === 0) {
    push("jobs", "no-jobs", "error", "“jobs” is missing or empty.", "Add at least one job.");
    return out;
  }
  const topPermissions = doc.permissions !== undefined;
  const jobsWithoutPermissions: string[] = [];
  const usesPrTarget = triggers.includes("pull_request_target");

  for (const [jobId, jobRaw] of Object.entries(jobs)) {
    const jp = `jobs.${jobId}`;
    if (!isObj(jobRaw)) {
      push(jp, "job-not-object", "error", `Job “${jobId}” must be a mapping.`);
      continue;
    }
    const job = jobRaw;
    const reusable = typeof job.uses === "string";
    if (job.permissions === undefined) jobsWithoutPermissions.push(jobId);
    if (!reusable) {
      const runsOn = job["runs-on"];
      if (runsOn === undefined) push(`${jp}.runs-on`, "no-runs-on", "error", `Job “${jobId}” has no runs-on.`, "Add runs-on: ubuntu-24.04 (or a label).");
      else {
        const labels = typeof runsOn === "string" ? [runsOn] : Array.isArray(runsOn) ? runsOn.map(String) : [];
        const floating = labels.find((l) => /-latest$/.test(l));
        if (floating) push(`${jp}.runs-on`, "runs-on-latest", "info", `“${floating}” is a floating label; the OS image changes over time.`, `Pin an explicit version such as ${floating.replace(/-latest$/, "-24.04")}.`);
      }
      if (job["timeout-minutes"] === undefined) push(`${jp}.timeout-minutes`, "no-timeout", "info", `Job “${jobId}” uses the 6-hour default timeout.`, "Add timeout-minutes: 15 (or what the job needs).");
    }
    if (job["continue-on-error"] === true) push(`${jp}.continue-on-error`, "continue-on-error", "info", `Job “${jobId}” never fails the workflow, even when it breaks.`, "Remove continue-on-error unless the job is truly optional.");
    const ifExpr = str(job.if);
    if (ifExpr && /always\(\)/.test(ifExpr)) push(`${jp}.if`, "if-always", "info", "always() also runs when the workflow is cancelled.", "Use !cancelled() to skip cancelled runs.");
    if (isObj(job.strategy) && job.strategy.matrix !== undefined && job.strategy["fail-fast"] === undefined) push(`${jp}.strategy.fail-fast`, "matrix-fail-fast", "info", "Matrix jobs cancel all siblings as soon as one fails (fail-fast default).", "Set strategy.fail-fast: false to see every combination's result.");

    const steps = job.steps;
    if (!reusable && (!Array.isArray(steps) || steps.length === 0)) {
      push(`${jp}.steps`, "no-steps", "warning", `Job “${jobId}” has no steps.`);
      continue;
    }
    if (!Array.isArray(steps)) continue;
    steps.forEach((stepRaw, idx) => {
      const sp = `${jp}.steps[${idx}]`;
      if (!isObj(stepRaw)) {
        push(sp, "step-not-object", "error", "Each step must be a mapping.");
        return;
      }
      const step = stepRaw;
      const uses = str(step.uses);
      const run = str(step.run);
      if (uses && run) push(sp, "uses-and-run", "error", "A step cannot have both “uses” and “run”.", "Split into two steps.");
      if (!uses && !run) push(sp, "step-empty", "error", "Step has neither “uses” nor “run”.");
      if (uses && !uses.startsWith("./") && !uses.startsWith("docker://")) {
        const at = uses.indexOf("@");
        const action = at >= 0 ? uses.slice(0, at) : uses;
        const ref = at >= 0 ? uses.slice(at + 1) : "";
        if (!ref) push(`${sp}.uses`, "uses-unversioned", "warning", `“${uses}” has no version; GitHub rejects unversioned actions.`, `Use ${action}@<tag or SHA>.`);
        else if (FLOATING_REFS.has(ref)) push(`${sp}.uses`, "uses-branch", "warning", `“${uses}” tracks a branch, so the action can change under you at any time.`, "Pin a release tag or, better, a full commit SHA.");
        else if (!/^[0-9a-f]{40}$/i.test(ref)) push(`${sp}.uses`, "uses-not-sha", "info", `“${uses}” is pinned to a tag; tags can be moved.`, `Pin the 40-character commit SHA and add a # ${ref} comment.`);
        const key = action.split("/").slice(0, 2).join("/");
        const outdated = OUTDATED_ACTIONS[key];
        if (outdated && outdated.old.test(ref)) push(`${sp}.uses`, "uses-outdated", "warning", `${key}@${ref} runs on a deprecated Node runtime.`, `Upgrade to ${key}@${outdated.current}.`);
        if (usesPrTarget && key === "actions/checkout" && isObj(step.with)) {
          const refWith = String(step.with.ref ?? "");
          if (/github\.event\.pull_request\.head|github\.head_ref/.test(refWith)) push(`${sp}.with.ref`, "pr-target-checkout", "error", "pull_request_target runs with write permissions and secrets, and this step checks out the untrusted PR head.", "Use pull_request, or never build/run the PR code in a pull_request_target job.");
        }
      }
      if (run) {
        if (INJECTION_RE.test(run)) push(`${sp}.run`, "script-injection", "error", "Untrusted event data is interpolated directly into a shell script; a crafted title or branch name can run arbitrary commands.", "Pass it through env: (e.g. TITLE: ${{ github.event.pull_request.title }}) and use \"$TITLE\" in the script.");
        if (/echo\b[^\n]*\$\{\{\s*secrets\./.test(run)) push(`${sp}.run`, "secret-echo", "warning", "A secret is echoed; masking is best-effort and transformations (base64, split) leak it.", "Never print secrets in logs.");
        if (/::set-output\b/.test(run)) push(`${sp}.run`, "set-output-deprecated", "warning", "::set-output is deprecated and disabled on new runners.", 'Use echo "name=value" >> "$GITHUB_OUTPUT".');
        if (/::save-state\b/.test(run)) push(`${sp}.run`, "save-state-deprecated", "warning", "::save-state is deprecated.", 'Use echo "name=value" >> "$GITHUB_STATE".');
      }
      if (step["continue-on-error"] === true) push(`${sp}.continue-on-error`, "continue-on-error", "info", "Step failures are ignored.", "Remove continue-on-error unless the step is optional.");
      const stepIf = str(step.if);
      if (stepIf && /always\(\)/.test(stepIf)) push(`${sp}.if`, "if-always", "info", "always() also runs when the job is cancelled.", "Use !cancelled() or success() || failure().");
    });
  }

  if (!topPermissions && jobsWithoutPermissions.length) push("permissions", "no-permissions", "warning", `No permissions block at the top level or in job${jobsWithoutPermissions.length === 1 ? "" : "s"} ${jobsWithoutPermissions.join(", ")}; GITHUB_TOKEN gets the repository default, often read/write everywhere.`, "Add permissions: { contents: read } at the top and widen per job.");
  return out;
}

/* -------------------------------- Kubernetes -------------------------------- */

const DEPRECATED_API: Record<string, string> = {
  "extensions/v1beta1": "apps/v1 (Deployment, DaemonSet, ReplicaSet) or networking.k8s.io/v1 (Ingress, NetworkPolicy)",
  "apps/v1beta1": "apps/v1",
  "apps/v1beta2": "apps/v1",
  "networking.k8s.io/v1beta1": "networking.k8s.io/v1",
  "batch/v1beta1": "batch/v1",
  "policy/v1beta1": "policy/v1 (PodDisruptionBudget); PodSecurityPolicy was removed in 1.25 — use Pod Security Admission",
  "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1",
  "autoscaling/v2beta1": "autoscaling/v2",
  "autoscaling/v2beta2": "autoscaling/v2",
  "storage.k8s.io/v1beta1": "storage.k8s.io/v1",
  "admissionregistration.k8s.io/v1beta1": "admissionregistration.k8s.io/v1",
  "apiextensions.k8s.io/v1beta1": "apiextensions.k8s.io/v1",
};
const CLUSTER_SCOPED = new Set(["Namespace", "Node", "PersistentVolume", "StorageClass", "ClusterRole", "ClusterRoleBinding", "CustomResourceDefinition", "PodSecurityPolicy", "PriorityClass", "ValidatingWebhookConfiguration", "MutatingWebhookConfiguration", "IngressClass", "RuntimeClass", "CSIDriver", "APIService"]);
const WORKLOADS = new Set(["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob", "Pod"]);

function podSpecOf(kind: string, spec: Obj): { podSpec: Obj | null; path: string } {
  if (kind === "Pod") return { podSpec: spec, path: "spec" };
  if (kind === "CronJob") {
    const jt = isObj(spec.jobTemplate) ? spec.jobTemplate : null;
    const js = jt && isObj(jt.spec) ? jt.spec : null;
    const t = js && isObj(js.template) ? js.template : null;
    return { podSpec: t && isObj(t.spec) ? t.spec : null, path: "spec.jobTemplate.spec.template.spec" };
  }
  const t = isObj(spec.template) ? spec.template : null;
  return { podSpec: t && isObj(t.spec) ? t.spec : null, path: "spec.template.spec" };
}

function imageTag(image: string): string | null {
  const at = image.indexOf("@");
  if (at >= 0) return image.slice(at + 1);
  const lastSlash = image.lastIndexOf("/");
  const colon = image.indexOf(":", lastSlash + 1);
  return colon >= 0 ? image.slice(colon + 1) : null;
}

export function lintKubernetes(doc: unknown): YamlFinding[] {
  const out: YamlFinding[] = [];
  const push = (path: string, rule: string, severity: YamlSeverity, message: string, fix?: string) => out.push({ path, rule, severity, message, fix });
  if (!isObj(doc)) {
    push("", "not-an-object", "error", "A manifest must be a YAML mapping.");
    return out;
  }
  const apiVersion = str(doc.apiVersion);
  const kind = str(doc.kind);
  if (!apiVersion) push("apiVersion", "no-api-version", "error", "apiVersion must be a string such as apps/v1.");
  if (!kind) push("kind", "no-kind", "error", "kind must be a string such as Deployment.");
  if (apiVersion && DEPRECATED_API[apiVersion]) push("apiVersion", "deprecated-api-version", "error", `${apiVersion} is removed from current Kubernetes releases.`, `Use ${DEPRECATED_API[apiVersion]}.`);

  const meta = isObj(doc.metadata) ? doc.metadata : null;
  if (!meta || !str(meta.name)) push("metadata.name", "no-name", "error", "metadata.name is required.");
  const labels = meta && isObj(meta.labels) ? meta.labels : null;
  if (!labels || Object.keys(labels).length === 0) push("metadata.labels", "no-labels", "info", "No labels; selectors and kubectl -l filters have nothing to match.", "Add app.kubernetes.io/name and friends.");
  else if (!("app" in labels) && !("app.kubernetes.io/name" in labels)) push("metadata.labels", "no-app-label", "info", "No app or app.kubernetes.io/name label.", "Add app.kubernetes.io/name: <service>.");
  if (kind && !CLUSTER_SCOPED.has(kind) && (!meta || !str(meta.namespace))) push("metadata.namespace", "no-namespace", "info", "No namespace; the resource lands wherever kubectl's context points.", "Set metadata.namespace explicitly.");

  const spec = isObj(doc.spec) ? doc.spec : null;
  if (kind && WORKLOADS.has(kind)) {
    if (!spec) {
      push("spec", "no-spec", "error", `${kind} needs a spec.`);
      return out;
    }
    if (kind === "Deployment") {
      const replicas = spec.replicas;
      if (replicas === undefined || replicas === 1) push("spec.replicas", "single-replica", "info", `Deployment runs ${replicas === undefined ? "1 replica by default" : "a single replica"}; any restart is downtime.`, "Use replicas: 2+ with a PodDisruptionBudget for availability.");
    }
    const { podSpec, path: pp } = podSpecOf(kind, spec);
    if (!podSpec) {
      push(pp, "no-pod-spec", "error", `${kind} has no pod template spec at ${pp}.`);
      return out;
    }
    if (podSpec.hostNetwork === true) push(`${pp}.hostNetwork`, "host-network", "warning", "hostNetwork shares the node's network namespace.", "Remove it unless the pod is a CNI/monitoring agent.");
    if (podSpec.hostPID === true) push(`${pp}.hostPID`, "host-pid", "warning", "hostPID lets the pod see and signal every process on the node.");
    if (podSpec.hostIPC === true) push(`${pp}.hostIPC`, "host-ipc", "warning", "hostIPC shares the node's IPC namespace.");
    if (Array.isArray(podSpec.volumes)) {
      podSpec.volumes.forEach((v, i) => {
        if (isObj(v) && v.hostPath !== undefined) push(`${pp}.volumes[${i}].hostPath`, "host-path", "warning", `Volume “${String(v.name ?? i)}” mounts a node path; a compromised pod can reach the host filesystem.`, "Prefer emptyDir, configMap, secret or a PersistentVolumeClaim.");
      });
    }
    const podSc = isObj(podSpec.securityContext) ? podSpec.securityContext : null;
    const probesExpected = !["Job", "CronJob"].includes(kind);
    const lintContainer = (c: unknown, cp: string, init: boolean) => {
      if (!isObj(c)) return;
      const name = str(c.name) ?? "(unnamed)";
      const image = str(c.image);
      if (!image) push(`${cp}.image`, "no-image", "error", `Container “${name}” has no image.`);
      else if (!/^\$/.test(image)) {
        const tag = imageTag(image);
        if (tag === "latest") push(`${cp}.image`, "image-latest", "warning", `“${image}” uses :latest; rollouts cannot be reproduced or rolled back.`, "Pin a version tag or digest.");
        else if (tag === null) push(`${cp}.image`, "image-untagged", "warning", `“${image}” has no tag, which means :latest.`, `Use ${image}:<version>.`);
        else if (c.imagePullPolicy === "Always") push(`${cp}.imagePullPolicy`, "pull-always", "info", `imagePullPolicy: Always with the pinned image “${image}” re-pulls on every start.`, "Use IfNotPresent, or drop the field (the default for tagged images).");
      }
      const res = isObj(c.resources) ? c.resources : null;
      if (!res || !isObj(res.requests)) push(`${cp}.resources.requests`, "no-resource-requests", "warning", `Container “${name}” has no resource requests; the scheduler cannot place it sensibly.`, "Add resources.requests.cpu and memory.");
      if (!res || !isObj(res.limits)) push(`${cp}.resources.limits`, "no-resource-limits", "warning", `Container “${name}” has no resource limits; a leak can starve the node.`, "Add resources.limits.memory (and optionally cpu).");
      if (!init && probesExpected) {
        if (c.livenessProbe === undefined) push(`${cp}.livenessProbe`, "no-liveness-probe", "info", `Container “${name}” has no livenessProbe; a hung process is never restarted.`);
        if (c.readinessProbe === undefined) push(`${cp}.readinessProbe`, "no-readiness-probe", "info", `Container “${name}” has no readinessProbe; traffic arrives before it can serve.`);
      }
      const sc = isObj(c.securityContext) ? c.securityContext : null;
      if (sc?.privileged === true) push(`${cp}.securityContext.privileged`, "privileged", "warning", `Container “${name}” is privileged: full access to the node's devices and kernel.`, "Drop privileged and add only the capabilities you need.");
      if (sc?.allowPrivilegeEscalation !== false) push(`${cp}.securityContext.allowPrivilegeEscalation`, "privilege-escalation", "info", `Container “${name}” does not set allowPrivilegeEscalation: false.`, "Set it to false unless the process needs setuid binaries.");
      if (sc?.runAsNonRoot !== true && podSc?.runAsNonRoot !== true) push(`${cp}.securityContext.runAsNonRoot`, "run-as-root", "info", `Container “${name}” may run as root; runAsNonRoot is not set.`, "Set securityContext.runAsNonRoot: true (pod or container level).");
      if (Array.isArray(c.env)) {
        c.env.forEach((e, i) => {
          if (isObj(e) && typeof e.name === "string" && SECRET_NAME_RE.test(e.name) && typeof e.value === "string" && e.value && !e.valueFrom) push(`${cp}.env[${i}]`, "secret-in-env", "warning", `${e.name} has a literal value in the manifest.`, "Use valueFrom.secretKeyRef.");
        });
      }
    };
    const containers = Array.isArray(podSpec.containers) ? podSpec.containers : [];
    if (!containers.length) push(`${pp}.containers`, "no-containers", "error", "The pod template has no containers.");
    containers.forEach((c, i) => lintContainer(c, `${pp}.containers[${i}]`, false));
    if (Array.isArray(podSpec.initContainers)) podSpec.initContainers.forEach((c, i) => lintContainer(c, `${pp}.initContainers[${i}]`, true));
  } else if (kind === "Service") {
    if (!spec) push("spec", "no-spec", "error", "Service needs a spec.");
    else if (spec.type !== "ExternalName" && !isObj(spec.selector)) push("spec.selector", "service-no-selector", "warning", "Service has no selector, so no endpoints are created automatically.", "Add spec.selector matching the pod labels (or manage Endpoints yourself).");
  } else if (kind === "Secret") {
    if (isObj(doc.stringData) && Object.keys(doc.stringData).length) push("stringData", "secret-string-data", "info", "stringData holds the secret in plain text; anyone who can read this file can read the secret.", "Keep secrets out of the repository (sealed-secrets, external-secrets, SOPS).");
  } else if (kind === "Ingress") {
    if (!spec) push("spec", "no-spec", "error", "Ingress needs a spec.");
    else if (!Array.isArray(spec.tls) || spec.tls.length === 0) push("spec.tls", "ingress-no-tls", "info", "Ingress has no TLS section; traffic is served over plain HTTP.", "Add spec.tls with a secretName (cert-manager can issue it).");
  }
  return out;
}

/* ---------------------------------- shared ---------------------------------- */

export interface YamlLintDocResult {
  kind: YamlKind;
  findings: YamlFinding[];
}

/** Lint one parsed document according to its detected kind. */
export function lintYamlDocument(doc: unknown): YamlLintDocResult {
  const kind = detectYamlKind(doc);
  if (kind === "github-actions") return { kind, findings: lintGithubActions(doc) };
  if (kind === "kubernetes") return { kind, findings: lintKubernetes(doc) };
  if (kind === "docker-compose") return { kind, findings: [{ path: "", rule: "use-docker-tool", severity: "info", message: "This looks like a Docker Compose file.", fix: "Use the Dockerfile & Compose Linter tool for Compose-specific checks." }] };
  if (kind === "gitlab-ci") return { kind, findings: [{ path: "", rule: "gitlab-ci-minimal", severity: "info", message: "GitLab CI pipelines are recognised but only GitHub Actions and Kubernetes rules are implemented." }] };
  return { kind, findings: [] };
}

export const GHA_SAMPLE = `on:
  push:
    branches: [main]
  pull_request_target:

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20]
    steps:
      - uses: actions/checkout@v2
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - uses: actions/setup-node
      - name: Install
        run: npm ci
      - name: Greet
        run: echo "Building \${{ github.event.pull_request.title }}"
      - name: Debug
        run: echo \${{ secrets.NPM_TOKEN }} | base64
      - name: Version
        run: echo "::set-output name=version::1.0"
      - name: Deploy
        uses: some/deploy-action@main
        run: ./deploy.sh
        continue-on-error: true
`;

export const K8S_SAMPLE = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      hostNetwork: true
      containers:
        - name: web
          image: ghcr.io/acme/web
          imagePullPolicy: Always
          env:
            - name: DB_PASSWORD
              value: hunter2
          securityContext:
            privileged: true
      volumes:
        - name: host
          hostPath:
            path: /var/run/docker.sock
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: default
spec:
  ports:
    - port: 80
---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: web
  namespace: default
spec:
  rules:
    - host: web.example.com
`;

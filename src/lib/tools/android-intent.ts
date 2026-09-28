export type ExtraType = "S" | "i" | "l" | "b" | "f" | "d";

export interface IntentExtra {
  type: ExtraType;
  key: string;
  value: string;
}

export interface IntentFields {
  scheme: string;
  hostPath: string;
  pkg: string;
  action: string;
  category: string;
  extras: IntentExtra[];
  fallbackUrl: string;
}

export const EXTRA_TYPES: Array<{ id: ExtraType; label: string }> = [
  { id: "S", label: "String" },
  { id: "i", label: "int" },
  { id: "l", label: "long" },
  { id: "b", label: "boolean" },
  { id: "f", label: "float" },
  { id: "d", label: "double" },
];

export const DEFAULT_INTENT: IntentFields = {
  scheme: "myapp",
  hostPath: "device/123",
  pkg: "com.example.app",
  action: "android.intent.action.VIEW",
  category: "android.intent.category.BROWSABLE",
  extras: [],
  fallbackUrl: "https://example.com/get-app",
};

export interface IntentPart {
  part: string;
  explanation: string;
}

/** Encode a value inside the #Intent; block: ';' and '=' would break the syntax. */
function enc(v: string): string {
  return encodeURIComponent(v);
}

export function buildIntentUri(f: IntentFields): { uri: string; parts: IntentPart[]; adb: string; warnings: string[] } {
  const warnings: string[] = [];
  const hostPath = f.hostPath.trim().replace(/^\/+/, "");
  const parts: IntentPart[] = [];
  let uri = `intent://${hostPath}#Intent;`;
  parts.push({ part: `intent://${hostPath}`, explanation: "The data URI (host and path) delivered to the app, combined with the scheme below." });
  const scheme = f.scheme.trim().replace(/:\/\/$/, "");
  if (scheme) {
    uri += `scheme=${scheme};`;
    parts.push({ part: `scheme=${scheme}`, explanation: `The app receives the data URI as ${scheme}://${hostPath}.` });
  } else warnings.push("A scheme is normally required so the app can match the data URI.");
  if (f.pkg.trim()) {
    uri += `package=${f.pkg.trim()};`;
    parts.push({ part: `package=${f.pkg.trim()}`, explanation: "Restricts the intent to this application id; if it isn't installed the fallback URL (or Play Store) is used." });
  }
  if (f.action.trim()) {
    uri += `action=${f.action.trim()};`;
    parts.push({ part: `action=${f.action.trim()}`, explanation: "The intent action. VIEW is what browsers use for opening links." });
  }
  if (f.category.trim()) {
    uri += `category=${f.category.trim()};`;
    parts.push({ part: `category=${f.category.trim()}`, explanation: "BROWSABLE is required for intents launched from a web page." });
  }
  for (const e of f.extras) {
    if (!e.key.trim()) continue;
    const seg = `${e.type}.${e.key.trim()}=${enc(e.value)}`;
    uri += `${seg};`;
    const label = EXTRA_TYPES.find((t) => t.id === e.type)?.label ?? e.type;
    parts.push({ part: seg, explanation: `Extra “${e.key.trim()}” of type ${label}, readable via getIntent().getExtras().` });
  }
  if (f.fallbackUrl.trim()) {
    const seg = `S.browser_fallback_url=${enc(f.fallbackUrl.trim())}`;
    uri += `${seg};`;
    parts.push({ part: seg, explanation: "Where Chrome navigates when the package is not installed." });
  }
  uri += "end";
  parts.push({ part: "end", explanation: "Terminates the #Intent; block." });

  const adbParts = ["adb shell am start"];
  if (f.action.trim()) adbParts.push(`-a ${f.action.trim()}`);
  if (f.category.trim()) adbParts.push(`-c ${f.category.trim()}`);
  if (scheme) adbParts.push(`-d "${scheme}://${hostPath}"`);
  if (f.pkg.trim()) adbParts.push(`-p ${f.pkg.trim()}`);
  for (const e of f.extras) {
    if (!e.key.trim()) continue;
    const flag = { S: "--es", i: "--ei", l: "--el", b: "--ez", f: "--ef", d: "--ed" }[e.type];
    adbParts.push(`${flag} ${e.key.trim()} "${e.value}"`);
  }
  return { uri, parts, adb: adbParts.join(" \\\n  "), warnings };
}

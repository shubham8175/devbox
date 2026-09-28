export interface Base64Result {
  ok: boolean;
  output: string;
  error?: string;
}

/** UTF-8 safe Base64 encode. */
export function encodeBase64(text: string): Base64Result {
  try {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { ok: true, output: btoa(binary) };
  } catch (e) {
    return { ok: false, output: "", error: e instanceof Error ? e.message : "Could not encode." };
  }
}

/** UTF-8 safe Base64 decode. Accepts URL-safe alphabet and missing padding. */
export function decodeBase64(input: string): Base64Result {
  const cleaned = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!cleaned) return { ok: true, output: "" };
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    return { ok: false, output: "", error: "Input contains characters that are not valid Base64." };
  }
  const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const output = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, output };
  } catch {
    return {
      ok: false,
      output: "",
      error: "Could not decode. The input is either not valid Base64 or does not represent UTF-8 text.",
    };
  }
}

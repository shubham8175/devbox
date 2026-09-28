export interface PermissionSet {
  read: boolean;
  write: boolean;
  execute: boolean;
}

export interface Permissions {
  owner: PermissionSet;
  group: PermissionSet;
  others: PermissionSet;
  setuid: boolean;
  setgid: boolean;
  sticky: boolean;
}

export const EMPTY_PERMISSIONS: Permissions = {
  owner: { read: false, write: false, execute: false },
  group: { read: false, write: false, execute: false },
  others: { read: false, write: false, execute: false },
  setuid: false,
  setgid: false,
  sticky: false,
};

function digitToSet(d: number): PermissionSet {
  return { read: (d & 4) !== 0, write: (d & 2) !== 0, execute: (d & 1) !== 0 };
}

function setToDigit(s: PermissionSet): number {
  return (s.read ? 4 : 0) + (s.write ? 2 : 0) + (s.execute ? 1 : 0);
}

export function parseNumeric(raw: string): { ok: true; value: Permissions } | { ok: false; error: string } {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Enter a numeric mode like 755." };
  if (!/^[0-7]{3,4}$/.test(input)) return { ok: false, error: "Use 3 or 4 octal digits (0-7), e.g. 644 or 0755." };
  const digits = input.padStart(4, "0").split("").map(Number);
  const [special, o, g, t] = digits;
  return {
    ok: true,
    value: {
      owner: digitToSet(o),
      group: digitToSet(g),
      others: digitToSet(t),
      setuid: (special & 4) !== 0,
      setgid: (special & 2) !== 0,
      sticky: (special & 1) !== 0,
    },
  };
}

export function parseSymbolic(raw: string): { ok: true; value: Permissions } | { ok: false; error: string } {
  let input = raw.trim();
  if (!input) return { ok: false, error: "Enter a symbolic mode like rwxr-xr-x." };
  if (input.length === 10) input = input.slice(1); // strip leading file-type char (e.g. "-" or "d")
  if (!/^[rwxsStT-]{9}$/.test(input)) {
    return { ok: false, error: "Use 9 characters from r, w, x, - (e.g. rwxr-xr-x)." };
  }
  const chunk = (s: string) => s.split("");
  const [o, g, t] = [chunk(input.slice(0, 3)), chunk(input.slice(3, 6)), chunk(input.slice(6, 9))];
  const toSet = (c: string[]): PermissionSet => ({
    read: c[0] === "r",
    write: c[1] === "w",
    execute: c[2] === "x" || c[2] === "s" || c[2] === "t",
  });
  return {
    ok: true,
    value: {
      owner: toSet(o),
      group: toSet(g),
      others: toSet(t),
      setuid: o[2] === "s" || o[2] === "S",
      setgid: g[2] === "s" || g[2] === "S",
      sticky: t[2] === "t" || t[2] === "T",
    },
  };
}

export function toNumeric(p: Permissions, includeSpecial = false): string {
  const special = (p.setuid ? 4 : 0) + (p.setgid ? 2 : 0) + (p.sticky ? 1 : 0);
  const base = `${setToDigit(p.owner)}${setToDigit(p.group)}${setToDigit(p.others)}`;
  return includeSpecial || special ? `${special}${base}` : base;
}

export function toSymbolic(p: Permissions): string {
  const triple = (s: PermissionSet, special: boolean, specialChar: string) => {
    const x = special ? (s.execute ? specialChar : specialChar.toUpperCase()) : s.execute ? "x" : "-";
    return `${s.read ? "r" : "-"}${s.write ? "w" : "-"}${x}`;
  };
  return triple(p.owner, p.setuid, "s") + triple(p.group, p.setgid, "s") + triple(p.others, p.sticky, "t");
}

export function describePermissionSet(s: PermissionSet): string {
  const parts: string[] = [];
  if (s.read) parts.push("read");
  if (s.write) parts.push("write");
  if (s.execute) parts.push("execute");
  return parts.length ? parts.join(", ") : "no access";
}

export const PERMISSION_PRESETS: Array<{ mode: string; label: string }> = [
  { mode: "755", label: "Executables, directories" },
  { mode: "644", label: "Regular files" },
  { mode: "600", label: "Private files (keys, secrets)" },
  { mode: "700", label: "Private directories" },
  { mode: "664", label: "Group-writable files" },
  { mode: "777", label: "Everyone (avoid)" },
];

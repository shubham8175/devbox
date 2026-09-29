import { createPublicKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KEY_TYPES, buildOpenSshPublicKey, buildSshPublicKeyBlob, encodeMpint, encodeSshString, generateKeyPair, keyTypeInfo, pemWrap, sshFingerprint } from "@/lib/tools/keypair";
import { TAG, parseDer, pemToDer } from "@/lib/tools/asn1";

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Known vectors: keys generated with `ssh-keygen -t <type> -C devbox`, the
 * `.pub` line copied verbatim and the fingerprint from `ssh-keygen -lf`.
 * JWK components come from node's `createPublicKey(...).export({ format: "jwk" })`
 * (Ed25519: the 32-byte key from the blob, verified to import in node).
 */
const VECTORS = {
  ed25519: {
    jwk: { kty: "OKP", crv: "Ed25519", x: "HY7X2BCVB78GXTZ6DFcLUQXSdZsp0IqD1Ywa-iRNuAk" },
    pub: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB2O19gQlQe/Bl02egxXC1EF0nWbKdCKg9WMGvokTbgJ devbox",
    fingerprint: "SHA256:6d7e58dLi9KktHPfpAl7bOOYFaI67m3xljSBPHaYrE0",
  },
  rsa: {
    jwk: {
      kty: "RSA",
      n: "taxY16_MJHSN4Ty16M-NErJc-J_D7tWrX5xXgjAd5TgiNNlNxMllBgBc3IA2svfxHFeBBYEWttWVWBhLw85j9iDxB99Yzrm7O5num-DDUdfiXCarFzRcGaG-2xOGCMwDEBTD7bcreRKxQgPyXRGczcq86TYd25iEvj_6H3hK1VZRW0pIv_FPh8LIFGrlr2_Uoyjs4cky6yiI7iNzzT94g2iQIzhLR9kv-XIza1uwrz8bZC0A2lWuAPK0WMXbMaqJeazVH01AWoRp_03kNrmhmNNsnIFj0APsb40AvDmZpfEs5tUuw0zzUQcU5JwW8aD0xlkfa43CvUUST8t8CQJ5OQ",
      e: "AQAB",
    },
    pub: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC1rFjXr8wkdI3hPLXoz40Sslz4n8Pu1atfnFeCMB3lOCI02U3EyWUGAFzcgDay9/EcV4EFgRa21ZVYGEvDzmP2IPEH31jOubs7me6b4MNR1+JcJqsXNFwZob7bE4YIzAMQFMPttyt5ErFCA/JdEZzNyrzpNh3bmIS+P/ofeErVVlFbSki/8U+HwsgUauWvb9SjKOzhyTLrKIjuI3PNP3iDaJAjOEtH2S/5cjNrW7CvPxtkLQDaVa4A8rRYxdsxqol5rNUfTUBahGn/TeQ2uaGY02ycgWPQA+xvjQC8OZml8Szm1S7DTPNRBxTknBbxoPTGWR9rjcK9RRJPy3wJAnk5 devbox",
    fingerprint: "SHA256:uWEkiASgPYVWwdwSpuTmgGkHF6p+JPhMqJfSoEOT3Rw",
  },
  ec: {
    jwk: { kty: "EC", crv: "P-256", x: "XdDlv4jQWFFRQq66bTXni_zlRuo2uSTUttoSkYGXQN8", y: "ljQyqh305-VfqqPe7xv_VP_G1JY-TJ5ZUQ4NxvGzFss" },
    pub: "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBF3Q5b+I0FhRUUKuum0154v85UbqNrkk1LbaEpGBl0DfljQyqh305+VfqqPe7xv/VP/G1JY+TJ5ZUQ4NxvGzFss= devbox",
    fingerprint: "SHA256:wdIZpl23CoLhF61dMOf3sP5+Q9TQdzmdW/rItJ9lMSQ",
  },
} as const;

describe("SSH wire encoding", () => {
  it("length-prefixes strings", () => {
    expect(hex(encodeSshString("ssh-rsa"))).toBe("000000077373682d727361");
    expect(hex(encodeSshString(new Uint8Array(0)))).toBe("00000000");
  });

  it("encodes mpints with sign padding and stripped leading zeros", () => {
    expect(hex(encodeMpint(new Uint8Array([0])))).toBe("00000000");
    expect(hex(encodeMpint(new Uint8Array(0)))).toBe("00000000");
    expect(hex(encodeMpint(new Uint8Array([0x7f])))).toBe("000000017f");
    expect(hex(encodeMpint(new Uint8Array([0x80])))).toBe("000000020080");
    expect(hex(encodeMpint(new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01])))).toBe("00000003010001");
    expect(hex(encodeMpint(new Uint8Array([0x00, 0xff])))).toBe("0000000200ff");
  });

  it("wraps DER in PEM with 64-column lines", () => {
    const pem = pemWrap(new Uint8Array(70).fill(0x30), "PUBLIC KEY");
    const lines = pem.split("\n");
    expect(lines[0]).toBe("-----BEGIN PUBLIC KEY-----");
    expect(lines[1]).toHaveLength(64);
    expect(lines[2]).toHaveLength(32);
    expect(lines[3]).toBe("-----END PUBLIC KEY-----");
    expect(pem.endsWith("\n")).toBe(true);
  });
});

describe("buildOpenSshPublicKey against ssh-keygen", () => {
  it.each(Object.entries(VECTORS))("reproduces the %s .pub line and fingerprint", async (_name, v) => {
    expect(buildOpenSshPublicKey(v.jwk)).toBe(v.pub);
    const { type, blob } = buildSshPublicKeyBlob(v.jwk);
    expect(v.pub.startsWith(`${type} `)).toBe(true);
    expect(await sshFingerprint(blob)).toBe(v.fingerprint);
  });

  it("supports a custom or empty comment", () => {
    expect(buildOpenSshPublicKey(VECTORS.ed25519.jwk, "me@host")).toMatch(/ me@host$/);
    expect(buildOpenSshPublicKey(VECTORS.ed25519.jwk, "")).toBe(VECTORS.ed25519.pub.replace(/ devbox$/, ""));
  });

  it("left-pads short EC coordinates to the field size", () => {
    const shortX = { ...VECTORS.ec.jwk, x: "AQ" }; // a single byte
    const { blob } = buildSshPublicKeyBlob(shortX);
    // blob = string(type) + string(nistp256) + string(point); point must be 65 bytes.
    const pointLen = blob.length - (4 + 19) - (4 + 8) - 4;
    expect(pointLen).toBe(65);
  });

  it("rejects unsupported keys and missing components", () => {
    expect(() => buildOpenSshPublicKey({ kty: "oct", k: "abc" })).toThrow(/Unsupported key type/);
    expect(() => buildOpenSshPublicKey({ kty: "EC", crv: "secp256k1", x: "AQ", y: "AQ" })).toThrow(/Unsupported EC curve/);
    expect(() => buildOpenSshPublicKey({ kty: "RSA", n: "AQ" })).toThrow(/missing "e"/);
    expect(() => buildOpenSshPublicKey({ kty: "OKP", crv: "Ed448", x: "AQ" })).toThrow(/Unsupported/);
  });
});

describe("generateKeyPair (WebCrypto)", () => {
  it("lists every key type with metadata", () => {
    expect(KEY_TYPES.map((k) => k.id)).toEqual(["rsa-2048", "rsa-3072", "rsa-4096", "ec-p256", "ec-p384", "ec-p521", "ed25519"]);
    expect(keyTypeInfo("ec-p256").jwtAlg).toBe("ES256");
    expect(() => keyTypeInfo("nope" as never)).toThrow();
  });

  it("generates an RSA-2048 pair as PEM, JWK and OpenSSH that node can import", async () => {
    const r = await generateKeyPair("rsa-2048");
    if (!r.ok) throw new Error(r.error);
    expect(r.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n[\s\S]+-----END PUBLIC KEY-----\n$/);
    expect(r.privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----\n[\s\S]+-----END PRIVATE KEY-----\n$/);
    expect(r.openssh).toMatch(/^ssh-rsa AAAAB3NzaC1yc2E[A-Za-z0-9+/]+=* devbox$/);
    expect(r.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);

    const pub = JSON.parse(r.publicJwk) as JsonWebKey;
    const priv = JSON.parse(r.privateJwk) as JsonWebKey;
    expect(pub.kty).toBe("RSA");
    expect(pub.alg).toBe("RS256");
    expect(pub.e).toBe("AQAB");
    expect(pub.key_ops).toBeUndefined();
    expect(pub.ext).toBeUndefined();
    expect(pub.d).toBeUndefined();
    expect(typeof priv.d).toBe("string");
    expect(priv.n).toBe(pub.n);

    // The SPKI PEM is a real key: node parses it and agrees on the modulus.
    const nodeJwk = createPublicKey(r.publicPem).export({ format: "jwk" });
    expect(nodeJwk.n).toBe(pub.n);
    // The SSH line is derived from the same key and the fingerprint hashes its blob.
    expect(buildOpenSshPublicKey(nodeJwk as JsonWebKey)).toBe(r.openssh);
    expect(await sshFingerprint(buildSshPublicKeyBlob(pub).blob)).toBe(r.fingerprint);

    // And the DER is a SubjectPublicKeyInfo our ASN.1 reader understands.
    const der = pemToDer(r.publicPem);
    if (!der.ok) throw new Error(der.error);
    const root = parseDer(der.der);
    expect(root.tag).toBe(TAG.SEQUENCE);
    expect(root.children?.[1].tag).toBe(TAG.BIT_STRING);
  }, 20_000);

  it("generates a P-256 pair usable for ES256", async () => {
    const r = await generateKeyPair("ec-p256");
    if (!r.ok) throw new Error(r.error);
    expect(r.openssh).toMatch(/^ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTY[A-Za-z0-9+/]+=* devbox$/);
    const pub = JSON.parse(r.publicJwk) as JsonWebKey;
    expect(pub.crv).toBe("P-256");
    expect(pub.alg).toBe("ES256");
    expect(createPublicKey(r.publicPem).export({ format: "jwk" }).x).toBe(pub.x);

    // Sign with the exported private key and verify with the exported public key.
    const priv = await crypto.subtle.importKey("pkcs8", pemToDerBytes(r.privatePem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const pubKey = await crypto.subtle.importKey("spki", pemToDerBytes(r.publicPem), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const data = new TextEncoder().encode("devbox");
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, data);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sig, data)).toBe(true);
  });

  it("generates Ed25519 where supported, or explains that it is not", async () => {
    const r = await generateKeyPair("ed25519");
    if (r.ok) {
      expect(r.openssh).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43} devbox$/);
      expect((JSON.parse(r.publicJwk) as JsonWebKey).alg).toBe("EdDSA");
    } else {
      expect(r.error).toMatch(/Ed25519 is not supported by this browser yet/);
    }
  });

  it("reports missing Web Crypto instead of throwing", async () => {
    const r = await generateKeyPair("rsa-2048", null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Web Crypto is unavailable/);
  });
});

function pemToDerBytes(pem: string): Uint8Array<ArrayBuffer> {
  const r = pemToDer(pem);
  if (!r.ok) throw new Error(r.error);
  return new Uint8Array(r.der);
}

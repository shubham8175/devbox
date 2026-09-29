import { describe, expect, it } from "vitest";
import { CERTIFICATE_SAMPLE, certificateFingerprints, decodeCertificate, decodeCertificateDer, type CertOk } from "@/lib/tools/certificate";
import { pemToDer } from "@/lib/tools/asn1";

/** ECDSA P-256 leaf with a full set of extensions, generated with openssl for these tests. */
const EC_CERT = `-----BEGIN CERTIFICATE-----
MIIDwzCCA2igAwIBAgIUf010FZi7FQCmlDVCUYHG5CWojFgwCgYIKoZIzj0EAwIw
gYcxCzAJBgNVBAYTAklOMQswCQYDVQQIDAJNSDENMAsGA1UEBwwEUHVuZTEPMA0G
A1UECgwGRGV2Qm94MQwwCgYDVQQLDANFbmcxGjAYBgNVBAMMEWVjLmRldmJveC5l
eGFtcGxlMSEwHwYJKoZIhvcNAQkBFhJvcHNAZGV2Ym94LmV4YW1wbGUwHhcNMjYw
OTI5MTc1MTQ4WhcNMjcwOTI5MTc1MTQ4WjCBhzELMAkGA1UEBhMCSU4xCzAJBgNV
BAgMAk1IMQ0wCwYDVQQHDARQdW5lMQ8wDQYDVQQKDAZEZXZCb3gxDDAKBgNVBAsM
A0VuZzEaMBgGA1UEAwwRZWMuZGV2Ym94LmV4YW1wbGUxITAfBgkqhkiG9w0BCQEW
Em9wc0BkZXZib3guZXhhbXBsZTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABK71
AlQ6rliFNzN2pmg3mlv3vCrnIcuPwDetEY0lF92a7fHbRsccFK1yGprQ9OevejsF
Kgxeg6WC7ZCKyx75mBWjggGuMIIBqjAdBgNVHQ4EFgQUCFCCFjZvjWyYLuyjd9Ng
MLfo0kYwHwYDVR0jBBgwFoAUCFCCFjZvjWyYLuyjd9NgMLfo0kYwDgYDVR0PAQH/
BAQDAgOIMB0GA1UdJQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjBtBgNVHREEZjBk
ghFlYy5kZXZib3guZXhhbXBsZYcQAAAAAAAAAAAAAAAAAAAAAYcQIAENuAAAAAAA
AAAAAAAAAYESb3BzQGRldmJveC5leGFtcGxlhhdodHRwczovL2RldmJveC5leGFt
cGxlLzAMBgNVHRMBAf8EAjAAMA8GBCoDBAUEBwwFaGVsbG8wMQYDVR0fBCowKDAm
oCSgIoYgaHR0cDovL2NybC5kZXZib3guZXhhbXBsZS9jYS5jcmwwYwYIKwYBBQUH
AQEEVzBVMCYGCCsGAQUFBzABhhpodHRwOi8vb2NzcC5kZXZib3guZXhhbXBsZTAr
BggrBgEFBQcwAoYfaHR0cDovL2NhLmRldmJveC5leGFtcGxlL2NhLmNydDATBgNV
HSAEDDAKMAgGBmeBDAECATAKBggqhkjOPQQDAgNJADBGAiEAgRbH4dqIwH73cb8H
fLHHKoioAae/rFMMeTToTNZRdFUCIQCdFLOg7FmUblmIx5XrwJvJSWEtZn6a2jq2
Cvm9bt4hGQ==
-----END CERTIFICATE-----`;

/** Ed25519 self-signed CA, 30-day validity. */
const ED_CERT = `-----BEGIN CERTIFICATE-----
MIIBTDCB/6ADAgECAhRbYU07hd2OvjPxxUmv3iSaogb3TjAFBgMrZXAwHDEaMBgG
A1UEAwwRZWQuZGV2Ym94LmV4YW1wbGUwHhcNMjYwOTI5MTc1MTQ4WhcNMjYxMDI5
MTc1MTQ4WjAcMRowGAYDVQQDDBFlZC5kZXZib3guZXhhbXBsZTAqMAUGAytlcAMh
APdmjyHmvu0y/aMVrqbAzto0n1nJy7wY/fdlQPg95Be4o1MwUTAdBgNVHQ4EFgQU
WBpJaQM2sX5Ek6OCWpf57W7HYWMwHwYDVR0jBBgwFoAUWBpJaQM2sX5Ek6OCWpf5
7W7HYWMwDwYDVR0TAQH/BAUwAwEB/zAFBgMrZXADQQDsqiIHaeCWiDWuiI1CWj0P
GLa/5Ts69kl+BK4PTT7Aja/amVRRKFWmqHJbQxOFDw+zc4Q42lxvt4pXn8jy12gP
-----END CERTIFICATE-----`;

const NOW = new Date("2030-01-01T00:00:00Z");

function ok(r: ReturnType<typeof decodeCertificate>): CertOk {
  if (!r.ok) throw new Error(`Expected success, got: ${r.error}`);
  return r;
}

describe("decodeCertificate: sample RSA certificate", () => {
  const cert = ok(decodeCertificate(CERTIFICATE_SAMPLE, NOW));

  it("reads version, serial and signature algorithm", () => {
    expect(cert.version).toBe(3);
    expect(cert.serialHex).toBe("04:47:64:07:11:6a:83:c9:a8:b0:37:b6:8f:54:ca:d9:9e:51:29:a1");
    expect(cert.serialDecimal).toBe("24428029626110709179289039138099035573171857825");
    expect(cert.signatureAlgorithm).toBe("sha256WithRSAEncryption");
    expect(cert.signatureAlgorithmOid).toBe("1.2.840.113549.1.1.11");
    expect(cert.chainCount).toBe(1);
  });

  it("reads subject and issuer as ordered RDNs", () => {
    expect(cert.subject.attributes).toEqual([
      { oid: "2.5.4.3", name: "CN", value: "devbox.example" },
      { oid: "2.5.4.10", name: "O", value: "DevBox" },
    ]);
    expect(cert.subject.oneLine).toBe("CN=devbox.example, O=DevBox");
    expect(cert.issuer.oneLine).toBe("CN=devbox.example, O=DevBox");
    expect(cert.selfSigned).toBe(true);
  });

  it("reads validity and computes status against the given time", () => {
    expect(cert.notBeforeIso).toBe("2026-09-29T17:44:20.000Z");
    expect(cert.notAfterIso).toBe("2036-09-26T17:44:20.000Z");
    expect(cert.validityDays).toBe(3650);
    expect(cert.status.state).toBe("valid");
    expect(cert.status.daysRemaining).toBe(2461);
    expect(cert.status.message).toBe("Valid — expires in 2461 days");
  });

  it("reports expired and not-yet-valid states", () => {
    const expired = ok(decodeCertificate(CERTIFICATE_SAMPLE, new Date("2040-01-01T00:00:00Z")));
    expect(expired.status.state).toBe("expired");
    expect(expired.status.daysRemaining).toBeLessThan(0);
    expect(expired.status.message).toMatch(/^Expired 1191 days ago$/);
    const early = ok(decodeCertificate(CERTIFICATE_SAMPLE, new Date("2026-09-28T17:44:20Z")));
    expect(early.status.state).toBe("not-yet-valid");
    expect(early.status.message).toBe("Not valid yet — becomes valid in 1 day");
  });

  it("reads the RSA public key", () => {
    expect(cert.publicKey).toEqual({ algorithm: "RSA", oid: "1.2.840.113549.1.1.1", bits: 2048, exponent: "65537", curve: null, summary: "RSA 2048-bit, e=65537" });
  });

  it("decodes SAN, basic constraints and key identifiers", () => {
    expect(cert.san).toEqual({ dns: ["devbox.example", "www.devbox.example"], ip: ["127.0.0.1"], email: [], uri: [], other: [] });
    expect(cert.basicConstraints).toEqual({ ca: true, pathLen: null });
    expect(cert.subjectKeyId).toBe("1E:A4:A1:63:60:57:E1:FF:68:6E:1A:F5:08:7E:24:BC:8E:B7:0D:6A");
    expect(cert.authorityKeyId).toBe(cert.subjectKeyId);
    expect(cert.keyUsage).toBeNull();
    expect(cert.extKeyUsage).toBeNull();
    expect(cert.extensions.map((e) => [e.name, e.critical])).toEqual([
      ["subjectKeyIdentifier", false],
      ["authorityKeyIdentifier", false],
      ["basicConstraints", true],
      ["subjectAltName", false],
    ]);
    expect(cert.extensions[3].value).toBe("DNS:devbox.example, DNS:www.devbox.example, IP:127.0.0.1");
    expect(cert.unknownExtensions).toEqual([]);
  });

  it("computes fingerprints that match openssl", async () => {
    const fp = await certificateFingerprints(cert.der);
    expect(fp.sha1).toBe("C8:93:74:8C:E8:12:DF:34:EA:05:8C:67:9F:B3:80:7A:25:CA:A6:E6");
    expect(fp.sha256).toBe("96:80:C9:48:C9:DC:81:53:AD:AB:F9:F8:CE:72:DF:64:E9:83:DD:23:84:DA:91:A0:73:C5:5C:C9:9E:71:35:EB");
  });
});

describe("decodeCertificate: EC certificate with many extensions", () => {
  const cert = ok(decodeCertificate(EC_CERT, NOW));

  it("reads a full distinguished name including emailAddress", () => {
    expect(cert.subject.oneLine).toBe("C=IN, ST=MH, L=Pune, O=DevBox, OU=Eng, CN=ec.devbox.example, emailAddress=ops@devbox.example");
    expect(cert.signatureAlgorithm).toBe("ecdsa-with-SHA256");
    expect(cert.serialHex).toBe("7f:4d:74:15:98:bb:15:00:a6:94:35:42:51:81:c6:e4:25:a8:8c:58");
  });

  it("reads the EC public key and curve", () => {
    expect(cert.publicKey.algorithm).toBe("EC");
    expect(cert.publicKey.curve).toBe("P-256");
    expect(cert.publicKey.bits).toBe(256);
    expect(cert.publicKey.summary).toBe("EC P-256 (256-bit)");
  });

  it("decodes key usage, EKU, SAN with IPv6/email/URI, and CA:FALSE", () => {
    expect(cert.keyUsage).toEqual(["digitalSignature", "keyAgreement"]);
    expect(cert.extKeyUsage).toEqual(["serverAuth", "clientAuth"]);
    expect(cert.san).toEqual({ dns: ["ec.devbox.example"], ip: ["::1", "2001:db8::1"], email: ["ops@devbox.example"], uri: ["https://devbox.example/"], other: [] });
    expect(cert.basicConstraints).toEqual({ ca: false, pathLen: null });
    const byName = Object.fromEntries(cert.extensions.map((e) => [e.name, e]));
    expect(byName.keyUsage.critical).toBe(true);
    expect(byName.cRLDistributionPoints.value).toBe("URI:http://crl.devbox.example/ca.crl");
    expect(byName.authorityInfoAccess.value).toBe("OCSP - URI:http://ocsp.devbox.example, caIssuers - URI:http://ca.devbox.example/ca.crt");
    expect(byName.certificatePolicies.value).toBe("domain-validated");
  });

  it("lists unknown extensions with their raw value", () => {
    expect(cert.unknownExtensions).toEqual([{ oid: "1.2.3.4.5", critical: false }]);
    const unknown = cert.extensions.find((e) => e.oid === "1.2.3.4.5");
    expect(unknown?.known).toBe(false);
    expect(unknown?.value).toBe("#0c0568656c6c6f");
  });
});

describe("decodeCertificate: Ed25519 and bundles", () => {
  it("reads an Ed25519 certificate", () => {
    const cert = ok(decodeCertificate(ED_CERT, NOW));
    expect(cert.publicKey.algorithm).toBe("Ed25519");
    expect(cert.publicKey.bits).toBe(256);
    expect(cert.signatureAlgorithm).toBe("Ed25519");
    expect(cert.validityDays).toBe(30);
    expect(cert.san).toBeNull();
  });

  it("decodes the first certificate of a bundle and counts the chain", () => {
    const cert = ok(decodeCertificate(`${EC_CERT}\n${CERTIFICATE_SAMPLE}\n${ED_CERT}`, NOW));
    expect(cert.subject.attributes[0].value).toBe("IN");
    expect(cert.chainCount).toBe(3);
  });

  it("accepts raw base64 without armour", () => {
    const body = CERTIFICATE_SAMPLE.replace(/-----[^-]+-----/g, "");
    const cert = ok(decodeCertificate(body, NOW));
    expect(cert.subject.oneLine).toBe("CN=devbox.example, O=DevBox");
    expect(cert.chainCount).toBe(1);
  });

  it("decodes DER bytes directly", () => {
    const der = pemToDer(CERTIFICATE_SAMPLE);
    if (!der.ok) throw new Error(der.error);
    const cert = decodeCertificateDer(der.der, NOW);
    expect(cert.ok && cert.subject.oneLine).toBe("CN=devbox.example, O=DevBox");
  });
});

describe("decodeCertificate: errors", () => {
  it("rejects CSRs, private keys and public keys with a clear message", () => {
    const wrap = (label: string) => `-----BEGIN ${label}-----\nMAMCAQU=\n-----END ${label}-----`;
    expect(decodeCertificate(wrap("CERTIFICATE REQUEST"))).toEqual({ ok: false, error: "This looks like a certificate signing request, not a certificate." });
    expect(decodeCertificate(wrap("NEW CERTIFICATE REQUEST")).ok).toBe(false);
    const pk = decodeCertificate(wrap("PRIVATE KEY"));
    expect(!pk.ok && pk.error).toMatch(/private key, not a certificate/);
    expect(!pk.ok && pk.error).toMatch(/private key, not a certificate/);
    const rsa = decodeCertificate(wrap("RSA PRIVATE KEY"));
    expect(!rsa.ok && rsa.error).toMatch(/private key/);
    const pub = decodeCertificate(wrap("PUBLIC KEY"));
    expect(!pub.ok && pub.error).toMatch(/public key, not a certificate/);
    const other = decodeCertificate(wrap("DH PARAMETERS"));
    expect(!other.ok && other.error).toMatch(/found "DH PARAMETERS"/);
  });

  it("rejects empty, garbage and truncated input without throwing", () => {
    expect(decodeCertificate("")).toEqual({ ok: false, error: "Input is empty." });
    expect(decodeCertificate("hello world!").ok).toBe(false);
    const truncated = CERTIFICATE_SAMPLE.split("\n").slice(0, 8).join("\n") + "\n-----END CERTIFICATE-----";
    const r = decodeCertificate(truncated);
    expect(!r.ok && r.error).toMatch(/Could not decode/);
    expect(decodeCertificateDer(new Uint8Array([0x02, 0x01, 0x05])).ok).toBe(false);
    expect(decodeCertificateDer(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05])).ok).toBe(false);
    expect(decodeCertificateDer(new Uint8Array(0)).ok).toBe(false);
  });

  it("does not hang on hostile inputs", () => {
    const inputs = ["-----BEGIN CERTIFICATE-----\n" + "A".repeat(50_000) + "\n-----END CERTIFICATE-----", "-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----", "MIIDbDCCAlSgAwIBAgIU"];
    for (const input of inputs) expect(() => decodeCertificate(input)).not.toThrow();
  });
});

import sodium from "libsodium-wrappers";
import { beforeAll, describe, expect, it } from "vitest";
import { keyRefOf, sealToken, tokenFingerprint } from "./token-seal";

const TOKEN = "hr-token-abcdef1234567890-secret-a9f2";
let keypair: { publicKey: Uint8Array; privateKey: Uint8Array };

beforeAll(async () => {
  await sodium.ready;
  keypair = sodium.crypto_box_keypair();
  process.env.TOKEN_SEAL_PUBLIC_KEY = sodium.to_base64(
    keypair.publicKey,
    sodium.base64_variants.ORIGINAL,
  );
  process.env.TOKEN_FINGERPRINT_PEPPER = "test-pepper";
});

describe("sealToken", () => {
  it("seals to a ciphertext the matching private key opens", async () => {
    const sealed = await sealToken(TOKEN);
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(sealed.ciphertext, sodium.base64_variants.ORIGINAL),
      keypair.publicKey,
      keypair.privateKey,
    );
    expect(sodium.to_string(opened)).toBe(TOKEN);
  });

  it("never repeats a ciphertext (ephemeral keys per seal)", async () => {
    const [a, b] = [await sealToken(TOKEN), await sealToken(TOKEN)];
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("returns display last4 and the key ref of the sealing key", async () => {
    const sealed = await sealToken(TOKEN);
    expect(sealed.last4).toBe("a9f2");
    expect(sealed.keyRef).toBe(keyRefOf(keypair.publicKey));
    expect(sealed.keyRef).toMatch(/^[0-9a-f]{12}$/);
  });

  it("does not leak the token in ciphertext or errors", async () => {
    const sealed = await sealToken(TOKEN);
    expect(sealed.ciphertext).not.toContain(TOKEN);
    await expect(sealToken("short")).rejects.toThrow(/unexpected format/);
    await expect(sealToken("short")).rejects.not.toThrow(/short/);
  });

  it("trims pasted whitespace before sealing", async () => {
    const sealed = await sealToken(`  ${TOKEN}\n`);
    expect(sealed.last4).toBe("a9f2");
    expect(sealed.fingerprint).toBe(tokenFingerprint(TOKEN));
  });
});

describe("tokenFingerprint", () => {
  it("is deterministic under one pepper", () => {
    expect(tokenFingerprint(TOKEN)).toBe(tokenFingerprint(TOKEN));
  });

  it("changes with the pepper", () => {
    const before = tokenFingerprint(TOKEN);
    process.env.TOKEN_FINGERPRINT_PEPPER = "other-pepper";
    expect(tokenFingerprint(TOKEN)).not.toBe(before);
    process.env.TOKEN_FINGERPRINT_PEPPER = "test-pepper";
  });

  it("requires the pepper to be configured", () => {
    const pepper = process.env.TOKEN_FINGERPRINT_PEPPER;
    delete process.env.TOKEN_FINGERPRINT_PEPPER;
    expect(() => tokenFingerprint(TOKEN)).toThrow(/TOKEN_FINGERPRINT_PEPPER/);
    process.env.TOKEN_FINGERPRINT_PEPPER = pepper;
  });
});

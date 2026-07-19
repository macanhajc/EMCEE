/**
 * Bot-token sealing — control-plane half of the token lifecycle
 * (specs/05-security.md).
 *
 * libsodium sealed box (X25519 + XSalsa20-Poly1305): this plane holds only
 * TOKEN_SEAL_PUBLIC_KEY, so it can encrypt a pasted token but can never
 * decrypt one. There is intentionally no unseal function here — the private
 * key exists only on data-plane hosts (workers/runtime/tokenbox.py). A
 * compromised control plane cannot read customer tokens.
 *
 * Plaintext exists only in the arguments of these functions; it is never
 * stored, logged, or included in error messages.
 */
import "server-only";
import { createHash, createHmac } from "node:crypto";
import sodium from "libsodium-wrappers";

export interface SealedToken {
  /** base64 (standard, padded) sealed-box ciphertext → bot_instances.token_ciphertext */
  ciphertext: string;
  /** identifies the sealing keypair, enables rotation → bot_instances.token_key_ref */
  keyRef: string;
  /** display only: "token ending …a9f2" → bot_instances.token_last4 */
  last4: string;
  /** peppered HMAC for trial dedupe, irreversible → bot_instances.token_fingerprint */
  fingerprint: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** First 12 hex chars of SHA-256 of the raw public key. Must match tokenbox.py. */
export function keyRefOf(publicKey: Uint8Array): string {
  return createHash("sha256").update(publicKey).digest("hex").slice(0, 12);
}

/**
 * Peppered HMAC-SHA256 of the token. Used for trial-abuse dedupe
 * (trial_registry) — irreversible, and useless without the pepper, which
 * lives only on the control plane. Changing the pepper invalidates all
 * stored fingerprints.
 */
export function tokenFingerprint(rawToken: string): string {
  return createHmac("sha256", requireEnv("TOKEN_FINGERPRINT_PEPPER"))
    .update(rawToken.trim())
    .digest("hex");
}

export async function sealToken(rawToken: string): Promise<SealedToken> {
  const token = rawToken.trim();
  // Sanity bounds only — never echo the value or its length in the error.
  if (token.length < 8 || token.length > 512) {
    throw new Error("token has an unexpected format");
  }
  await sodium.ready;
  const publicKey = sodium.from_base64(
    requireEnv("TOKEN_SEAL_PUBLIC_KEY"),
    sodium.base64_variants.ORIGINAL,
  );
  const ciphertext = sodium.crypto_box_seal(sodium.from_string(token), publicKey);
  return {
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
    keyRef: keyRefOf(publicKey),
    last4: token.slice(-4),
    fingerprint: tokenFingerprint(token),
  };
}

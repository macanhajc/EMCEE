"""Bot-token unsealing — the only decrypt path in the system.

Counterpart to apps/web/src/lib/token-seal.ts (specs/05-security.md).
TOKEN_SEAL_PRIVATE_KEY exists only on data-plane hosts; the supervisor
unseals at instance spawn and the plaintext lives only in process memory.

Never log a token, never put one in an exception message.
"""

from __future__ import annotations

import base64
import hashlib
import os

from nacl.public import PrivateKey, SealedBox


class KeyRefMismatch(Exception):
    """Ciphertext was sealed for a keypair this host doesn't hold."""


class TokenBox:
    def __init__(self, private_key_b64: str | None = None) -> None:
        raw = base64.b64decode(private_key_b64 or os.environ["TOKEN_SEAL_PRIVATE_KEY"])
        private_key = PrivateKey(raw)
        # Same derivation as keyRefOf() in token-seal.ts.
        self.key_ref = hashlib.sha256(bytes(private_key.public_key)).hexdigest()[:12]
        self._box = SealedBox(private_key)

    def unseal(self, ciphertext_b64: str, key_ref: str) -> str:
        if key_ref != self.key_ref:
            # Rotation story: a future multi-key TokenBox keeps one SealedBox
            # per ref; today one active keypair per environment is enough.
            raise KeyRefMismatch(f"sealed with key {key_ref}, this host holds {self.key_ref}")
        return self._box.decrypt(base64.b64decode(ciphertext_b64)).decode()

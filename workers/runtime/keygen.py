"""Generate a token-sealing keypair. Run once per environment:

    uv run python keygen.py

The PUBLIC key goes to the control plane (TOKEN_SEAL_PUBLIC_KEY).
The PRIVATE key goes to data-plane hosts ONLY (TOKEN_SEAL_PRIVATE_KEY) —
it must never appear in control-plane config, CI, or the repo.
"""

from __future__ import annotations

import argparse
import base64
import hashlib

from nacl.public import PrivateKey


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a token-sealing keypair")
    parser.add_argument(
        "--export",
        action="store_true",
        help="print shell export lines (for scripts/tests) instead of instructions",
    )
    args = parser.parse_args()

    private_key = PrivateKey.generate()
    public_b64 = base64.b64encode(bytes(private_key.public_key)).decode()
    private_b64 = base64.b64encode(bytes(private_key)).decode()
    key_ref = hashlib.sha256(bytes(private_key.public_key)).hexdigest()[:12]

    if args.export:
        print(f"export TOKEN_SEAL_PUBLIC_KEY={public_b64}")
        print(f"export TOKEN_SEAL_PRIVATE_KEY={private_b64}")
        print(f"export TOKEN_SEAL_KEY_REF={key_ref}")
        return

    print(f"key ref: {key_ref}\n")
    print("Control plane env (apps/web — safe to give to Vercel etc.):")
    print(f"  TOKEN_SEAL_PUBLIC_KEY={public_b64}\n")
    print("Data plane env (supervisor hosts ONLY — never the control plane):")
    print(f"  TOKEN_SEAL_PRIVATE_KEY={private_b64}")


if __name__ == "__main__":
    main()

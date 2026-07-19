#!/usr/bin/env sh
# Cross-plane contract check for token sealing (specs/05-security.md):
# the control plane (TypeScript) seals with the public key, the data plane
# (Python) unseals with the private key. Uses an ephemeral keypair.
set -eu
cd "$(dirname "$0")/.."

eval "$(cd workers/runtime && uv run python keygen.py --export)"
export TOKEN_SEAL_PUBLIC_KEY TOKEN_SEAL_PRIVATE_KEY
export TOKEN_FINGERPRINT_PEPPER="crosscheck-pepper"
export CROSSCHECK_TOKEN="hr-crosscheck-$(date +%s)-secret-77f3"

SEALED_JSON=$(cd apps/web && NODE_OPTIONS="--conditions=react-server" pnpm exec tsx test/seal-cli.ts)
export SEALED_JSON

cd workers/runtime && uv run python - <<'PY'
import json, os
from tokenbox import TokenBox

sealed = json.loads(os.environ["SEALED_JSON"])
expected = os.environ["CROSSCHECK_TOKEN"]
box = TokenBox()
assert sealed["keyRef"] == box.key_ref, "key ref derivation differs between planes"
assert box.unseal(sealed["ciphertext"], sealed["keyRef"]) == expected, "round trip failed"
assert sealed["last4"] == expected[-4:]
print(f"cross-plane token seal/unseal OK (key ref {box.key_ref})")
PY

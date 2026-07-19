import base64

import pytest
from nacl.public import PrivateKey, SealedBox

from tokenbox import KeyRefMismatch, TokenBox

TOKEN = "hr-token-abcdef1234567890-secret-a9f2"


@pytest.fixture
def private_key() -> PrivateKey:
    return PrivateKey.generate()


def seal(private_key: PrivateKey, token: str) -> str:
    return base64.b64encode(SealedBox(private_key.public_key).encrypt(token.encode())).decode()


def test_unseal_round_trip(private_key: PrivateKey) -> None:
    box = TokenBox(base64.b64encode(bytes(private_key)).decode())
    assert box.unseal(seal(private_key, TOKEN), box.key_ref) == TOKEN


def test_reads_key_from_env(private_key: PrivateKey, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TOKEN_SEAL_PRIVATE_KEY", base64.b64encode(bytes(private_key)).decode())
    box = TokenBox()
    assert box.unseal(seal(private_key, TOKEN), box.key_ref) == TOKEN


def test_key_ref_mismatch_refuses_and_leaks_nothing(private_key: PrivateKey) -> None:
    box = TokenBox(base64.b64encode(bytes(private_key)).decode())
    with pytest.raises(KeyRefMismatch) as excinfo:
        box.unseal(seal(private_key, TOKEN), "000000000000")
    assert TOKEN not in str(excinfo.value)


def test_wrong_key_cannot_unseal(private_key: PrivateKey) -> None:
    other = TokenBox(base64.b64encode(bytes(PrivateKey.generate())).decode())
    ciphertext = seal(private_key, TOKEN)
    with pytest.raises(Exception) as excinfo:
        other.unseal(ciphertext, other.key_ref)
    assert TOKEN not in str(excinfo.value)

from __future__ import annotations

import base64
import os
import uuid
from urllib.parse import urlsplit

import pytest
import pytest_asyncio
from nacl.public import PrivateKey, SealedBox

import db as db_module
from tokenbox import TokenBox

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://botmarket:botmarket@localhost:5432/botmarket_test")


def _require_test_database(url: str) -> None:
    """Supervisor.reconcile()/claim_instances() (db.py) claims *any* unclaimed
    running instance in the whole bot_instances table, not just rows a test
    created — so pointing this suite at a shared/dev database lets a test
    supervisor (throwaway token_box keypair) seize a real bot instance,
    fail to unseal its token, and mark it degraded (docs/decisions.md,
    2026-07-22). Failing fast here beats a confusing "token looks invalid"
    on somebody's real instance.
    """
    db_name = urlsplit(url).path.lstrip("/")
    if not db_name.endswith("_test"):
        raise RuntimeError(
            f"DATABASE_URL points at {db_name!r}, which doesn't look like a dedicated test "
            "database (expected a name ending in '_test'). Refusing to run — these tests "
            "claim and mutate rows table-wide and can stomp real bot instances. Point "
            "DATABASE_URL at a database created just for tests, e.g. "
            "postgres://botmarket:botmarket@localhost:5432/botmarket_test."
        )


_require_test_database(DATABASE_URL)


@pytest_asyncio.fixture
async def pool():
    p = await db_module.create_pool(DATABASE_URL)
    async with p.acquire() as conn:
        # Idempotent — tests don't depend on the control plane's seed having run.
        await conn.execute(
            "INSERT INTO catalog_bots (slug, name, schema_version) VALUES ('emcee', 'Emcee', 1) "
            "ON CONFLICT (slug) DO NOTHING"
        )
    yield p
    await p.close()


@pytest_asyncio.fixture
async def pool2():
    """A second, independent pool — simulates a second supervisor process
    for concurrency tests."""
    p = await db_module.create_pool(DATABASE_URL)
    yield p
    await p.close()


@pytest_asyncio.fixture
async def listen_conn():
    """Dedicated LISTEN/NOTIFY connection (docs/cost-plan.md, R6) — separate
    from `pool` since a pool connection can't hold a LISTEN registration
    across acquire/release cycles (db.connect_for_listen's docstring)."""
    conn = await db_module.connect_for_listen(DATABASE_URL)
    yield conn
    await conn.close()


@pytest.fixture
def keypair() -> PrivateKey:
    return PrivateKey.generate()


@pytest.fixture
def token_box(keypair: PrivateKey) -> TokenBox:
    return TokenBox(base64.b64encode(bytes(keypair)).decode())


def seal_token(public_key, token: str) -> str:
    return base64.b64encode(SealedBox(public_key).encrypt(token.encode())).decode()


@pytest_asyncio.fixture
async def test_user(pool):
    user_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (id, email) VALUES ($1, $2)",
            user_id,
            f"supervisor-test-{user_id}@example.invalid",
        )
    yield user_id
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)  # cascades to bot_instances


@pytest_asyncio.fixture
async def make_instance(pool, test_user, keypair, token_box):
    created_ids: list[str] = []

    async def _make(
        *,
        desired_state: str = "running",
        room_id: str | None = None,
        token: str = "hr-test-token-abc123",
        config: dict | None = None,
        supervisor_id: str | None = None,
        lease_expires_at=None,
    ) -> str:
        instance_id = str(uuid.uuid4())
        room_id = room_id or f"room-{instance_id[:8]}"
        ciphertext = seal_token(keypair.public_key, token)
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO bot_instances
                    (id, user_id, catalog_bot_slug, room_id, token_ciphertext, token_key_ref,
                     config, schema_version, desired_state, supervisor_id, lease_expires_at)
                VALUES ($1, $2, 'emcee', $3, $4, $5, $6, 1, $7, $8, $9)
                """,
                instance_id,
                test_user,
                room_id,
                ciphertext,
                token_box.key_ref,
                config or {},
                desired_state,
                supervisor_id,
                lease_expires_at,
            )
        created_ids.append(instance_id)
        return instance_id

    yield _make

    async with pool.acquire() as conn:
        for iid in created_ids:
            await conn.execute("DELETE FROM bot_instances WHERE id = $1", iid)


async def fetch_instance(pool, instance_id: str):
    async with pool.acquire() as conn:
        return await conn.fetchrow("SELECT * FROM bot_instances WHERE id = $1", instance_id)


async def fetch_events(pool, instance_id: str):
    async with pool.acquire() as conn:
        return await conn.fetch(
            "SELECT kind, data FROM instance_events WHERE bot_instance_id = $1 ORDER BY created_at", instance_id
        )

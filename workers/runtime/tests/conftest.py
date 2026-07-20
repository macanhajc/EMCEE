from __future__ import annotations

import base64
import os
import uuid

import pytest
import pytest_asyncio
import redis.asyncio as redis
from nacl.public import PrivateKey, SealedBox

import db as db_module
from tokenbox import TokenBox

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://botmarket:botmarket@localhost:5432/botmarket")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")


@pytest_asyncio.fixture
async def pool():
    p = await db_module.create_pool(DATABASE_URL)
    async with p.acquire() as conn:
        # Idempotent — tests don't depend on the control plane's seed having run.
        await conn.execute(
            "INSERT INTO catalog_bots (slug, name, schema_version) VALUES ('emote', 'Emcee', 1) "
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
async def redis_client():
    c = redis.from_url(REDIS_URL, decode_responses=True)
    yield c
    await c.aclose()


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
                VALUES ($1, $2, 'emote', $3, $4, $5, $6, 1, $7, $8, $9)
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

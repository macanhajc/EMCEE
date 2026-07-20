from __future__ import annotations

import asyncio

import pytest
from highrise import Error, User
from highrise.models import Position

from catalog.emote import EmoteBot
from fake_highrise_client import FakeHighrise


def make_bot(config: dict | None = None, owner_id: str = "owner-1") -> EmoteBot:
    bot = EmoteBot(config)
    bot.highrise = FakeHighrise()
    bot._room_owner_id = owner_id
    return bot


def user(uid: str, name: str = "someuser") -> User:
    return User(id=uid, username=name)


# --- emote on say -----------------------------------------------------------


async def test_known_emote_word_triggers_send_targeted_at_speaker():
    bot = make_bot()
    await bot.on_chat(user("u1"), "macarena")
    assert bot.highrise.sent_emotes == [("dance-macarena", "u1")]


async def test_unknown_word_is_ignored_silently():
    bot = make_bot()
    await bot.on_chat(user("u1"), "this means nothing")
    assert bot.highrise.sent_emotes == []


async def test_emote_on_say_disabled_in_config():
    bot = make_bot({"emote_on_say": {"enabled": False}})
    await bot.on_chat(user("u1"), "macarena")
    assert bot.highrise.sent_emotes == []


async def test_per_user_cooldown_blocks_repeat_trigger():
    bot = make_bot({"emote_on_say": {"cooldown_s": 60}})
    await bot.on_chat(user("u1"), "macarena")
    await bot.on_chat(user("u1"), "hello")
    assert bot.highrise.sent_emotes == [("dance-macarena", "u1")]


async def test_cooldown_is_per_user_not_global():
    bot = make_bot({"emote_on_say": {"cooldown_s": 60}})
    await bot.on_chat(user("u1"), "macarena")
    await bot.on_chat(user("u2"), "macarena")
    assert bot.highrise.sent_emotes == [("dance-macarena", "u1"), ("dance-macarena", "u2")]


async def test_disabled_emotes_list_blocks_by_name_or_id():
    bot = make_bot({"emote_on_say": {"disabled_emotes": ["Macarena"]}})
    await bot.on_chat(user("u1"), "macarena")
    assert bot.highrise.sent_emotes == []
    # a different emote still works
    await bot.on_chat(user("u1"), "hello")
    assert bot.highrise.sent_emotes == [("emote-hello", "u1")]


async def test_alias_and_accent_variants_all_resolve():
    bot = make_bot()
    await bot.on_chat(user("u1"), "OLÁ")
    assert bot.highrise.sent_emotes == [("emote-hello", "u1")]


# --- emote list command -------------------------------------------------


async def test_list_command_whispers_never_public_chat():
    bot = make_bot()
    await bot.on_chat(user("u1"), "emotes")
    assert bot.highrise.sent_emotes == []
    assert len(bot.highrise.whispers) == 1
    assert bot.highrise.whispers[0][0] == "u1"
    assert "Macarena" in bot.highrise.whispers[0][1]


async def test_list_command_bang_alias():
    bot = make_bot()
    await bot.on_chat(user("u1"), "!emotes")
    assert len(bot.highrise.whispers) == 1


async def test_list_command_disabled_in_config():
    bot = make_bot({"list_command": {"enabled": False}})
    await bot.on_chat(user("u1"), "emotes")
    assert bot.highrise.whispers == []


# --- emote all: permissions ----------------------------------------------


async def test_owner_can_trigger_all_by_default():
    bot = make_bot(owner_id="owner-1")
    await bot.on_chat(user("owner-1"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._all_task is not None  # wave started (empty room snapshot — nobody to send to)


async def test_non_owner_blocked_under_default_owner_permission():
    bot = make_bot(owner_id="owner-1")
    await bot.on_chat(user("random-user"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._all_task is None


async def test_owner_designers_permission_allows_designer():
    bot = make_bot({"emote_all": {"permission": "owner_designers"}}, owner_id="owner-1")
    bot.highrise.designers.add("designer-1")
    await bot.on_chat(user("designer-1"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._all_task is not None


async def test_owner_designers_permission_blocks_non_designer():
    bot = make_bot({"emote_all": {"permission": "owner_designers"}}, owner_id="owner-1")
    await bot.on_chat(user("random-user"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._all_task is None


async def test_allowlist_permission_checks_username_case_insensitively():
    bot = make_bot(
        {"emote_all": {"permission": "allowlist", "allowlist": ["TrustedUser"]}}, owner_id="owner-1"
    )
    await bot.on_chat(user("u1", "trusteduser"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._all_task is not None


async def test_allowlist_permission_blocks_unlisted_user():
    bot = make_bot(
        {"emote_all": {"permission": "allowlist", "allowlist": ["TrustedUser"]}}, owner_id="owner-1"
    )
    await bot.on_chat(user("u1", "randomuser"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._all_task is None


async def test_emote_all_disabled_in_config():
    bot = make_bot({"emote_all": {"enabled": False}}, owner_id="owner-1")
    await bot.on_chat(user("owner-1"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._all_task is None


# --- emote all: fan-out, cooldown, snapshot semantics ---------------------


async def test_emote_all_fans_out_to_every_room_user_snapshot():
    bot = make_bot(owner_id="owner-1")
    bot.highrise.room_users = [
        (user("u1", "alice"), Position(x=0, y=0, z=0)),
        (user("u2", "bob"), Position(x=1, y=0, z=0)),
        (user("owner-1", "roomowner"), Position(x=2, y=0, z=0)),
    ]
    await bot.on_chat(user("owner-1"), "all macarena")
    await bot._all_task
    assert bot.highrise.sent_emotes == [
        ("dance-macarena", "u1"),
        ("dance-macarena", "u2"),
        ("dance-macarena", "owner-1"),
    ]


async def test_emote_all_room_cooldown_blocks_repeat_trigger():
    bot = make_bot({"emote_all": {"cooldown_s": 120}}, owner_id="owner-1")
    bot.highrise.room_users = [(user("u1"), Position(x=0, y=0, z=0))]
    await bot.on_chat(user("owner-1"), "all macarena")
    await bot._all_task
    first_wave = list(bot.highrise.sent_emotes)

    await bot.on_chat(user("owner-1"), "all hello")
    await asyncio.sleep(0.05)
    assert bot.highrise.sent_emotes == first_wave  # second wave never started


async def test_get_room_users_error_is_handled_without_raising():
    bot = make_bot(owner_id="owner-1")
    bot.highrise.get_room_users_error = Error(message="boom")
    await bot.on_chat(user("owner-1"), "all macarena")
    await bot._all_task  # must not raise
    assert bot.highrise.sent_emotes == []


async def test_unknown_emote_name_in_all_does_not_start_a_wave():
    bot = make_bot(owner_id="owner-1")
    await bot.on_chat(user("owner-1"), "all nonsense")
    await asyncio.sleep(0.05)
    assert bot._all_task is None


# --- stopall abort ---------------------------------------------------------


async def test_stopall_cancels_an_in_flight_wave():
    bot = make_bot(owner_id="owner-1")
    bot.highrise.room_users = [(user(f"u{i}"), Position(x=0, y=0, z=0)) for i in range(50)]

    # Slow down sends so the wave is still in flight when stopall arrives.
    original_acquire = bot.throttle.acquire

    async def slow_acquire(priority):
        await original_acquire(priority)
        await asyncio.sleep(0.02)

    bot.throttle.acquire = slow_acquire

    await bot.on_chat(user("owner-1"), "all macarena")
    await asyncio.sleep(0.05)
    sent_before_abort = len(bot.highrise.sent_emotes)
    assert 0 < sent_before_abort < 50  # genuinely mid-wave, not finished or not started

    await bot.on_chat(user("owner-1"), "stopall")
    await asyncio.sleep(0.1)

    assert len(bot.highrise.sent_emotes) < 50  # wave did not run to completion
    assert bot._all_task.cancelled()


async def test_stopall_requires_same_permission_as_trigger():
    bot = make_bot(owner_id="owner-1")
    bot.highrise.room_users = [(user(f"u{i}"), Position(x=0, y=0, z=0)) for i in range(50)]
    original_acquire = bot.throttle.acquire

    async def slow_acquire(priority):
        await original_acquire(priority)
        await asyncio.sleep(0.02)

    bot.throttle.acquire = slow_acquire

    await bot.on_chat(user("owner-1"), "all macarena")
    await asyncio.sleep(0.05)

    await bot.on_chat(user("random-user"), "stopall")  # not permitted to abort
    await asyncio.sleep(0.02)
    assert not bot._all_task.done()

    bot._all_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await bot._all_task


async def test_stopall_with_no_active_wave_is_a_noop():
    bot = make_bot(owner_id="owner-1")
    await bot.on_chat(user("owner-1"), "stopall")  # must not raise
    assert bot._all_task is None

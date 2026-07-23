from __future__ import annotations

import asyncio

import pytest
from highrise import Error, User
from highrise.models import Position

from catalog.emcee import EmceeBot
from fake_highrise_client import FakeHighrise


def make_bot(config: dict | None = None, owner_id: str = "owner-1") -> EmceeBot:
    bot = EmceeBot(config)
    bot.highrise = FakeHighrise()
    bot._room_owner_id = owner_id
    return bot


def user(uid: str, name: str = "someuser") -> User:
    return User(id=uid, username=name)


# --- emote on say -----------------------------------------------------------


async def test_known_emote_word_starts_a_loop_by_default():
    # Loop defaults to enabled since 2026-07-23 — a bare word now loops
    # rather than firing once (specs/bots/emote.md, "Loop / stop").
    bot = make_bot()
    await bot.on_chat(user("u1"), "macarena")
    await asyncio.sleep(0.02)
    assert "u1" in bot._emote._loops
    assert bot.highrise.sent_emotes  # at least the first repeat fired
    assert all(call == ("dance-macarena", "u1") for call in bot.highrise.sent_emotes)

    bot._emote._loops["u1"].cancel()
    with pytest.raises(asyncio.CancelledError):
        await bot._emote._loops["u1"]


async def test_known_emote_word_whispers_loop_start_by_default():
    bot = make_bot()
    await bot.on_chat(user("u1"), "macarena")
    assert bot.highrise.whispers and "Looping Macarena" in bot.highrise.whispers[0][1]

    bot._emote._loops["u1"].cancel()
    with pytest.raises(asyncio.CancelledError):
        await bot._emote._loops["u1"]


async def test_known_emote_word_is_one_shot_when_loop_disabled():
    # Turning `loop` off restores the pre-2026-07-23 one-shot behavior.
    bot = make_bot({"loop": {"enabled": False}})
    await bot.on_chat(user("u1"), "macarena")
    assert bot.highrise.sent_emotes == [("dance-macarena", "u1")]
    assert bot._emote._loops == {}


async def test_known_emote_word_whispers_what_will_happen_when_loop_disabled():
    bot = make_bot({"loop": {"enabled": False}})
    await bot.on_chat(user("u1"), "macarena")
    assert bot.highrise.whispers == [("u1", 'Doing "Macarena"!')]


async def test_unknown_word_is_ignored_silently():
    bot = make_bot()
    await bot.on_chat(user("u1"), "this means nothing")
    assert bot.highrise.sent_emotes == []
    assert bot._emote._loops == {}


async def test_emote_on_say_disabled_in_config():
    bot = make_bot({"emote_on_say": {"enabled": False}})
    await bot.on_chat(user("u1"), "macarena")
    assert bot.highrise.sent_emotes == []
    assert bot._emote._loops == {}


async def test_per_user_cooldown_blocks_repeat_trigger():
    # loop disabled so this exercises emote_on_say's own cooldown in
    # isolation, not loop's separate cooldown/switch-instead-of-block path.
    bot = make_bot({"emote_on_say": {"cooldown_s": 60}, "loop": {"enabled": False}})
    await bot.on_chat(user("u1"), "macarena")
    await bot.on_chat(user("u1"), "hello")
    assert bot.highrise.sent_emotes == [("dance-macarena", "u1")]


async def test_cooldown_is_per_user_not_global():
    bot = make_bot({"emote_on_say": {"cooldown_s": 60}, "loop": {"enabled": False}})
    await bot.on_chat(user("u1"), "macarena")
    await bot.on_chat(user("u2"), "macarena")
    assert bot.highrise.sent_emotes == [("dance-macarena", "u1"), ("dance-macarena", "u2")]


async def test_disabled_emotes_list_blocks_by_name_or_id():
    bot = make_bot({"emote_on_say": {"disabled_emotes": ["Macarena"]}, "loop": {"enabled": False}})
    await bot.on_chat(user("u1"), "macarena")
    assert bot.highrise.sent_emotes == []
    # a different emote still works
    await bot.on_chat(user("u1"), "hello")
    assert bot.highrise.sent_emotes == [("emote-hello", "u1")]


async def test_alias_and_accent_variants_all_resolve():
    bot = make_bot({"loop": {"enabled": False}})
    await bot.on_chat(user("u1"), "OLÁ")
    assert bot.highrise.sent_emotes == [("emote-hello", "u1")]


# --- numbered emote trigger ---------------------------------------------


async def test_number_triggers_the_emote_at_that_catalog_position():
    bot = make_bot({"loop": {"enabled": False}})
    first = bot._emote._catalog.all()[0]
    await bot.on_chat(user("u1"), "1")
    assert bot.highrise.sent_emotes == [(first.id, "u1")]


async def test_number_out_of_range_is_ignored_silently():
    bot = make_bot({"loop": {"enabled": False}})
    await bot.on_chat(user("u1"), "99999")
    assert bot.highrise.sent_emotes == []


async def test_number_works_with_loop_prefix():
    bot = make_bot({"loop": {"enabled": True, "cooldown_s": 0}})
    first = bot._emote._catalog.all()[0]
    await bot.on_chat(user("u1"), "loop 1")
    await asyncio.sleep(0.01)
    assert "u1" in bot._emote._loops
    assert bot.highrise.sent_emotes and bot.highrise.sent_emotes[0] == (first.id, "u1")

    bot._emote._loops["u1"].cancel()
    with pytest.raises(asyncio.CancelledError):
        await bot._emote._loops["u1"]


async def test_number_works_with_all_prefix():
    bot = make_bot(owner_id="owner-1")
    bot.highrise.room_users = [(user("u1"), Position(x=0, y=0, z=0))]
    first = bot._emote._catalog.all()[0]
    await bot.on_chat(user("owner-1"), "all 1")
    await bot._emote._all_task
    assert bot.highrise.sent_emotes == [(first.id, "u1")]


# --- emote list command -------------------------------------------------


async def test_list_command_whispers_never_public_chat():
    bot = make_bot()
    await bot.on_chat(user("u1"), "emotes")
    assert bot.highrise.sent_emotes == []
    # 65 catalog entries no longer fit MAX_WHISPER_CHARS in one message —
    # _chunk_text splits it, but every chunk must still be a whisper to the
    # asker, never public chat.
    assert len(bot.highrise.whispers) > 1
    assert all(recipient == "u1" for recipient, _ in bot.highrise.whispers)
    full_text = " ".join(text for _, text in bot.highrise.whispers)
    assert "Macarena" in full_text
    # Numbered (added 2026-07-23) so the position doubles as a trigger.
    first = bot._emote._catalog.all()[0]
    assert f"1. {first.name}" in full_text


async def test_list_command_bang_alias():
    bot = make_bot()
    await bot.on_chat(user("u1"), "!emotes")
    assert len(bot.highrise.whispers) > 0


async def test_list_command_disabled_in_config():
    bot = make_bot({"list_command": {"enabled": False}})
    await bot.on_chat(user("u1"), "emotes")
    assert bot.highrise.whispers == []


# --- emote all: permissions ----------------------------------------------


async def test_owner_can_trigger_all_by_default():
    bot = make_bot(owner_id="owner-1")
    await bot.on_chat(user("owner-1"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._emote._all_task is not None  # wave started (empty room snapshot — nobody to send to)


async def test_non_owner_blocked_under_default_owner_permission():
    bot = make_bot(owner_id="owner-1")
    await bot.on_chat(user("random-user"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._emote._all_task is None


async def test_owner_designers_permission_allows_designer():
    bot = make_bot({"emote_all": {"permission": "owner_designers"}}, owner_id="owner-1")
    bot.highrise.designers.add("designer-1")
    await bot.on_chat(user("designer-1"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._emote._all_task is not None


async def test_owner_designers_permission_blocks_non_designer():
    bot = make_bot({"emote_all": {"permission": "owner_designers"}}, owner_id="owner-1")
    await bot.on_chat(user("random-user"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._emote._all_task is None


async def test_allowlist_permission_checks_username_case_insensitively():
    bot = make_bot(
        {"emote_all": {"permission": "allowlist", "allowlist": ["TrustedUser"]}}, owner_id="owner-1"
    )
    await bot.on_chat(user("u1", "trusteduser"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._emote._all_task is not None


async def test_allowlist_permission_blocks_unlisted_user():
    bot = make_bot(
        {"emote_all": {"permission": "allowlist", "allowlist": ["TrustedUser"]}}, owner_id="owner-1"
    )
    await bot.on_chat(user("u1", "randomuser"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._emote._all_task is None


async def test_emote_all_disabled_in_config():
    bot = make_bot({"emote_all": {"enabled": False}}, owner_id="owner-1")
    await bot.on_chat(user("owner-1"), "all macarena")
    await asyncio.sleep(0.05)
    assert bot._emote._all_task is None


# --- emote all: fan-out, cooldown, snapshot semantics ---------------------


async def test_emote_all_fans_out_to_every_room_user_snapshot():
    bot = make_bot(owner_id="owner-1")
    bot.highrise.room_users = [
        (user("u1", "alice"), Position(x=0, y=0, z=0)),
        (user("u2", "bob"), Position(x=1, y=0, z=0)),
        (user("owner-1", "roomowner"), Position(x=2, y=0, z=0)),
    ]
    await bot.on_chat(user("owner-1"), "all macarena")
    await bot._emote._all_task
    assert bot.highrise.sent_emotes == [
        ("dance-macarena", "u1"),
        ("dance-macarena", "u2"),
        ("dance-macarena", "owner-1"),
    ]


async def test_emote_all_room_cooldown_blocks_repeat_trigger():
    bot = make_bot({"emote_all": {"cooldown_s": 120}}, owner_id="owner-1")
    bot.highrise.room_users = [(user("u1"), Position(x=0, y=0, z=0))]
    await bot.on_chat(user("owner-1"), "all macarena")
    await bot._emote._all_task
    first_wave = list(bot.highrise.sent_emotes)

    await bot.on_chat(user("owner-1"), "all hello")
    await asyncio.sleep(0.05)
    assert bot.highrise.sent_emotes == first_wave  # second wave never started


async def test_get_room_users_error_is_handled_without_raising():
    bot = make_bot(owner_id="owner-1")
    bot.highrise.get_room_users_error = Error(message="boom")
    await bot.on_chat(user("owner-1"), "all macarena")
    await bot._emote._all_task  # must not raise
    assert bot.highrise.sent_emotes == []


async def test_unknown_emote_name_in_all_does_not_start_a_wave():
    bot = make_bot(owner_id="owner-1")
    await bot.on_chat(user("owner-1"), "all nonsense")
    await asyncio.sleep(0.05)
    assert bot._emote._all_task is None


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
    assert bot._emote._all_task.cancelled()


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
    assert not bot._emote._all_task.done()

    bot._emote._all_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await bot._emote._all_task


async def test_stopall_with_no_active_wave_is_a_noop():
    bot = make_bot(owner_id="owner-1")
    await bot.on_chat(user("owner-1"), "stopall")  # must not raise
    assert bot._emote._all_task is None


# --- loop / stop -----------------------------------------------------------


async def test_loop_is_enabled_by_default():
    bot = make_bot()  # no explicit loop config — schema default is now enabled: true
    await bot.on_chat(user("u1"), "loop macarena")
    await asyncio.sleep(0.05)
    assert "u1" in bot._emote._loops
    assert bot.highrise.sent_emotes  # at least one repeat fired

    bot._emote._loops["u1"].cancel()
    with pytest.raises(asyncio.CancelledError):
        await bot._emote._loops["u1"]


async def test_loop_disabled_in_config_blocks_the_explicit_command_too():
    bot = make_bot({"loop": {"enabled": False}})
    await bot.on_chat(user("u1"), "loop macarena")
    await asyncio.sleep(0.05)
    assert bot._emote._loops == {}
    assert bot.highrise.sent_emotes == []


async def test_loop_starts_and_repeats_to_the_speaker():
    bot = make_bot({"loop": {"enabled": True, "interval_s": 5, "cooldown_s": 0}})
    # interval_s below the schema's stated minimum (5) is fine here — the
    # schema bounds what the *control plane* accepts on save, the bot just
    # reads whatever's in self.config at runtime.
    bot.config["loop"]["interval_s"] = 0.02

    await bot.on_chat(user("u1"), "loop macarena")
    await asyncio.sleep(0.09)  # a few repeats' worth
    task = bot._emote._loops["u1"]
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert len(bot.highrise.sent_emotes) >= 2
    assert all(call == ("dance-macarena", "u1") for call in bot.highrise.sent_emotes)


async def test_loop_start_whispers_what_will_happen():
    bot = make_bot({"loop": {"enabled": True, "interval_s": 5, "max_duration_s": 300, "cooldown_s": 0}})

    await bot.on_chat(user("u1"), "loop macarena")
    await asyncio.sleep(0.01)

    assert bot.highrise.whispers
    recipient, text = bot.highrise.whispers[0]
    assert recipient == "u1"
    assert "Macarena" in text
    assert "5s" in text
    assert "stop" in text
    assert "5 min" in text  # 300s max_duration_s

    bot._emote._loops["u1"].cancel()
    with pytest.raises(asyncio.CancelledError):
        await bot._emote._loops["u1"]


async def test_unknown_emote_does_not_start_a_loop():
    bot = make_bot({"loop": {"enabled": True}})
    await bot.on_chat(user("u1"), "loop nonsense")
    await asyncio.sleep(0.02)
    assert bot._emote._loops == {}


async def test_stop_cancels_the_speakers_own_loop():
    bot = make_bot({"loop": {"enabled": True, "cooldown_s": 0}})
    bot.config["loop"]["interval_s"] = 0.02

    await bot.on_chat(user("u1"), "loop macarena")
    await asyncio.sleep(0.03)
    task = bot._emote._loops["u1"]

    await bot.on_chat(user("u1"), "stop")
    await asyncio.sleep(0.01)

    assert task.cancelled()
    sent_at_stop = len(bot.highrise.sent_emotes)
    await asyncio.sleep(0.05)
    assert len(bot.highrise.sent_emotes) == sent_at_stop  # nothing more after stop


async def test_stop_with_no_active_loop_is_a_noop():
    bot = make_bot({"loop": {"enabled": True}})
    await bot.on_chat(user("u1"), "stop")  # must not raise
    assert bot._emote._loops == {}


async def test_stop_only_affects_the_caller_not_other_loopers():
    bot = make_bot({"loop": {"enabled": True, "cooldown_s": 0}})
    bot.config["loop"]["interval_s"] = 0.02
    await bot.on_chat(user("u1"), "loop macarena")
    await bot.on_chat(user("u2"), "loop hello")
    await asyncio.sleep(0.01)
    u1_task = bot._emote._loops["u1"]

    await bot.on_chat(user("u1"), "stop")
    await asyncio.sleep(0.01)

    assert u1_task.cancelled()
    assert "u1" not in bot._emote._loops  # cleaned itself up after cancellation
    assert not bot._emote._loops["u2"].done()
    bot._emote._loops["u2"].cancel()
    with pytest.raises(asyncio.CancelledError):
        await bot._emote._loops["u2"]


async def test_loop_start_cooldown_blocks_rapid_restart():
    bot = make_bot({"loop": {"enabled": True, "cooldown_s": 60}})
    await bot.on_chat(user("u1"), "loop macarena")
    first_task = bot._emote._loops.get("u1")
    assert first_task is not None

    await bot.on_chat(user("u1"), "loop hello")  # within cooldown — ignored
    await asyncio.sleep(0.01)
    assert bot._emote._loops["u1"] is first_task  # unchanged, still looping the first emote

    first_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first_task


async def test_switching_loop_emote_cancels_old_and_starts_new():
    bot = make_bot({"loop": {"enabled": True, "cooldown_s": 0}})
    bot.config["loop"]["interval_s"] = 0.02

    await bot.on_chat(user("u1"), "loop macarena")
    old_task = bot._emote._loops["u1"]
    await asyncio.sleep(0.01)

    await bot.on_chat(user("u1"), "loop hello")
    await asyncio.sleep(0.05)
    new_task = bot._emote._loops["u1"]

    assert new_task is not old_task
    assert old_task.cancelled()
    assert not new_task.done()

    new_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await new_task

    # only the two emotes actually in play, nothing left over from switching
    assert set(bot.highrise.sent_emotes) <= {("dance-macarena", "u1"), ("emote-hello", "u1")}


async def test_many_concurrent_loopers_are_all_allowed():
    # max_concurrent_loopers removed 2026-07-23 — Loop is every emote-on-say's
    # default behavior now, so a cap would mean whoever's past it gets
    # nothing at all, not a plain emote (specs/bots/emote.md).
    bot = make_bot({"loop": {"enabled": True, "cooldown_s": 0}})
    for i in range(10):
        await bot.on_chat(user(f"u{i}"), "loop macarena")
    await asyncio.sleep(0.02)

    assert len(bot._emote._loops) == 10
    assert not any("limit" in text.lower() for _, text in bot.highrise.whispers)

    for task in bot._emote._loops.values():
        task.cancel()
    for task in list(bot._emote._loops.values()):
        with pytest.raises(asyncio.CancelledError):
            await task


async def test_loop_auto_stops_after_max_duration_and_whispers_why():
    bot = make_bot({"loop": {"enabled": True, "cooldown_s": 0}})
    bot.config["loop"]["interval_s"] = 0.01
    bot.config["loop"]["max_duration_s"] = 0.03

    await bot.on_chat(user("u1"), "loop macarena")
    task = bot._emote._loops["u1"]
    await asyncio.wait_for(task, timeout=2.0)  # must finish on its own, no external cancel

    assert task.done() and not task.cancelled()
    assert "u1" not in bot._emote._loops  # cleaned up after natural completion
    assert bot.highrise.whispers and "timed out" in bot.highrise.whispers[-1][1]


async def test_on_user_leave_cancels_their_loop():
    bot = make_bot({"loop": {"enabled": True, "cooldown_s": 0}})
    bot.config["loop"]["interval_s"] = 0.02

    await bot.on_chat(user("u1"), "loop macarena")
    task = bot._emote._loops["u1"]
    await asyncio.sleep(0.01)

    await bot.on_user_leave(user("u1"))
    await asyncio.sleep(0.01)

    assert task.cancelled()


async def test_on_user_leave_for_non_looping_user_is_a_noop():
    bot = make_bot({"loop": {"enabled": True}})
    await bot.on_user_leave(user("nobody-looping"))  # must not raise
    assert bot._emote._loops == {}

from __future__ import annotations

import time

from highrise import ResponseError, User
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


def put_in_room(bot: EmceeBot, *users: User) -> None:
    bot.highrise.room_users = [(u, Position(x=0, y=0, z=0)) for u in users]


# --- filter -----------------------------------------------------------


async def test_filter_match_whispers_warning_never_public():
    bot = make_bot({"filter": {"custom_terms": ["badword"]}})
    await bot.on_chat(user("u1"), "you are a badword")
    assert len(bot.highrise.whispers) == 1
    assert bot.highrise.whispers[0][0] == "u1"
    assert bot.highrise.chats == []


async def test_filter_no_match_is_silent():
    bot = make_bot({"filter": {"custom_terms": ["badword"]}})
    await bot.on_chat(user("u1"), "hello there")
    assert bot.highrise.whispers == []


async def test_filter_disabled_skips_check():
    bot = make_bot({"filter": {"enabled": False, "custom_terms": ["badword"]}})
    await bot.on_chat(user("u1"), "badword")
    assert bot.highrise.whispers == []


async def test_filter_match_is_whole_word_not_substring():
    # "ass" must not match inside "class" — word-boundary matching, not bare substring.
    bot = make_bot({"filter": {"custom_terms": ["ass"]}})
    await bot.on_chat(user("u1"), "this is a class")
    assert bot.highrise.whispers == []


async def test_filter_match_survives_repeated_char_squash():
    bot = make_bot({"filter": {"custom_terms": ["spam"]}})
    await bot.on_chat(user("u1"), "spammmmmm")
    assert len(bot.highrise.whispers) == 1


async def test_filter_hit_counts_toward_strikes():
    bot = make_bot({"filter": {"custom_terms": ["badword"]}, "ladder": {"mute_at_strikes": 5}})
    await bot.on_chat(user("u1"), "badword")
    assert bot._warden._strikes_fallback["u1"] == 1


# --- anti-spam ----------------------------------------------------


async def test_message_rate_trip_adds_strike_without_whisper():
    # Distinct messages each time — isolates the rate rule from the
    # duplicate-message rule (see test_duplicate_messages_trip_after_threshold
    # for that one), since sending the same text repeatedly would legitimately
    # trip both independently.
    bot = make_bot({"anti_spam": {"message_rate_count": 3, "message_rate_window_s": 60}})
    for i in range(4):
        await bot.on_chat(user("u1"), f"message {i}")
    assert bot._warden._strikes_fallback["u1"] == 1
    assert bot.highrise.whispers == []  # rate trip itself is silent — the escalation is the signal


async def test_message_rate_under_threshold_no_strike():
    bot = make_bot({"anti_spam": {"message_rate_count": 5, "message_rate_window_s": 60}})
    for i in range(3):
        await bot.on_chat(user("u1"), f"message {i}")
    assert "u1" not in bot._warden._strikes_fallback


async def test_duplicate_messages_trip_after_threshold():
    bot = make_bot({"anti_spam": {"duplicate_count": 3, "message_rate_count": 100}})
    for _ in range(3):
        await bot.on_chat(user("u1"), "same message")
    assert bot._warden._strikes_fallback["u1"] == 1


async def test_anti_spam_disabled_skips_check():
    bot = make_bot({"anti_spam": {"enabled": False, "message_rate_count": 3}})
    for _ in range(5):
        await bot.on_chat(user("u1"), "hi")
    assert "u1" not in bot._warden._strikes_fallback


# --- strike ladder ----------------------------------------------------


async def test_ladder_fires_mute_at_threshold():
    bot = make_bot(
        {
            "filter": {"custom_terms": ["bad"]},
            "ladder": {"mute_at_strikes": 2, "kick_at_strikes": 10, "mute_duration_s": 120},
        }
    )
    await bot.on_chat(user("u1"), "bad")
    assert bot.highrise.moderate_room_calls == []  # 1st strike, below threshold
    await bot.on_chat(user("u1"), "bad")
    assert bot.highrise.moderate_room_calls == [("u1", "mute", 120)]


async def test_ladder_only_fires_highest_rung_reached():
    bot = make_bot(
        {
            "filter": {"custom_terms": ["bad"]},
            "ladder": {
                "mute_at_strikes": 1,
                "kick_at_strikes": 1,
                "ban_enabled": True,
                "ban_at_strikes": 2,
                "ban_duration_s": 0,
            },
        }
    )
    await bot.on_chat(user("u1"), "bad")
    assert bot.highrise.moderate_room_calls == [("u1", "kick", None)]

    await bot.on_chat(user("u1"), "bad")
    # Second strike crosses the ban rung too — only ban fires, not another kick or a mute.
    assert bot.highrise.moderate_room_calls == [("u1", "kick", None), ("u1", "ban", None)]


async def test_ban_disabled_does_not_escalate_past_kick():
    bot = make_bot(
        {
            "filter": {"custom_terms": ["bad"]},
            "ladder": {"mute_at_strikes": 1, "kick_at_strikes": 2, "ban_enabled": False},
        }
    )
    for _ in range(5):
        await bot.on_chat(user("u1"), "bad")
    actions = {call[1] for call in bot.highrise.moderate_room_calls}
    assert "ban" not in actions


async def test_strike_decay_resets_count():
    bot = make_bot({"filter": {"custom_terms": ["bad"]}, "ladder": {"strike_decay_h": 1, "mute_at_strikes": 20}})
    await bot.on_chat(user("u1"), "bad")
    assert bot._warden._strikes_fallback["u1"] == 1

    # Simulate the decay window having elapsed, same technique as
    # test_db.py's decay test (backdating the stored timestamp) but against
    # the in-memory fallback used here (db_pool is None in unit tests).
    bot._warden._last_strike_fallback_at["u1"] = time.monotonic() - 3601

    await bot.on_chat(user("u1"), "bad")
    assert bot._warden._strikes_fallback["u1"] == 1


# --- exemptions ----------------------------------------------------


async def test_owner_exempt_from_filter():
    bot = make_bot({"filter": {"custom_terms": ["badword"]}}, owner_id="owner-1")
    await bot.on_chat(user("owner-1", "owner"), "badword")
    assert bot.highrise.whispers == []


async def test_designer_exempt_from_filter():
    bot = make_bot({"filter": {"custom_terms": ["badword"]}})
    bot.highrise.designers.add("designer-1")
    await bot.on_chat(user("designer-1"), "badword")
    assert bot.highrise.whispers == []


async def test_designers_not_exempt_when_config_disables_it():
    bot = make_bot({"filter": {"custom_terms": ["badword"]}, "exemptions": {"designers_exempt": False}})
    bot.highrise.designers.add("designer-1")
    await bot.on_chat(user("designer-1"), "badword")
    assert len(bot.highrise.whispers) == 1


async def test_explicit_username_exempt_from_filter():
    bot = make_bot({"filter": {"custom_terms": ["badword"]}, "exemptions": {"users": ["VipUser"]}})
    await bot.on_chat(user("u1", "vipuser"), "badword")
    assert bot.highrise.whispers == []


# --- mod commands ----------------------------------------------------


async def test_owner_warn_command_adds_strike():
    bot = make_bot(owner_id="owner-1")
    target = user("u1", "troublemaker")
    put_in_room(bot, target)
    await bot.on_chat(user("owner-1", "owner"), "!warn @troublemaker")
    assert bot._warden._strikes_fallback["u1"] == 1


async def test_owner_mute_command_calls_moderate_room():
    bot = make_bot({"ladder": {"mute_duration_s": 60}}, owner_id="owner-1")
    target = user("u1", "troublemaker")
    put_in_room(bot, target)
    await bot.on_chat(user("owner-1", "owner"), "!mute @troublemaker")
    assert bot.highrise.moderate_room_calls == [("u1", "mute", 60)]


async def test_owner_kick_command_calls_moderate_room():
    bot = make_bot(owner_id="owner-1")
    target = user("u1", "troublemaker")
    put_in_room(bot, target)
    await bot.on_chat(user("owner-1", "owner"), "!kick @troublemaker")
    assert bot.highrise.moderate_room_calls == [("u1", "kick", None)]


async def test_command_unknown_target_whispers_not_found():
    bot = make_bot(owner_id="owner-1")
    put_in_room(bot)  # empty room
    await bot.on_chat(user("owner-1", "owner"), "!kick @ghost")
    assert bot.highrise.moderate_room_calls == []
    assert len(bot.highrise.whispers) == 1


async def test_non_exempt_user_cannot_issue_commands():
    bot = make_bot({"filter": {"custom_terms": []}}, owner_id="owner-1")
    target = user("u2", "troublemaker")
    put_in_room(bot, user("u1"), target)
    # A regular room member typing "!kick @troublemaker" is just chat to
    # them — not a command, since only exempt users reach the command path.
    await bot.on_chat(user("u1"), "!kick @troublemaker")
    assert bot.highrise.moderate_room_calls == []


async def test_ban_command_not_available_in_chat():
    bot = make_bot({"ladder": {"ban_enabled": True, "ban_at_strikes": 2}}, owner_id="owner-1")
    target = user("u1", "troublemaker")
    put_in_room(bot, target)
    await bot.on_chat(user("owner-1", "owner"), "!ban @troublemaker")
    assert bot.highrise.moderate_room_calls == []


async def test_commands_disabled_in_config():
    bot = make_bot({"commands": {"enabled": False}}, owner_id="owner-1")
    target = user("u1", "troublemaker")
    put_in_room(bot, target)
    await bot.on_chat(user("owner-1", "owner"), "!kick @troublemaker")
    assert bot.highrise.moderate_room_calls == []


# --- moderate_room failure handling ----------------------------------------------------


async def test_moderate_room_denied_notifies_requester_and_does_not_crash():
    bot = make_bot(owner_id="owner-1")
    target = user("u1", "troublemaker")
    put_in_room(bot, target)
    bot.highrise.moderate_room_error = ResponseError("insufficient privilege")

    await bot.on_chat(user("owner-1", "owner"), "!kick @troublemaker")

    assert bot.highrise.moderate_room_calls == [("u1", "kick", None)]
    assert any("troublemaker" in text for _, text in bot.highrise.whispers)


async def test_moderate_room_denied_from_auto_escalation_does_not_crash():
    bot = make_bot({"filter": {"custom_terms": ["bad"]}, "ladder": {"mute_at_strikes": 1}})
    bot.highrise.moderate_room_error = ResponseError("insufficient privilege")
    await bot.on_chat(user("u1"), "bad")  # must not raise
    assert bot.highrise.moderate_room_calls == [("u1", "mute", 300)]


# --- on_moderate (external moderation events) ----------------------------------------------------


async def test_on_moderate_from_bot_itself_is_ignored():
    bot = make_bot()
    await bot.on_moderate(bot.highrise.my_id, "u1", "kick", None)  # must not raise


async def test_on_moderate_from_external_moderator_does_not_double_strike():
    bot = make_bot()
    await bot.on_moderate("some-other-moderator", "u1", "kick", None)
    assert "u1" not in bot._warden._strikes_fallback
    assert bot.highrise.moderate_room_calls == []


# --- dashboard-initiated ban/unban (specs/bots/moderation.md's "proposed" section) --------


async def test_apply_dashboard_action_ban_calls_moderate_room():
    bot = make_bot()
    status, error = await bot._warden.apply_dashboard_action("u1", "troublemaker", "ban", 0)
    assert bot.highrise.moderate_room_calls == [("u1", "ban", 0)]
    assert status == "applied"
    assert error is None


async def test_apply_dashboard_action_unban_calls_moderate_room():
    bot = make_bot()
    status, error = await bot._warden.apply_dashboard_action("u1", "troublemaker", "unban", None)
    assert bot.highrise.moderate_room_calls == [("u1", "unban", None)]
    assert status == "applied"


async def test_apply_dashboard_action_denied_does_not_crash_and_reports_error():
    bot = make_bot()
    bot.highrise.moderate_room_error = ResponseError("insufficient privilege")

    status, error = await bot._warden.apply_dashboard_action("u1", "troublemaker", "ban", 0)

    assert status == "denied"
    assert error == "insufficient privilege"


async def test_apply_dashboard_action_never_touches_the_strike_ladder():
    # An owner-initiated ban is a direct action, not a ladder escalation — it
    # must not bump warden_strikes as a side effect.
    bot = make_bot({"ladder": {"ban_enabled": True, "ban_at_strikes": 1}})
    await bot._warden.apply_dashboard_action("u1", "troublemaker", "ban", 0)
    assert "u1" not in bot._warden._strikes_fallback


# --- bot language (general.bot_language) ------------------------------------


async def test_filter_warning_respects_bot_language():
    bot = make_bot({"filter": {"custom_terms": ["badword"]}, "general": {"bot_language": "de"}})
    await bot.on_chat(user("u1"), "you are a badword")
    assert bot.highrise.whispers == [("u1", "Bitte bleib im Chat freundlich — das ist hier nicht erlaubt.")]


async def test_command_target_not_found_respects_bot_language():
    bot = make_bot(config={"general": {"bot_language": "pt"}}, owner_id="owner-1")
    await bot.on_chat(user("owner-1", "owner"), "!kick @nobody")
    assert bot.highrise.whispers == [("owner-1", "Não encontrei nobody na sala.")]


async def test_action_denied_translates_both_sentence_and_verb():
    bot = make_bot(config={"general": {"bot_language": "es"}}, owner_id="owner-1")
    target = user("u1", "troublemaker")
    put_in_room(bot, target)
    bot.highrise.moderate_room_error = ResponseError("insufficient privilege")

    await bot.on_chat(user("owner-1", "owner"), "!kick @troublemaker")

    assert bot.highrise.whispers == [("owner-1", "No pude expulsar a troublemaker aquí — ¿falta algún permiso?")]

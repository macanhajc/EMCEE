from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from highrise import SessionMetadata, User
from highrise.models import Position, RoomInfo

from catalog.emcee import EmceeBot
from fake_highrise_client import FakeHighrise


def make_bot(config: dict | None = None, room_name: str = "Test Room") -> EmceeBot:
    bot = EmceeBot(config)
    bot.highrise = FakeHighrise()
    bot._room_owner_id = "owner-1"
    bot._room_name = room_name
    return bot


def user(uid: str, name: str = "someuser") -> User:
    return User(id=uid, username=name)


def position() -> Position:
    return Position(x=0, y=0, z=0)


# --- on_start wiring ---------------------------------------------------


async def test_on_start_captures_owner_and_room_name():
    bot = EmceeBot()
    bot.highrise = FakeHighrise()
    metadata = SessionMetadata(
        user_id="bot-1",
        room_info=RoomInfo(owner_id="owner-42", room_name="Alice's Room"),
        rate_limits={},
        connection_id="conn-1",
    )
    await bot.on_start(metadata)
    assert bot._room_owner_id == "owner-42"
    assert bot._room_name == "Alice's Room"


# --- welcome messages ----------------------------------------------------


async def test_join_whispers_default_template():
    bot = make_bot(room_name="Alice's Room")
    await bot.on_user_join(user("u1", "bob"), position())
    assert bot.highrise.whispers == [("u1", "Welcome to Alice's Room, bob!")]


async def test_welcome_disabled_in_config():
    bot = make_bot({"welcome": {"enabled": False}})
    await bot.on_user_join(user("u1"), position())
    assert bot.highrise.whispers == []


async def test_visit_count_token_no_longer_substituted():
    # {visit_count} was dropped from the whitelisted template tokens
    # (docs/decisions.md, 2026-07-21) — left literal, same as any other
    # unknown token, not rendered as a number.
    bot = make_bot({"welcome": {"templates": ["Visit #{visit_count}"], "cooldown_h": 0}})
    await bot.on_user_join(user("u1"), position())
    assert bot.highrise.whispers == [("u1", "Visit #{visit_count}")]


async def test_visit_tracking_still_increments_without_being_shown():
    # The count itself still exists — it drives farewell's min_visits and
    # the dashboard regulars table — just isn't whispered to the guest.
    bot = make_bot({"welcome": {"cooldown_h": 0}})
    await bot.on_user_join(user("u1"), position())
    await bot.on_user_join(user("u1"), position())
    assert bot._greeter._visits["u1"] == 2


async def test_cooldown_blocks_regreet_within_window():
    bot = make_bot({"welcome": {"cooldown_h": 6}})
    await bot.on_user_join(user("u1"), position())
    await bot.on_user_join(user("u1"), position())
    assert len(bot.highrise.whispers) == 1


async def test_cooldown_is_per_user_not_global():
    bot = make_bot({"welcome": {"cooldown_h": 6}})
    await bot.on_user_join(user("u1"), position())
    await bot.on_user_join(user("u2"), position())
    assert len(bot.highrise.whispers) == 2


async def test_templates_rotate_across_joins():
    bot = make_bot({"welcome": {"templates": ["A {username}", "B {username}"], "cooldown_h": 0}})
    await bot.on_user_join(user("u1", "u1"), position())
    await bot.on_user_join(user("u2", "u2"), position())
    await bot.on_user_join(user("u3", "u3"), position())
    assert [w[1] for w in bot.highrise.whispers] == ["A u1", "B u2", "A u3"]


async def test_busy_mode_skips_greeting_above_threshold():
    bot = make_bot({"welcome": {"cooldown_h": 0}})
    # The schema's stated minimum for this field is 5 — fine to go below it
    # directly on the live config object (same pattern as emote.py's loop
    # tests): the schema bounds what the control plane accepts on save, the
    # bot just reads whatever's in self.config at runtime.
    bot.config["welcome"]["busy_mode_joins_per_min"] = 2
    for i in range(4):
        await bot.on_user_join(user(f"u{i}"), position())
    # First two joins keep the rolling window at/under the threshold and
    # greet; the third pushes it over 2/min, so it and the fourth are skipped.
    assert len(bot.highrise.whispers) == 2


async def test_busy_mode_disabled_never_skips():
    bot = make_bot({"welcome": {"busy_mode_enabled": False, "busy_mode_joins_per_min": 1, "cooldown_h": 0}})
    for i in range(5):
        await bot.on_user_join(user(f"u{i}"), position())
    assert len(bot.highrise.whispers) == 5


async def test_quiet_hours_skip_when_inside_window():
    now = datetime.now(ZoneInfo("UTC"))
    start = (now - timedelta(minutes=1)).strftime("%H:%M")
    end = (now + timedelta(minutes=1)).strftime("%H:%M")
    bot = make_bot(
        {
            "welcome": {
                "quiet_hours_enabled": True,
                "quiet_hours_start": start,
                "quiet_hours_end": end,
                "quiet_hours_tz": "UTC",
            }
        }
    )
    await bot.on_user_join(user("u1"), position())
    assert bot.highrise.whispers == []


async def test_quiet_hours_does_not_skip_outside_window():
    now = datetime.now(ZoneInfo("UTC"))
    start = (now + timedelta(hours=1)).strftime("%H:%M")
    end = (now + timedelta(hours=2)).strftime("%H:%M")
    bot = make_bot(
        {
            "welcome": {
                "quiet_hours_enabled": True,
                "quiet_hours_start": start,
                "quiet_hours_end": end,
                "quiet_hours_tz": "UTC",
            }
        }
    )
    await bot.on_user_join(user("u1"), position())
    assert len(bot.highrise.whispers) == 1


async def test_unknown_template_token_left_literal_not_a_crash():
    bot = make_bot({"welcome": {"templates": ["Hi {nonsense} {username}"], "cooldown_h": 0}})
    await bot.on_user_join(user("u1", "bob"), position())
    assert bot.highrise.whispers == [("u1", "Hi {nonsense} bob")]


# --- VIP recognition -------------------------------------------------------


async def test_vip_gets_distinct_greeting_not_generic_welcome():
    bot = make_bot({"vip": {"users": ["Bob"]}, "welcome": {"templates": ["Generic hi {username}"]}})
    await bot.on_user_join(user("u1", "bob"), position())
    assert bot.highrise.whispers == [("u1", "Welcome back, bob — always great to see you!")]


async def test_vip_match_is_case_insensitive():
    bot = make_bot({"vip": {"users": ["BOB"]}})
    await bot.on_user_join(user("u1", "bob"), position())
    assert len(bot.highrise.whispers) == 1
    assert "bob" in bot.highrise.whispers[0][1].lower()


async def test_vip_bypasses_busy_mode_and_cooldown():
    bot = make_bot({"vip": {"users": ["bob"]}, "welcome": {}})
    # Both out of the schema's declared range on purpose — see the same
    # bypass note in test_busy_mode_skips_greeting_above_threshold.
    bot.config["welcome"]["busy_mode_joins_per_min"] = 1
    bot.config["welcome"]["cooldown_h"] = 999
    await bot.on_user_join(user("noise1"), position())
    await bot.on_user_join(user("noise2"), position())
    await bot.on_user_join(user("u1", "bob"), position())
    await bot.on_user_join(user("u1", "bob"), position())  # rejoin — still greeted every time
    vip_whispers = [w for w in bot.highrise.whispers if w[0] == "u1"]
    assert len(vip_whispers) == 2


async def test_vip_announce_to_room_posts_public_chat():
    bot = make_bot({"vip": {"users": ["bob"], "announce_to_room": True}})
    await bot.on_user_join(user("u1", "bob"), position())
    assert bot.highrise.chats == ["bob just walked in!"]


async def test_vip_announce_to_room_off_by_default():
    bot = make_bot({"vip": {"users": ["bob"]}})
    await bot.on_user_join(user("u1", "bob"), position())
    assert bot.highrise.chats == []


async def test_vip_emote_celebration_targets_the_vip():
    bot = make_bot(
        {"vip": {"users": ["bob"], "emote_celebration_enabled": True, "emote_celebration_id": "dance-macarena"}}
    )
    await bot.on_user_join(user("u1", "bob"), position())
    assert bot.highrise.sent_emotes == [("dance-macarena", "u1")]


async def test_vip_emote_celebration_off_by_default():
    bot = make_bot({"vip": {"users": ["bob"]}})
    await bot.on_user_join(user("u1", "bob"), position())
    assert bot.highrise.sent_emotes == []


async def test_non_vip_username_gets_generic_welcome():
    bot = make_bot({"vip": {"users": ["bob"]}})
    await bot.on_user_join(user("u1", "someoneelse"), position())
    assert "great to see you" not in bot.highrise.whispers[0][1]


# --- farewell -------------------------------------------------------------


async def test_farewell_below_min_visits_is_silent():
    bot = make_bot({"farewell": {"min_visits": 3}, "welcome": {"cooldown_h": 0}})
    u = user("u1", "bob")
    await bot.on_user_join(u, position())
    await bot.on_user_join(u, position())  # 2 visits, below the default min of 3
    await bot.on_user_leave(u)
    assert bot.highrise.chats == []  # no public message; nothing to whisper either


async def test_farewell_public_message_after_min_visits():
    bot = make_bot(
        {"farewell": {"min_visits": 2, "public_message": True}, "welcome": {"cooldown_h": 0}}
    )
    u = user("u1", "bob")
    await bot.on_user_join(u, position())
    await bot.on_user_join(u, position())
    await bot.on_user_leave(u)
    assert bot.highrise.chats == ["Thanks for stopping by, bob!"]


async def test_farewell_public_message_off_by_default():
    bot = make_bot({"farewell": {"min_visits": 1}})
    u = user("u1", "bob")
    await bot.on_user_join(u, position())
    await bot.on_user_leave(u)
    assert bot.highrise.chats == []


async def test_farewell_log_disabled_skips_entirely():
    bot = make_bot({"farewell": {"min_visits": 1, "log_enabled": False, "public_message": True}})
    u = user("u1", "bob")
    await bot.on_user_join(u, position())
    await bot.on_user_leave(u)
    assert bot.highrise.chats == []


async def test_farewell_for_user_who_never_joined_is_a_noop():
    bot = make_bot({"farewell": {"min_visits": 1}})
    await bot.on_user_leave(user("ghost"))  # must not raise
    assert bot.highrise.chats == []


# --- visit persistence (real Postgres, not mocked) -------------------------
#
# Everything above uses make_bot(), which never sets db_pool/bot_instance_id
# — the in-memory-only fallback path, exercised by every test above it.
# These specifically wire a real pool the way supervisor.py's
# _spawn_instance() does, to prove the Postgres-backed path end to end.


async def test_visit_count_persists_across_bot_instances_via_real_db(pool, make_instance):
    instance_id = await make_instance()

    bot1 = make_bot({"welcome": {"cooldown_h": 0}})
    bot1.db_pool, bot1.bot_instance_id = pool, instance_id
    await bot1.on_user_join(user("hr-1", "bob"), position())

    # A fresh bot object — as if the instance reconnected/redeployed —
    # backed by the same instance_id must pick up where the DB left off,
    # not reset to visit #1. Asserted straight against the row (not via a
    # whispered {visit_count}, which no longer exists) since that's what
    # actually backs min_visits and the regulars table.
    bot2 = make_bot({"welcome": {"cooldown_h": 0}})
    bot2.db_pool, bot2.bot_instance_id = pool, instance_id
    await bot2.on_user_join(user("hr-1", "bob"), position())

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT visit_count FROM greeter_visits WHERE bot_instance_id = $1 AND user_id = $2",
            instance_id,
            "hr-1",
        )
    assert row["visit_count"] == 2


async def test_visit_persistence_failure_falls_back_to_session_cache():
    bot = make_bot({"welcome": {"cooldown_h": 0}})

    class ExplodingPool:
        def acquire(self):
            raise RuntimeError("db unreachable")

    bot.db_pool, bot.bot_instance_id = ExplodingPool(), "some-instance-id"

    await bot.on_user_join(user("hr-1", "bob"), position())
    await bot.on_user_join(user("hr-1", "bob"), position())

    # Never silenced by the DB failure — degrades to the session-local
    # count instead of dropping the greeting entirely.
    assert bot._greeter._visits["hr-1"] == 2
    assert len(bot.highrise.whispers) == 2

from __future__ import annotations

import asyncio

import pytest

from highrise import SessionMetadata, User
from highrise.models import AnchorPosition, Item, Position, RoomInfo

import db
from catalog.emcee import EmceeBot
from fake_highrise_client import FakeHighrise, FakeWebAPI


def make_bot(config: dict | None = None) -> EmceeBot:
    bot = EmceeBot(config)
    bot.highrise = FakeHighrise()
    bot.webapi = FakeWebAPI()
    bot._room_owner_id = "owner-1"
    bot._room_name = "Test Room"
    return bot


async def start(bot: EmceeBot) -> None:
    metadata = SessionMetadata(
        user_id="bot-1",
        room_info=RoomInfo(owner_id="owner-1", room_name="Test Room"),
        rate_limits={},
        connection_id="conn-1",
    )
    await bot.on_start(metadata)


def user(uid: str, name: str = "someuser") -> User:
    return User(id=uid, username=name)


def pos(x: float = 1.0, y: float = 0.0, z: float = 2.0, facing: str = "FrontRight") -> Position:
    return Position(x=x, y=y, z=z, facing=facing)


def item(item_id: str, amount: int = 1) -> Item:
    return Item(type="clothing", amount=amount, id=item_id)


owner = user("owner-1", "owner")


# --- anchor spot -------------------------------------------------------------


async def test_anchor_teleports_bot_to_speakers_position():
    bot = make_bot()
    await bot.on_user_join(owner, pos(x=5, y=1, z=-3))
    await bot.on_chat(owner, "anchor")
    assert bot.highrise.teleport_calls == [("bot-1", pos(x=5, y=1, z=-3))]


async def test_anchor_denied_for_non_owner_by_default():
    bot = make_bot()
    stranger = user("u2", "stranger")
    await bot.on_user_join(stranger, pos())
    await bot.on_chat(stranger, "anchor")
    assert bot.highrise.teleport_calls == []


async def test_anchor_allowed_via_allowlist():
    bot = make_bot({"position": {"permission": "allowlist", "allowlist": ["mod1"]}})
    mod = user("u2", "mod1")
    await bot.on_user_join(mod, pos())
    await bot.on_chat(mod, "anchor")
    assert len(bot.highrise.teleport_calls) == 1


async def test_anchor_disabled_in_config():
    bot = make_bot({"position": {"enabled": False}})
    await bot.on_user_join(owner, pos())
    await bot.on_chat(owner, "anchor")
    assert bot.highrise.teleport_calls == []


async def test_anchor_uses_latest_known_position_after_move():
    bot = make_bot()
    await bot.on_user_join(owner, pos(x=0, y=0, z=0))
    await bot.on_user_move(owner, pos(x=9, y=9, z=9))
    await bot.on_chat(owner, "anchor")
    assert bot.highrise.teleport_calls == [("bot-1", pos(x=9, y=9, z=9))]


async def test_anchor_while_seated_whispers_instead_of_teleporting():
    bot = make_bot()
    await bot.on_user_join(owner, AnchorPosition(entity_id="chair-1", anchor_ix=0))
    await bot.on_chat(owner, "anchor")
    assert bot.highrise.teleport_calls == []
    assert any("Stand on the floor" in w[1] for w in bot.highrise.whispers)


async def test_anchor_command_is_case_insensitive():
    bot = make_bot()
    await bot.on_user_join(owner, pos())
    await bot.on_chat(owner, "ANCHOR")
    assert len(bot.highrise.teleport_calls) == 1


async def test_leaving_drops_cached_position():
    bot = make_bot()
    await bot.on_user_join(owner, pos())
    await bot.on_user_leave(owner)
    await bot.on_chat(owner, "anchor")
    assert bot.highrise.teleport_calls == []


async def test_restore_on_start_teleports_to_saved_position(pool, make_instance):
    instance_id = await make_instance()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO avatar_positions (bot_instance_id, x, y, z, facing) VALUES ($1, $2, $3, $4, $5)",
            instance_id,
            1.0,
            2.0,
            3.0,
            "FrontRight",
        )
    bot = make_bot()
    bot.db_pool, bot.bot_instance_id = pool, instance_id
    await start(bot)
    assert bot.highrise.teleport_calls == [("bot-1", pos(x=1.0, y=2.0, z=3.0))]


async def test_restore_on_start_is_a_noop_with_no_saved_position(pool, make_instance):
    instance_id = await make_instance()
    bot = make_bot()
    bot.db_pool, bot.bot_instance_id = pool, instance_id
    await start(bot)
    assert bot.highrise.teleport_calls == []


async def test_apply_avatar_position_teleports_to_freshly_saved_spot(pool, make_instance):
    """The dashboard's "set from the webapp" path (specs/bots/avatar.md):
    writes straight to `avatar_positions`, then the supervisor calls
    `EmceeBot.apply_avatar_position` live, no reconnect — this exercises
    that same re-entry point directly."""
    instance_id = await make_instance()
    bot = make_bot()
    bot.db_pool, bot.bot_instance_id = pool, instance_id
    await start(bot)
    assert bot.highrise.teleport_calls == []  # nothing saved yet at on_start

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO avatar_positions (bot_instance_id, x, y, z, facing) VALUES ($1, $2, $3, $4, $5)",
            instance_id,
            7.0,
            8.0,
            9.0,
            "BackLeft",
        )

    await bot.apply_avatar_position()
    assert bot.highrise.teleport_calls == [("bot-1", pos(x=7.0, y=8.0, z=9.0, facing="BackLeft"))]


async def test_apply_avatar_position_reflects_latest_dashboard_edit(pool, make_instance):
    """A second dashboard save (nudging the same spot) must move the bot
    again, not just re-apply the first save — `apply_avatar_position`
    re-reads the row each time rather than caching the first result."""
    instance_id = await make_instance()
    bot = make_bot()
    bot.db_pool, bot.bot_instance_id = pool, instance_id

    await db.set_avatar_position(pool, instance_id, 1.0, 1.0, 1.0, "FrontRight")
    await bot.apply_avatar_position()
    await db.set_avatar_position(pool, instance_id, 2.0, 2.0, 2.0, "BackRight")
    await bot.apply_avatar_position()

    assert bot.highrise.teleport_calls == [
        ("bot-1", pos(x=1.0, y=1.0, z=1.0, facing="FrontRight")),
        ("bot-1", pos(x=2.0, y=2.0, z=2.0, facing="BackRight")),
    ]


async def test_apply_avatar_position_noop_when_position_disabled(pool, make_instance):
    instance_id = await make_instance()
    bot = make_bot({"position": {"enabled": False}})
    bot.db_pool, bot.bot_instance_id = pool, instance_id
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO avatar_positions (bot_instance_id, x, y, z, facing) VALUES ($1, $2, $3, $4, $5)",
            instance_id,
            1.0,
            2.0,
            3.0,
            "FrontRight",
        )
    await bot.apply_avatar_position()
    assert bot.highrise.teleport_calls == []


async def test_anchor_persists_across_a_fresh_bot_instance(pool, make_instance):
    instance_id = await make_instance()

    bot1 = make_bot()
    bot1.db_pool, bot1.bot_instance_id = pool, instance_id
    await bot1.on_user_join(owner, pos(x=4, y=5, z=6))
    await bot1.on_chat(owner, "anchor")

    # A fresh bot object — as if the instance reconnected — backed by the
    # same instance_id must walk back to the saved spot, not spawn wherever
    # the room drops it.
    bot2 = make_bot()
    bot2.db_pool, bot2.bot_instance_id = pool, instance_id
    await start(bot2)
    assert bot2.highrise.teleport_calls == [("bot-1", pos(x=4, y=5, z=6))]


# --- idle emote loop ---------------------------------------------------------


async def test_idle_loop_off_by_default():
    bot = make_bot({"idle_emote": {"emote_id": "dance-macarena"}})
    await start(bot)
    await asyncio.sleep(0.05)
    assert bot.highrise.sent_emotes == []


async def test_idle_loop_sends_solo_emote_repeatedly():
    bot = make_bot({"idle_emote": {"enabled": True, "emote_id": "dance-macarena", "interval_s": 30}})
    bot.config["idle_emote"]["interval_s"] = 0.02  # below schema minimum on purpose — see loop precedent

    await start(bot)
    await asyncio.sleep(0.09)
    task = bot._avatar._idle_task
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert len(bot.highrise.sent_emotes) >= 2
    assert all(call == ("dance-macarena", None) for call in bot.highrise.sent_emotes)


async def test_idle_loop_stops_once_disabled_mid_flight():
    bot = make_bot({"idle_emote": {"enabled": True, "emote_id": "dance-macarena"}})
    bot.config["idle_emote"]["interval_s"] = 0.02

    await start(bot)
    await asyncio.sleep(0.03)
    bot.config["idle_emote"]["enabled"] = False
    await asyncio.sleep(0.05)

    assert bot._avatar._idle_task.done()
    count_after_stop = len(bot.highrise.sent_emotes)
    await asyncio.sleep(0.05)
    assert len(bot.highrise.sent_emotes) == count_after_stop


# --- reaction back -----------------------------------------------------------


async def test_reaction_back_when_targeted_at_the_bot():
    bot = make_bot()
    await bot.on_reaction(user("u1", "bob"), "heart", user("bot-1", "Bot"))
    assert bot.highrise.react_calls == [("heart", "u1")]


async def test_reaction_back_ignored_when_targeted_at_someone_else():
    bot = make_bot()
    await bot.on_reaction(user("u1", "bob"), "heart", user("u2", "alice"))
    assert bot.highrise.react_calls == []


async def test_reaction_back_disabled():
    bot = make_bot({"reaction_back": {"enabled": False}})
    await bot.on_reaction(user("u1", "bob"), "heart", user("bot-1", "Bot"))
    assert bot.highrise.react_calls == []


async def test_reaction_back_respects_per_user_cooldown():
    bot = make_bot({"reaction_back": {"cooldown_s": 30}})
    bob = user("u1", "bob")
    await bot.on_reaction(bob, "heart", user("bot-1", "Bot"))
    await bot.on_reaction(bob, "heart", user("bot-1", "Bot"))
    assert bot.highrise.react_calls == [("heart", "u1")]


async def test_reaction_back_cooldown_is_per_user():
    bot = make_bot({"reaction_back": {"cooldown_s": 30}})
    await bot.on_reaction(user("u1", "bob"), "heart", user("bot-1", "Bot"))
    await bot.on_reaction(user("u2", "alice"), "heart", user("bot-1", "Bot"))
    assert bot.highrise.react_calls == [("heart", "u1"), ("heart", "u2")]


# --- default outfit -----------------------------------------------------------


async def test_default_outfit_applies_owned_items_on_start():
    bot = make_bot({"default_outfit": {"item_ids": ["shirt-1", "pants-1"]}})
    bot.highrise.inventory = [item("shirt-1"), item("pants-1"), item("hat-1")]
    await start(bot)
    assert {i.id for i in bot.highrise.set_outfit_calls[0]} == {"shirt-1", "pants-1"}


async def test_default_outfit_skips_unowned_ids():
    bot = make_bot({"default_outfit": {"item_ids": ["shirt-1", "shirt-not-owned"]}})
    bot.highrise.inventory = [item("shirt-1")]
    await start(bot)
    assert [i.id for i in bot.highrise.set_outfit_calls[0]] == ["shirt-1"]


async def test_default_outfit_empty_list_is_a_noop():
    bot = make_bot()
    bot.highrise.inventory = [item("shirt-1")]
    await start(bot)
    assert bot.highrise.set_outfit_calls == []


async def test_default_outfit_disabled():
    bot = make_bot({"default_outfit": {"enabled": False, "item_ids": ["shirt-1"]}})
    bot.highrise.inventory = [item("shirt-1")]
    await start(bot)
    assert bot.highrise.set_outfit_calls == []


async def test_default_outfit_all_unowned_never_calls_set_outfit():
    bot = make_bot({"default_outfit": {"item_ids": ["ghost-item"]}})
    await start(bot)
    assert bot.highrise.set_outfit_calls == []


# --- named presets -------------------------------------------------------


async def test_look_switches_to_matching_preset():
    bot = make_bot({"outfit_presets": {"presets": ["casual: shirt-1, pants-1"]}})
    bot.highrise.inventory = [item("shirt-1"), item("pants-1")]
    await bot.on_chat(owner, "look casual")
    assert {i.id for i in bot.highrise.set_outfit_calls[0]} == {"shirt-1", "pants-1"}


async def test_look_unknown_preset_is_silent():
    bot = make_bot({"outfit_presets": {"presets": ["casual: shirt-1"]}})
    await bot.on_chat(owner, "look fancy")
    assert bot.highrise.set_outfit_calls == []


async def test_look_denied_for_non_owner_by_default():
    bot = make_bot({"outfit_presets": {"presets": ["casual: shirt-1"]}})
    bot.highrise.inventory = [item("shirt-1")]
    await bot.on_chat(user("u2", "stranger"), "look casual")
    assert bot.highrise.set_outfit_calls == []


async def test_malformed_preset_line_without_colon_is_ignored():
    bot = make_bot({"outfit_presets": {"presets": ["not a valid line"]}})
    await bot.on_chat(owner, "look not a valid line")
    assert bot.highrise.set_outfit_calls == []


async def test_look_preset_name_is_case_insensitive():
    bot = make_bot({"outfit_presets": {"presets": ["Casual: shirt-1"]}})
    bot.highrise.inventory = [item("shirt-1")]
    await bot.on_chat(owner, "look CASUAL")
    assert len(bot.highrise.set_outfit_calls) == 1


async def test_presets_disabled():
    bot = make_bot({"outfit_presets": {"enabled": False, "presets": ["casual: shirt-1"]}})
    bot.highrise.inventory = [item("shirt-1")]
    await bot.on_chat(owner, "look casual")
    assert bot.highrise.set_outfit_calls == []


# --- clone a look --------------------------------------------------------


async def test_copy_applies_matched_items_merged_by_category():
    bot = make_bot({"outfit_clone": {"min_match": 1}})
    bot.webapi.categories = {"shirt-old": "shirt", "shirt-new": "shirt", "hat-new": "hat"}
    bot.highrise.outfits["bot-1"] = [item("shirt-old"), item("eye-1")]

    target = user("u2", "alice")
    bot.highrise.room_users = [(target, pos())]
    bot.highrise.outfits["u2"] = [item("shirt-new"), item("hat-new")]
    bot.highrise.inventory = [item("shirt-new"), item("hat-new")]

    await bot.on_chat(owner, "copy alice")

    applied = {i.id for i in bot.highrise.set_outfit_calls[0]}
    # shirt-new replaces shirt-old (same category); hat-new is added new;
    # eye-1 survives untouched since nothing matched its category.
    assert applied == {"shirt-new", "hat-new", "eye-1"}


async def test_copy_below_min_match_whispers_instead_of_applying():
    bot = make_bot({"outfit_clone": {"min_match": 3}})
    target = user("u2", "alice")
    bot.highrise.room_users = [(target, pos())]
    bot.highrise.outfits["u2"] = [item("shirt-new")]
    bot.highrise.inventory = [item("shirt-new")]

    await bot.on_chat(owner, "copy alice")

    assert bot.highrise.set_outfit_calls == []
    assert len(bot.highrise.whispers) == 1


async def test_copy_unknown_username_is_silent():
    bot = make_bot()
    await bot.on_chat(owner, "copy nobody")
    assert bot.highrise.set_outfit_calls == []
    assert bot.highrise.whispers == []


async def test_copy_denied_for_non_owner_by_default():
    bot = make_bot({"outfit_clone": {"min_match": 1}})
    target = user("u2", "alice")
    bot.highrise.room_users = [(target, pos())]
    bot.highrise.outfits["u2"] = [item("shirt-new")]
    bot.highrise.inventory = [item("shirt-new")]

    await bot.on_chat(user("u3", "stranger"), "copy alice")
    assert bot.highrise.set_outfit_calls == []


async def test_copy_username_match_is_case_insensitive():
    bot = make_bot({"outfit_clone": {"min_match": 1}})
    target = user("u2", "Alice")
    bot.highrise.room_users = [(target, pos())]
    bot.highrise.outfits["u2"] = [item("shirt-new")]
    bot.highrise.inventory = [item("shirt-new")]

    await bot.on_chat(owner, "copy ALICE")
    assert len(bot.highrise.set_outfit_calls) == 1


async def test_copy_disabled():
    bot = make_bot({"outfit_clone": {"enabled": False}})
    target = user("u2", "alice")
    bot.highrise.room_users = [(target, pos())]
    bot.highrise.outfits["u2"] = [item("shirt-new")]
    bot.highrise.inventory = [item("shirt-new")]

    await bot.on_chat(owner, "copy alice")
    assert bot.highrise.set_outfit_calls == []


async def test_copy_skips_items_whose_category_lookup_fails():
    bot = make_bot({"outfit_clone": {"min_match": 1}})
    bot.webapi.categories = {"shirt-old": "shirt", "shirt-new": "shirt"}
    bot.webapi.failing_ids = {"hat-broken"}
    bot.highrise.outfits["bot-1"] = [item("shirt-old"), item("hat-broken")]

    target = user("u2", "alice")
    bot.highrise.room_users = [(target, pos())]
    bot.highrise.outfits["u2"] = [item("shirt-new")]
    bot.highrise.inventory = [item("shirt-new")]

    await bot.on_chat(owner, "copy alice")

    # hat-broken's webapi.get_item raises ResponseError — it's dropped from
    # the merge rather than aborting the whole copy; shirt-new still
    # replaces shirt-old normally.
    applied = {i.id for i in bot.highrise.set_outfit_calls[0]}
    assert applied == {"shirt-new"}


# --- outfit lock (concurrent commands) ------------------------------------


async def test_outfit_lock_serializes_concurrent_clone_and_preset_switch():
    bot = make_bot(
        {
            "outfit_clone": {"min_match": 1},
            "outfit_presets": {"presets": ["casual: shirt-casual"]},
        }
    )
    bot.webapi.categories = {"shirt-old": "shirt", "shirt-new": "shirt"}
    bot.highrise.outfits["bot-1"] = [item("shirt-old")]

    target = user("u2", "alice")
    bot.highrise.room_users = [(target, pos())]
    bot.highrise.outfits["u2"] = [item("shirt-new")]
    bot.highrise.inventory = [item("shirt-new"), item("shirt-casual")]

    gate = asyncio.Event()
    bot.highrise.get_my_outfit_gate = gate

    clone_task = asyncio.create_task(bot.on_chat(owner, "copy alice"))
    await asyncio.sleep(0)  # clone reaches get_my_outfit and blocks on the gate, still holding the lock

    preset_task = asyncio.create_task(bot.on_chat(owner, "look casual"))
    await asyncio.sleep(0)  # preset switch blocks trying to acquire the (held) lock

    # Neither command has written yet: clone is stuck on the gate, the
    # preset switch is stuck behind clone's held lock — without the lock,
    # the preset switch would have already read+written by now.
    assert bot.highrise.set_outfit_calls == []

    gate.set()
    await clone_task
    await preset_task

    assert len(bot.highrise.set_outfit_calls) == 2
    assert {i.id for i in bot.highrise.set_outfit_calls[0]} == {"shirt-new"}
    assert {i.id for i in bot.highrise.set_outfit_calls[1]} == {"shirt-casual"}

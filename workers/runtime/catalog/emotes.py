"""The emote catalog — data, not code (specs/bots/emote.md).

Two provenance tiers, distinguished by `targetable` (see docs/decisions.md,
2026-07-20 entries "emote catalog expanded" and "emote catalog replaced
with the real current list"):

- 5 **doc-verified** entries (dance-macarena, emote-hello, emote-tired,
  emoji-angry, emoji-thumbsup) — ids confirmed against Highrise's own docs
  (create.highrise.game/learn/bots/api/endpoints/emoterequest).
  `targetable: true` on these is still an *assumption* inherited from the
  docs' general "can be directed toward a player" language, not per-emote
  confirmed — exactly what specs/bots/emote.md's "Verification list" flags
  as needing real testing before sales copy.
- 227 entries from the **current live list**, supplied directly (id + name
  pairs) rather than scraped — higher confidence on id/name accuracy than
  the earlier GitHub-cross-referenced batch it replaced, since every id in
  that older batch turned out to already be present here. Still not
  independently doc-verified, and still says nothing about targetability,
  so `targetable: false` stays the conservative default on all of them,
  same reasoning as before.

Four real id collisions in the supplied list share a display name with a
different entry (Relaxed, Sleepy, Shy, Laugh) — both ids kept (each is a
genuinely distinct, playable emote), disambiguated with a parenthetical
qualifier our own product judgment invented, not the platform's naming.
Aliases are derived from each entry's name (lowercased, trailing "!"/"?"
dropped, a punctuation-free variant added when it differs) except the
disambiguated ones, which collapse straight to one compact alias so a
chat trigger never needs literal parentheses. The original 5's hand-picked
aliases (including PT-BR) are kept as-is, with one adjustment: "sleepy"
was dropped from Tired's aliases once real "Sleepy" entries existed and
would otherwise collide with it.

Growing this catalog is a data change (edit emotes.json), never a code
change — matches the spec's "updatable without deploys" intent, modulo
"deploy" still meaning a supervisor restart until this moves to
Postgres with an admin surface (not built yet).
"""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parent / "emotes.json"


@dataclass(frozen=True)
class EmoteDef:
    id: str
    name: str
    aliases: tuple[str, ...]
    targetable: bool


def normalize(text: str) -> str:
    """Lowercase + trim + accent-fold, so "olá" and "ola" both match the
    same trigger without needing every alias spelled out both ways."""
    text = text.strip().lower()
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


class EmoteCatalog:
    def __init__(self, path: Path = CATALOG_PATH) -> None:
        data = json.loads(path.read_text())
        self._by_id: dict[str, EmoteDef] = {}
        self._lookup: dict[str, str] = {}  # normalized trigger -> emote id
        for entry in data["emotes"]:
            emote = EmoteDef(
                id=entry["id"],
                name=entry["name"],
                aliases=tuple(entry.get("aliases", [])),
                targetable=bool(entry.get("targetable", False)),
            )
            self._by_id[emote.id] = emote
            for trigger in (emote.id, emote.name, *emote.aliases):
                self._lookup[normalize(trigger)] = emote.id
        # Fixed order, built once — the numbered trigger below and the
        # whispered `emotes` list (EmoteEngine._send_emote_list) both index
        # into this same order, so "1" always means whatever position 1
        # shows as in that list.
        self._ordered: tuple[EmoteDef, ...] = tuple(self._by_id.values())

    def resolve(self, text: str) -> EmoteDef | None:
        normalized = normalize(text)
        if normalized.isdigit():
            return self.by_position(int(normalized))
        emote_id = self._lookup.get(normalized)
        return self._by_id.get(emote_id) if emote_id else None

    def by_position(self, position: int) -> EmoteDef | None:
        """1-based — matches the numbering shown in the `emotes` command's
        whispered list, not a 0-based index."""
        if 1 <= position <= len(self._ordered):
            return self._ordered[position - 1]
        return None

    def get(self, emote_id: str) -> EmoteDef | None:
        return self._by_id.get(emote_id)

    def all(self) -> list[EmoteDef]:
        return list(self._ordered)

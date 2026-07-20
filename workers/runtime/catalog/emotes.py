"""The emote catalog — data, not code (specs/bots/emote.md).

emotes.json is a small, **verified-real** starter set: every id here is
confirmed against Highrise's own docs
(create.highrise.game/learn/bots/api/endpoints/emoterequest), not a
fabricated full list — Highrise publishes no comprehensive emote_id
catalog anywhere public, official or community. `targetable: true` is
carried through for every entry because the whole product pitch depends
on it, but it's an *assumption* inherited from the docs' general "can be
directed toward a player" language, not per-emote confirmed — exactly
what specs/bots/emote.md's own "Verification list" flags as needing real
testing before sales copy. Aliases (including PT-BR) are our own product
judgment, not a platform fact.

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

    def resolve(self, text: str) -> EmoteDef | None:
        emote_id = self._lookup.get(normalize(text))
        return self._by_id.get(emote_id) if emote_id else None

    def get(self, emote_id: str) -> EmoteDef | None:
        return self._by_id.get(emote_id)

    def all(self) -> list[EmoteDef]:
        return list(self._by_id.values())

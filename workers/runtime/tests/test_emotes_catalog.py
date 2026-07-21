from __future__ import annotations

from catalog.emotes import EmoteCatalog, normalize


def test_resolves_by_id_name_and_alias():
    catalog = EmoteCatalog()
    by_id = catalog.resolve("dance-macarena")
    by_name = catalog.resolve("Macarena")
    by_alias = catalog.resolve("macarena")
    assert by_id is by_name is by_alias
    assert by_id.id == "dance-macarena"


def test_case_insensitive():
    catalog = EmoteCatalog()
    assert catalog.resolve("MACARENA") is catalog.resolve("macarena")


def test_accent_folding_matches_both_forms():
    catalog = EmoteCatalog()
    assert catalog.resolve("olá") is catalog.resolve("ola")
    assert catalog.resolve("ola").id == "emote-hello"


def test_unknown_text_returns_none():
    catalog = EmoteCatalog()
    assert catalog.resolve("this is not an emote") is None


def test_whitespace_trimmed():
    catalog = EmoteCatalog()
    assert catalog.resolve("  hello  ") is not None


def test_get_by_id():
    catalog = EmoteCatalog()
    assert catalog.get("dance-macarena").name == "Macarena"
    assert catalog.get("nonexistent-id") is None


def test_all_returns_every_entry():
    catalog = EmoteCatalog()
    assert len(catalog.all()) == 232


def test_every_entry_has_at_least_one_alias():
    for emote in EmoteCatalog().all():
        assert len(emote.aliases) >= 1, f"{emote.id} has no aliases"


def test_doc_verified_entries_are_targetable_the_rest_are_not():
    # See catalog/emotes.py's module docstring: only the original 5
    # doc-verified entries carry the (still-assumed, never per-emote
    # confirmed) `targetable: true`; every community-sourced addition
    # defaults to False since we have no basis at all for that one.
    doc_verified = {
        "dance-macarena",
        "emote-hello",
        "emote-tired",
        "emoji-angry",
        "emoji-thumbsup",
    }
    catalog = EmoteCatalog()
    for emote in catalog.all():
        assert emote.targetable == (emote.id in doc_verified), emote.id


def test_normalize_folds_accents_and_case():
    assert normalize("  OLÁ  ") == "ola"
    assert normalize("Não") == "nao"

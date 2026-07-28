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
    assert len(catalog.all()) == 233


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


# --- numbered trigger (added 2026-07-23) -------------------------------------


def test_resolve_by_position_matches_all_order():
    catalog = EmoteCatalog()
    all_emotes = catalog.all()
    assert catalog.resolve("1") is catalog.by_position(1) is all_emotes[0]
    assert catalog.resolve("233") is all_emotes[232]


def test_position_is_one_based_not_zero_based():
    catalog = EmoteCatalog()
    assert catalog.by_position(0) is None


def test_position_out_of_range_returns_none():
    catalog = EmoteCatalog()
    assert catalog.resolve("234") is None
    assert catalog.resolve("99999") is None


def test_position_rejects_negative_and_non_numeric_lookalikes():
    catalog = EmoteCatalog()
    assert catalog.resolve("-1") is None  # "-1".isdigit() is False, falls through to name lookup
    assert catalog.resolve("1.5") is None


def test_no_real_emote_id_alias_or_name_is_purely_numeric():
    # Guards the assumption that numeric text can be claimed exclusively by
    # position lookup without ever shadowing a real trigger.
    catalog = EmoteCatalog()
    for emote in catalog.all():
        for trigger in (emote.id, emote.name, *emote.aliases):
            assert not normalize(trigger).isdigit(), f"{emote.id}: {trigger!r} looks numeric"

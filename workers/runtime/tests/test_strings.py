from __future__ import annotations

from catalog.strings import _STRINGS, SUPPORTED_LOCALES, t


def test_every_key_has_every_supported_locale():
    # A key missing a locale would silently fall back to English for that
    # one locale (t()'s `table.get(locale) or table[DEFAULT_LOCALE]`) rather
    # than fail loudly — this catches the gap at test time instead.
    for key, table in _STRINGS.items():
        missing = set(SUPPORTED_LOCALES) - table.keys()
        assert not missing, f"{key} is missing locale(s): {missing}"


def test_t_substitutes_placeholders():
    assert t("en", "emote.doing", emote_name="Wave") == 'Doing "Wave"!'


def test_t_resolves_requested_locale():
    assert t("es", "emote.doing", emote_name="Wave") == '¡Haciendo "Wave"!'


def test_t_falls_back_to_english_for_unsupported_locale():
    # Defensive only — the schema's enum should prevent this, but a
    # hand-edited or stale config row shouldn't crash a handler over it.
    assert t("fr", "warden.filter_warning") == "Please keep the chat friendly — that's not allowed here."


def test_t_returns_the_key_itself_for_an_unknown_key():
    assert t("en", "nonsense.key") == "nonsense.key"

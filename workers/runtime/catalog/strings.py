"""Bot-facing runtime strings — the built-in responses a catalog bot sends
that are NOT owner-authored templates. Welcome/VIP/Farewell/Activation
message (`greeter.py`) stay exactly as the owner writes them, in whatever
language they choose (`_render`'s literal-token substitution) — this module
is for everything else the bot says on its own initiative: emote
confirmations, loop start/timeout messages, the emote list header,
moderation warnings, mod-command replies, and the VIP room announcement
(`greeter.py`'s one hardcoded public line, distinct from VIP's own
owner-editable whisper template).

Locale is `general.bot_language` in the shared config
(`CatalogBot.bot_language`, `base.py`) — added 2026-07-24, one of
BotMarket's five supported locales (en/es/de/pt/ru, matching apps/web's
next-intl locale set and `packages/schemas/emcee/v1.json`'s own enum).
Defaults to English, same as the schema field itself.

Keys are namespaced by module (`emote.*`, `warden.*`, `avatar.*`,
`greeter.*`) with `{placeholder}` tokens filled by `str.format(**kwargs)` —
safe here (unlike greeter.py's literal-token `_render`) because every value
substituted into one of these is always internal/derived text (an emote
name from our own catalog, a username, a number) never an owner-authored
template string, so there's no format-string-gadget surface `_render`
specifically exists to avoid.
"""

from __future__ import annotations

from typing import Any

DEFAULT_LOCALE = "en"
SUPPORTED_LOCALES = ("en", "es", "de", "pt", "ru")

_STRINGS: dict[str, dict[str, str]] = {
    "emote.doing": {
        "en": 'Doing "{emote_name}"!',
        "es": '¡Haciendo "{emote_name}"!',
        "de": '"{emote_name}" wird ausgeführt!',
        "pt": 'Fazendo "{emote_name}"!',
        "ru": 'Делаю "{emote_name}"!',
    },
    "emote.loop_started": {
        "en": 'Looping {emote_name} every {interval_s}s — say "stop" anytime, or it\'ll auto-stop after {max_duration_m} min.',
        "es": 'Repitiendo {emote_name} cada {interval_s}s — di "stop" cuando quieras, o se detendrá sola tras {max_duration_m} min.',
        "de": '{emote_name} wird alle {interval_s}s wiederholt — sag jederzeit "stop", oder es stoppt automatisch nach {max_duration_m} Min.',
        "pt": 'Repetindo {emote_name} a cada {interval_s}s — diga "stop" quando quiser, ou para sozinha depois de {max_duration_m} min.',
        "ru": 'Повторяю {emote_name} каждые {interval_s} сек — скажи "stop", когда захочешь, или это остановится само через {max_duration_m} мин.',
    },
    "emote.loop_timed_out": {
        "en": "Your loop timed out after a while — say an emote's name again to restart it.",
        "es": "Tu repetición se detuvo por tiempo — di el nombre de una emote de nuevo para reiniciarla.",
        "de": "Deine Wiederholung ist nach einer Weile ausgelaufen — sag den Namen einer Emote erneut, um sie neu zu starten.",
        "pt": "Sua repetição parou depois de um tempo — diga o nome de uma emote de novo para reiniciar.",
        "ru": "Твой повтор истёк через некоторое время — скажи название эмоции ещё раз, чтобы начать заново.",
    },
    "emote.list_header": {
        "en": "Emotes:",
        "es": "Emotes:",
        "de": "Emotes:",
        "pt": "Emotes:",
        "ru": "Эмоции:",
    },
    "warden.filter_warning": {
        "en": "Please keep the chat friendly — that's not allowed here.",
        "es": "Por favor, mantén el chat amigable — eso no está permitido aquí.",
        "de": "Bitte bleib im Chat freundlich — das ist hier nicht erlaubt.",
        "pt": "Por favor, mantenha o chat amigável — isso não é permitido aqui.",
        "ru": "Пожалуйста, будь вежливее в чате — это здесь не разрешено.",
    },
    "warden.command_target_not_found": {
        "en": "Couldn't find {target} in the room.",
        "es": "No pude encontrar a {target} en la sala.",
        "de": "{target} wurde im Raum nicht gefunden.",
        "pt": "Não encontrei {target} na sala.",
        "ru": "Не удалось найти {target} в комнате.",
    },
    "warden.action_denied": {
        "en": "Couldn't {action} {username} here — missing permission?",
        "es": "No pude {action} a {username} aquí — ¿falta algún permiso?",
        "de": "Konnte {username} hier nicht {action} — fehlt eine Berechtigung?",
        "pt": "Não consegui {action} {username} aqui — falta permissão?",
        "ru": "Не удалось {action} {username} здесь — возможно, не хватает прав?",
    },
    "warden.verb.mute": {
        "en": "mute",
        "es": "silenciar",
        "de": "stummschalten",
        "pt": "silenciar",
        "ru": "заглушить",
    },
    "warden.verb.kick": {
        "en": "kick",
        "es": "expulsar",
        "de": "kicken",
        "pt": "expulsar",
        "ru": "выгнать",
    },
    "warden.verb.ban": {
        "en": "ban",
        "es": "banear",
        "de": "bannen",
        "pt": "banir",
        "ru": "забанить",
    },
    "avatar.anchor_not_standing": {
        "en": 'Stand on the floor (not seated) where you want me, then say "anchor" again.',
        "es": 'Ponte de pie (no sentado) donde quieras que esté, y luego di "anchor" de nuevo.',
        "de": 'Stell dich (nicht sitzend) an die Stelle, wo ich stehen soll, und sag dann noch einmal "anchor".',
        "pt": 'Fique em pé (não sentado) onde você quer que eu fique, e diga "anchor" de novo.',
        "ru": 'Встань (не сиди) там, где хочешь меня видеть, и скажи "anchor" ещё раз.',
    },
    "avatar.clone_insufficient_match": {
        "en": "Couldn't find enough of {username}'s look in my own closet to copy it.",
        "es": "No encontré suficientes prendas del look de {username} en mi propio armario para copiarlo.",
        "de": "Ich habe nicht genug vom Look von {username} in meinem eigenen Schrank, um ihn zu kopieren.",
        "pt": "Não encontrei roupas suficientes do visual de {username} no meu próprio guarda-roupa para copiar.",
        "ru": "Не нашлось достаточно вещей из образа {username} в моём гардеробе, чтобы скопировать его.",
    },
    "greeter.vip_announce": {
        "en": "{username} just walked in!",
        "es": "¡{username} acaba de entrar!",
        "de": "{username} ist gerade reingekommen!",
        "pt": "{username} acabou de chegar!",
        "ru": "{username} только что зашёл!",
    },
}


def t(locale: str, key: str, **kwargs: Any) -> str:
    """Resolves `key` in `locale`, falling back to `DEFAULT_LOCALE` for an
    unsupported locale or a locale missing that particular key (neither
    should happen given `SUPPORTED_LOCALES` is validated at the schema
    level, but a stale/hand-edited config row is cheap to guard against).
    An unknown `key` returns the key itself rather than raising — a typo'd
    lookup shouldn't crash a handler over a cosmetic string."""
    table = _STRINGS.get(key)
    if table is None:
        return key
    text = table.get(locale) or table[DEFAULT_LOCALE]
    return text.format(**kwargs)

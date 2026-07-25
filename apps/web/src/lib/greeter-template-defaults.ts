import type { AppLocale } from "@/i18n/routing";

/**
 * Localized equivalents of packages/schemas/emcee/v1.json's own English
 * `default` for `welcome.templates` / `vip.template` / `farewell.public_template`
 * — the schema's `default` field can only hold one static value (it's shared
 * with the Python runtime's own validation, which has no notion of dashboard
 * locale), so this is the TypeScript-only source of truth for "what should a
 * brand-new instance's greeting copy say in each of our 5 locales." `{username}`
 * and `{room_name}` are literal template variables the runtime substitutes —
 * kept verbatim, untranslated, in every locale.
 *
 * Used once at instance creation (instances/new/actions.ts, keyed off the
 * creating user's current `getLocale()`) to seed a newly created instance's
 * config, and as the fallback in getWelcomeConfig/getVipConfig/
 * getFarewellConfig/getActivationMessageConfig (actions.ts) for an instance
 * whose section was never actually saved and thus fell back onto the
 * schema's own default. Once an instance's config has anything real written
 * to `welcome.templates` (or `vip.template`/`farewell.public_template`/
 * `activation_message.template`) — including the English default seeded
 * before this file existed — that stored value is the source of truth from
 * then on, same as every other field: nothing here retroactively rewrites
 * already-persisted config.
 */
export interface GreeterTemplateDefaults {
  welcomeTemplates: string[];
  vipTemplate: string;
  farewellPublicTemplate: string;
  activationMessageTemplate: string;
}

const GREETER_TEMPLATE_DEFAULTS: Record<AppLocale, GreeterTemplateDefaults> = {
  en: {
    welcomeTemplates: [
      "Welcome to {room_name}, {username}!",
      "Hey {username}, great to see you!",
      "{username} just walked in — welcome!",
    ],
    vipTemplate: "Welcome back, {username} — always great to see you!",
    farewellPublicTemplate: "Thanks for stopping by, {username}!",
    activationMessageTemplate: "I'm online and ready to help in {room_name}!",
  },
  es: {
    welcomeTemplates: [
      "¡Bienvenido a {room_name}, {username}!",
      "¡Hola {username}, qué bueno verte!",
      "¡{username} acaba de entrar — bienvenido!",
    ],
    vipTemplate: "¡Bienvenido de nuevo, {username} — siempre es un gusto verte!",
    farewellPublicTemplate: "¡Gracias por pasarte, {username}!",
    activationMessageTemplate: "¡Estoy en línea y listo para ayudar en {room_name}!",
  },
  de: {
    welcomeTemplates: [
      "Willkommen in {room_name}, {username}!",
      "Hey {username}, schön dich zu sehen!",
      "{username} ist gerade reingekommen — willkommen!",
    ],
    vipTemplate: "Willkommen zurück, {username} — freut uns immer, dich zu sehen!",
    farewellPublicTemplate: "Danke fürs Vorbeischauen, {username}!",
    activationMessageTemplate: "Ich bin online und bereit zu helfen in {room_name}!",
  },
  pt: {
    welcomeTemplates: [
      "Bem-vindo a {room_name}, {username}!",
      "Oi {username}, que bom te ver!",
      "{username} acabou de chegar — seja bem-vindo!",
    ],
    vipTemplate: "Bem-vindo de volta, {username} — sempre ótimo te ver por aqui!",
    farewellPublicTemplate: "Obrigado pela visita, {username}!",
    activationMessageTemplate: "Estou online e pronto para ajudar em {room_name}!",
  },
  ru: {
    welcomeTemplates: [
      "Добро пожаловать в {room_name}, {username}!",
      "Привет, {username}, рады тебя видеть!",
      "{username} только что зашёл — добро пожаловать!",
    ],
    vipTemplate: "С возвращением, {username} — всегда рады тебя видеть!",
    farewellPublicTemplate: "Спасибо, что заглянул, {username}!",
    activationMessageTemplate: "Я в сети и готов помочь в {room_name}!",
  },
};

export function getGreeterTemplateDefaults(locale: AppLocale): GreeterTemplateDefaults {
  return GREETER_TEMPLATE_DEFAULTS[locale];
}

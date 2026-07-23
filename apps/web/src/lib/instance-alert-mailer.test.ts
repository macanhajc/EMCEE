import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDegradedAlertEmail } from "./instance-alert-mailer";

const BASE_INPUT = {
  to: "owner@example.com",
  userName: "Alex",
  roomId: "room_abc123",
  instanceId: "11111111-1111-1111-1111-111111111111",
  appOrigin: "https://app.botmarket.test",
  locale: null,
};

describe("sendDegradedAlertEmail", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("RESEND_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("logs to the console and never calls fetch when RESEND_API_KEY is unset outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendDegradedAlertEmail(BASE_INPUT);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(BASE_INPUT.roomId));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when RESEND_API_KEY is unset in production, rather than silently not alerting", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(sendDegradedAlertEmail(BASE_INPUT)).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends via Resend with the room id and dashboard link, and never a token-shaped field", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );

    await sendDegradedAlertEmail(BASE_INPUT);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);

    expect(body.to).toBe(BASE_INPUT.to);
    expect(body.html).toContain(BASE_INPUT.roomId);
    expect(body.html).toContain(`${BASE_INPUT.appOrigin}/instances/${BASE_INPUT.instanceId}`);
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it("throws when Resend returns an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid api key" }), { status: 401 }),
    );

    await expect(sendDegradedAlertEmail(BASE_INPUT)).rejects.toThrow(/Resend failed/);
  });

  it("sends in the user's last-seen locale, falling back to English when unknown", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );

    await sendDegradedAlertEmail({ ...BASE_INPUT, locale: "pt" });

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);
    expect(body.subject).toContain("precisa de atenção");
    expect(body.html).toContain("Ver seu painel");
  });

  it("falls back to English for a locale users.locale doesn't recognize", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 }),
    );

    await sendDegradedAlertEmail({ ...BASE_INPUT, locale: "fr-not-supported" });

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);
    expect(body.subject).toContain("needs attention");
  });
});

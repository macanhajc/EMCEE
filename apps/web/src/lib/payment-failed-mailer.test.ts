import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPaymentFailedEmail } from "./payment-failed-mailer";

const BASE_INPUT = {
  to: "owner@example.com",
  userName: "Alex",
  roomId: "room_abc123",
  instanceId: "11111111-1111-1111-1111-111111111111",
  appOrigin: "https://app.botmarket.test",
  locale: null,
  amountDue: 3900,
  currency: "brl",
};

describe("sendPaymentFailedEmail", () => {
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

    await sendPaymentFailedEmail(BASE_INPUT);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(BASE_INPUT.roomId));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when RESEND_API_KEY is unset in production, rather than silently not alerting", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(sendPaymentFailedEmail(BASE_INPUT)).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends via Resend with the formatted amount, room id, dashboard link, and never a token-shaped field", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));

    await sendPaymentFailedEmail(BASE_INPUT);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);

    expect(body.to).toBe(BASE_INPUT.to);
    expect(body.subject).toContain(BASE_INPUT.roomId);
    expect(body.html).toContain(BASE_INPUT.roomId);
    expect(body.html).toContain(`${BASE_INPUT.appOrigin}/instances/${BASE_INPUT.instanceId}`);
    // amountDue is in cents; R$39.00 for the 3900 fixture above.
    expect(body.html).toContain("39");
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it("throws when Resend returns an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid api key" }), { status: 401 }),
    );

    await expect(sendPaymentFailedEmail(BASE_INPUT)).rejects.toThrow(/Resend failed/);
  });

  it("sends in the user's last-seen locale", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));

    await sendPaymentFailedEmail({ ...BASE_INPUT, locale: "de" });

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);
    expect(body.subject).toContain("fehlgeschlagen");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSupervisorDownAlert, sendSupervisorRecoveredAlert } from "./ops-alert-mailer";

describe("ops-alert-mailer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("OPS_ALERT_EMAIL", "ops@example.com");
    vi.stubEnv("RESEND_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("logs to the console and never calls fetch when RESEND_API_KEY is unset outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendSupervisorDownAlert({ lastSeenAt: null });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("supervisor is down"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs to the console and never calls fetch when OPS_ALERT_EMAIL is unset outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OPS_ALERT_EMAIL", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendSupervisorRecoveredAlert();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("OPS_ALERT_EMAIL unset"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws in production when RESEND_API_KEY is unset, rather than silently not alerting", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(sendSupervisorDownAlert({ lastSeenAt: null })).rejects.toThrow(/OPS_ALERT_EMAIL\/RESEND_API_KEY/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws in production when OPS_ALERT_EMAIL is unset, rather than silently not alerting", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPS_ALERT_EMAIL", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    await expect(sendSupervisorRecoveredAlert()).rejects.toThrow(/OPS_ALERT_EMAIL\/RESEND_API_KEY/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the down alert via Resend with the last-seen timestamp, to every configured recipient", async () => {
    vi.stubEnv("OPS_ALERT_EMAIL", "ops@example.com, second@example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));

    await sendSupervisorDownAlert({ lastSeenAt: new Date("2026-07-23T21:00:00Z") });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);

    expect(body.to).toEqual(["ops@example.com", "second@example.com"]);
    expect(body.subject).toContain("supervisor is down");
    expect(body.html).toContain("2026");
  });

  it("sends the recovered alert via Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "email_2" }), { status: 200 }));

    await sendSupervisorRecoveredAlert();

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(requestInit!.body as string);
    expect(body.subject).toContain("supervisor recovered");
  });

  it("throws when Resend returns an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: "invalid api key" }), { status: 401 }));

    await expect(sendSupervisorRecoveredAlert()).rejects.toThrow(/Resend failed/);
  });
});

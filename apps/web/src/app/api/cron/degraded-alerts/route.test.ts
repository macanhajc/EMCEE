import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getInstancesNeedingDegradedAlert, recordDegradedAlertSent } = vi.hoisted(() => ({
  getInstancesNeedingDegradedAlert: vi.fn(),
  recordDegradedAlertSent: vi.fn(),
}));
const { sendDegradedAlertEmail } = vi.hoisted(() => ({ sendDegradedAlertEmail: vi.fn() }));

vi.mock("@/db/instance-alerts", () => ({ getInstancesNeedingDegradedAlert, recordDegradedAlertSent }));
vi.mock("@/lib/instance-alert-mailer", () => ({ sendDegradedAlertEmail }));

const CANDIDATE_A = { instanceId: "a", roomId: "room_a", userEmail: "a@example.com", userName: "A" };
const CANDIDATE_B = { instanceId: "b", roomId: "room_b", userEmail: "b@example.com", userName: null };

function request(headers: Record<string, string> = {}) {
  return new Request("https://app.botmarket.test/api/cron/degraded-alerts", { headers });
}

describe("GET /api/cron/degraded-alerts", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "s3cret" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 and never touches the DB/mailer when the auth header is missing or wrong", async () => {
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer wrong" }));

    expect(res.status).toBe(401);
    expect(getInstancesNeedingDegradedAlert).not.toHaveBeenCalled();
    expect(sendDegradedAlertEmail).not.toHaveBeenCalled();
  });

  it("returns 500 and does nothing when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer anything" }));

    expect(res.status).toBe(500);
    expect(getInstancesNeedingDegradedAlert).not.toHaveBeenCalled();
  });

  it("returns an empty summary with zero candidates and no side effects", async () => {
    getInstancesNeedingDegradedAlert.mockResolvedValue([]);
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer s3cret" }));
    const body = await res.json();

    expect(body).toEqual({ checked: 0, sent: 0, failed: 0, failures: [] });
    expect(sendDegradedAlertEmail).not.toHaveBeenCalled();
    expect(recordDegradedAlertSent).not.toHaveBeenCalled();
  });

  it("records an alert as sent only for successful sends, not failed ones", async () => {
    getInstancesNeedingDegradedAlert.mockResolvedValue([CANDIDATE_A, CANDIDATE_B]);
    sendDegradedAlertEmail.mockImplementation(async (input: { to: string }) => {
      if (input.to === CANDIDATE_B.userEmail) throw new Error("resend down");
    });
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer s3cret" }));
    const body = await res.json();

    expect(body.checked).toBe(2);
    expect(body.sent).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.failures).toEqual([{ instanceId: "b", error: "resend down" }]);
    expect(recordDegradedAlertSent).toHaveBeenCalledTimes(1);
    expect(recordDegradedAlertSent).toHaveBeenCalledWith("a");
  });
});

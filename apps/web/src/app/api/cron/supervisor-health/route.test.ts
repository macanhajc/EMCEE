import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getLastHeartbeatAt, getActiveSupervisorDownAlert, recordSupervisorDownAlertSent, clearSupervisorDownAlert } =
  vi.hoisted(() => ({
    getLastHeartbeatAt: vi.fn(),
    getActiveSupervisorDownAlert: vi.fn(),
    recordSupervisorDownAlertSent: vi.fn(),
    clearSupervisorDownAlert: vi.fn(),
  }));
const { sendSupervisorDownAlert, sendSupervisorRecoveredAlert } = vi.hoisted(() => ({
  sendSupervisorDownAlert: vi.fn(),
  sendSupervisorRecoveredAlert: vi.fn(),
}));

vi.mock("@/db/supervisor-health", () => ({
  getLastHeartbeatAt,
  getActiveSupervisorDownAlert,
  recordSupervisorDownAlertSent,
  clearSupervisorDownAlert,
}));
vi.mock("@/lib/ops-alert-mailer", () => ({ sendSupervisorDownAlert, sendSupervisorRecoveredAlert }));

function request(headers: Record<string, string> = {}) {
  return new Request("https://app.botmarket.test/api/cron/supervisor-health", { headers });
}

describe("GET /api/cron/supervisor-health", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "s3cret" };
    getActiveSupervisorDownAlert.mockResolvedValue(null);
    getLastHeartbeatAt.mockResolvedValue(new Date());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 and never touches the DB/mailer when the auth header is missing or wrong", async () => {
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer wrong" }));

    expect(res.status).toBe(401);
    expect(getLastHeartbeatAt).not.toHaveBeenCalled();
    expect(sendSupervisorDownAlert).not.toHaveBeenCalled();
  });

  it("returns 500 and does nothing when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer anything" }));

    expect(res.status).toBe(500);
    expect(getLastHeartbeatAt).not.toHaveBeenCalled();
  });

  it("does nothing when the heartbeat is fresh and no alert is active", async () => {
    getLastHeartbeatAt.mockResolvedValue(new Date());
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer s3cret" }));
    const body = await res.json();

    expect(body.action).toBe("none");
    expect(sendSupervisorDownAlert).not.toHaveBeenCalled();
    expect(sendSupervisorRecoveredAlert).not.toHaveBeenCalled();
  });

  it("sends a down alert and records it when the heartbeat is stale with no active alert", async () => {
    getLastHeartbeatAt.mockResolvedValue(null);
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer s3cret" }));
    const body = await res.json();

    expect(body.action).toBe("alert_down");
    expect(sendSupervisorDownAlert).toHaveBeenCalledWith({ lastSeenAt: null });
    expect(recordSupervisorDownAlertSent).toHaveBeenCalledTimes(1);
    expect(sendSupervisorRecoveredAlert).not.toHaveBeenCalled();
  });

  it("sends a recovered alert and clears it when the heartbeat is fresh again with an active alert", async () => {
    getLastHeartbeatAt.mockResolvedValue(new Date());
    getActiveSupervisorDownAlert.mockResolvedValue({ lastSentAt: new Date(Date.now() - 60_000) });
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer s3cret" }));
    const body = await res.json();

    expect(body.action).toBe("alert_recovered");
    expect(sendSupervisorRecoveredAlert).toHaveBeenCalledTimes(1);
    expect(clearSupervisorDownAlert).toHaveBeenCalledTimes(1);
    expect(sendSupervisorDownAlert).not.toHaveBeenCalled();
  });

  it("does not re-alert while still down and inside the cooldown", async () => {
    getLastHeartbeatAt.mockResolvedValue(null);
    getActiveSupervisorDownAlert.mockResolvedValue({ lastSentAt: new Date() });
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer s3cret" }));
    const body = await res.json();

    expect(body.action).toBe("none");
    expect(sendSupervisorDownAlert).not.toHaveBeenCalled();
    expect(recordSupervisorDownAlertSent).not.toHaveBeenCalled();
  });
});

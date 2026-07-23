import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rollupAndPruneInstanceEvents, stripOldWebhookPayloads, pruneExpiredSessions, pruneExpiredVerificationTokens } =
  vi.hoisted(() => ({
    rollupAndPruneInstanceEvents: vi.fn(),
    stripOldWebhookPayloads: vi.fn(),
    pruneExpiredSessions: vi.fn(),
    pruneExpiredVerificationTokens: vi.fn(),
  }));

vi.mock("@/db/retention", () => ({
  rollupAndPruneInstanceEvents,
  stripOldWebhookPayloads,
  pruneExpiredSessions,
  pruneExpiredVerificationTokens,
}));

function request(headers: Record<string, string> = {}) {
  return new Request("https://app.botmarket.test/api/cron/retention", { headers });
}

describe("GET /api/cron/retention", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "s3cret" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 and never touches the DB when the auth header is missing or wrong", async () => {
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer wrong" }));

    expect(res.status).toBe(401);
    expect(rollupAndPruneInstanceEvents).not.toHaveBeenCalled();
    expect(pruneExpiredSessions).not.toHaveBeenCalled();
  });

  it("returns 500 and does nothing when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer anything" }));

    expect(res.status).toBe(500);
    expect(rollupAndPruneInstanceEvents).not.toHaveBeenCalled();
  });

  it("runs all four sweeps and reports their results", async () => {
    rollupAndPruneInstanceEvents.mockResolvedValue({ pruned: 12 });
    stripOldWebhookPayloads.mockResolvedValue({ stripped: 3 });
    pruneExpiredSessions.mockResolvedValue({ pruned: 2 });
    pruneExpiredVerificationTokens.mockResolvedValue({ pruned: 1 });
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer s3cret" }));
    const body = await res.json();

    expect(body).toEqual({
      results: {
        instanceEvents: { pruned: 12 },
        webhookPayloads: { stripped: 3 },
        sessions: { pruned: 2 },
        verificationTokens: { pruned: 1 },
      },
      failed: 0,
      failures: [],
    });
  });

  it("keeps running the remaining sweeps when one fails, and reports the failure", async () => {
    rollupAndPruneInstanceEvents.mockRejectedValue(new Error("deadlock"));
    stripOldWebhookPayloads.mockResolvedValue({ stripped: 0 });
    pruneExpiredSessions.mockResolvedValue({ pruned: 0 });
    pruneExpiredVerificationTokens.mockResolvedValue({ pruned: 0 });
    const { GET } = await import("./route");

    const res = await GET(request({ authorization: "Bearer s3cret" }));
    const body = await res.json();

    expect(body.failed).toBe(1);
    expect(body.failures).toEqual([{ task: "instanceEvents", error: "deadlock" }]);
    expect(body.results).toEqual({
      webhookPayloads: { stripped: 0 },
      sessions: { pruned: 0 },
      verificationTokens: { pruned: 0 },
    });
    expect(stripOldWebhookPayloads).toHaveBeenCalledTimes(1);
    expect(pruneExpiredSessions).toHaveBeenCalledTimes(1);
    expect(pruneExpiredVerificationTokens).toHaveBeenCalledTimes(1);
  });
});

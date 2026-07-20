import "server-only";
import { createClient, type RedisClientType } from "redis";

const globalForRedis = globalThis as unknown as { redisClient?: RedisClientType };

function client(): RedisClientType {
  if (!globalForRedis.redisClient) {
    const c = createClient({ url: process.env.REDIS_URL }) as RedisClientType;
    c.on("error", (err) => console.error("[redis]", err));
    globalForRedis.redisClient = c;
  }
  return globalForRedis.redisClient;
}

/**
 * Wakes the supervisor's reconcile loop after a config save
 * (specs/02-architecture.md). Postgres stays the source of truth for the
 * config itself — this carries only the instance id, never the payload, so
 * there's no dual-source-of-truth risk if a publish is lost. Best-effort by
 * design: "the loop makes it correct even if pub/sub drops"
 * (specs/04-bot-runtime.md), so a Redis hiccup must never fail the save.
 */
export async function publishConfigUpdated(instanceId: string): Promise<void> {
  try {
    const c = client();
    if (!c.isOpen) await c.connect();
    await c.publish("config.updated", JSON.stringify({ instanceId }));
  } catch (err) {
    console.error("[redis] publish config.updated failed", err);
  }
}

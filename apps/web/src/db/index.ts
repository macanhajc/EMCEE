import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse the connection across Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { dbClient?: ReturnType<typeof postgres> };

const client = globalForDb.dbClient ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalForDb.dbClient = client;

export const db = drizzle(client, { schema });
export * as tables from "./schema";

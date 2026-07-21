import { randomBytes } from "node:crypto";
import { db, tables } from "./index";

async function main() {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(tables.sessions).values({
    sessionToken: token,
    userId: "be6359da-145e-4a86-8a52-9a06dc20cbe5",
    expires,
  });
  console.log(token);
  process.exit(0);
}

main();

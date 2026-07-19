// Driver for scripts/check-token-seal.sh — seals CROSSCHECK_TOKEN, prints JSON.
// Run with NODE_OPTIONS="--conditions=react-server" so "server-only" resolves
// to its empty react-server build, same as inside the Next.js server bundle.
import { sealToken } from "../src/lib/token-seal";

const token = process.env.CROSSCHECK_TOKEN;
if (!token) throw new Error("CROSSCHECK_TOKEN not set");
sealToken(token).then((sealed) => console.log(JSON.stringify(sealed)));

import "dotenv/config";
import { redis } from "../src/lib/redis.js";

async function main() {
  const patterns = ["rl:streaming:*", "rl:general:*", "rl:auth:*"];
  let total = 0;
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`  ${pattern}: cleared ${keys.length}`);
      total += keys.length;
    }
  }
  console.log(`✓ Cleared ${total} rate-limit keys`);
  redis.disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

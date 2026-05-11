import { getPollIntervalMs } from "../src/lib/config";
import { checkAllWallets } from "../src/lib/tracker";

const intervalMs = getPollIntervalMs();
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const results = await checkAllWallets(true);
    const events = results.reduce((sum, result) => sum + result.newEvents, 0);
    console.log(`[polywatch] checked ${results.length} wallet(s), ${events} new event(s)`);
  } catch (error) {
    console.error("[polywatch] poll failed", error);
  } finally {
    running = false;
  }
}

console.log(`[polywatch] worker started, interval ${intervalMs / 1000}s`);
void tick();
setInterval(() => void tick(), intervalMs);

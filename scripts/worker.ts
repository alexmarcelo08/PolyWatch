import { runPollingTick } from "../src/lib/polling";

const intervalMs = 2500;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const results = await runPollingTick(1);
    const events = results.reduce((sum, result) => sum + result.newEvents, 0);
    if (results.length > 0) console.log(`[polywatch] checked ${results.length} wallet(s), ${events} new event(s)`);
  } catch (error) {
    console.error("[polywatch] poll failed", error);
  } finally {
    running = false;
  }
}

console.log("[polywatch] worker started, hybrid scheduler enabled");
void tick();
setInterval(() => void tick(), intervalMs);

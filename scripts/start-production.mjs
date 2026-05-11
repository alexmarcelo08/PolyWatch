import { spawn } from "node:child_process";

const port = process.env.PORT ?? "3000";
const children = [
  spawn("node", ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", port], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn("node", ["--import", "tsx", "scripts/worker.ts"], {
    stdio: "inherit",
    env: process.env,
  }),
];

function shutdown(signal) {
  for (const child of children) child.kill(signal);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

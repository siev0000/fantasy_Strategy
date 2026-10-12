import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

// 配布用ビルドを再生成し、開発サーバーでは隠れる変換時のデグレを検出する。
async function run(args, env = process.env) {
  const child = spawn(process.execPath, args, { cwd:process.cwd(), env, stdio:"inherit" });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, `Failed: ${args.join(" ")}`);
}
await run(["node_modules/vite/bin/vite.js", "build", "--config", "frontend/vite.config.mjs"]);
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const url = `http://127.0.0.1:${port}`;
const env = { ...process.env, PORT:String(port), HOST:"127.0.0.1", NODE_ENV:"production", V39_TEST_URL:url, V39_PRODUCTION_CHECK:"1", SOCKET_CORS_ORIGINS:url };
const server = spawn(process.execPath, ["server.js"], { cwd:process.cwd(), env, stdio:["ignore", "pipe", "pipe"] });
let serverOutput = "";
server.stdout.on("data", chunk => { serverOutput += String(chunk); });
server.stderr.on("data", chunk => { serverOutput += String(chunk); });
try {
  const deadline = Date.now() + 10000;
  while (!serverOutput.includes("Fantasy Strategy server listening")) {
    assert.ok(Date.now() < deadline && server.exitCode === null, serverOutput || "Production server did not start");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  for (const name of [
    "character-squad-layout", "character-skills-equipment", "field-settings-scroll",
    "test-play-characters", "start-save-load", "research-flow-ui", "cave-move-binding",
    "field-update-loading", "local-session", "effect-defaults", "effect-direction", "expedition-test-fixture", "coordinate-ruler", "auto-turn-end", "instructor-turn-end", "friendly-auto-movement", "squad-edit-follow"
  ]) await run([`scripts/check-v39-${name}.mjs`], env);
  console.log("Production UI regression checks passed");
} finally {
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
}

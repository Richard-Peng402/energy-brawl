import { io } from "socket.io-client";
import { writeFile } from "node:fs/promises";
import { PLAYER_COLORS, SERVER_TICK_MS } from "../src/shared/constants";

const url = process.env.GAME_URL ?? "http://127.0.0.1:3000";
const token = process.env.HOST_TOKEN ?? "load-test-host-token";
const seconds = Number(process.env.LOAD_TEST_SECONDS ?? 10);
const reportPath = process.env.LOAD_TEST_REPORT?.trim();
const clients = PLAYER_COLORS.map((color, index) => io(url, { transports: ["websocket"], forceNew: true, autoConnect: true }));
const snapshots = clients.map(() => 0);
let starts = 0;
let preparing = false;

await Promise.all(clients.map((client) => new Promise<void>((resolve, reject) => {
  client.once("connect", () => resolve());
  client.once("connect_error", reject);
})));
await Promise.all(clients.map((client, index) => new Promise<void>((resolve) => client.emit("join", { nickname: `Load${index}`, color: PLAYER_COLORS[index] }, () => resolve()))));
const prepareAndStart = async (): Promise<void> => {
  if (preparing) return;
  preparing = true;
  try {
    await Promise.all(clients.map((client) => new Promise<void>((resolve) => client.emit("setReady", true, () => resolve()))));
    await new Promise<void>((resolve, reject) => clients[0]!.emit("hostCommand", { token, command: "start" }, (result) => result.ok ? resolve() : reject(new Error(result.error))));
    starts += 1;
  } finally {
    preparing = false;
  }
};
clients[0]!.on("roomState", (room) => {
  if (room.phase === "lobby" && starts > 0) void prepareAndStart();
});
await prepareAndStart();
clients.forEach((client, index) => client.on("gameState", () => { snapshots[index] += 1; }));
const started = Date.now();
while (Date.now() - started < seconds * 1_000) {
  clients.forEach((client, index) => client.emit("playerInput", { seq: Math.floor((Date.now() - started) / SERVER_TICK_MS) + 1, moveX: Math.cos(index), moveY: Math.sin(index), aimX: Math.cos(index + 1), aimY: Math.sin(index + 1), firing: true }));
  await new Promise((resolve) => setTimeout(resolve, 33));
}
clients.forEach((client) => client.disconnect());
const summary = { url, seconds, clients: clients.length, starts, snapshots, minimumSnapshots: Math.min(...snapshots) };
const report = `${JSON.stringify(summary, null, 2)}\n`;
process.stdout.write(report);
if (reportPath) await writeFile(reportPath, report, "utf8");
if (summary.minimumSnapshots < Math.max(1, seconds * 10)) process.exitCode = 1;

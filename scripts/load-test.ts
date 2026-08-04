import { io } from "socket.io-client";
import { PLAYER_COLORS, SERVER_TICK_MS } from "../src/shared/constants";

const url = process.env.GAME_URL ?? "http://127.0.0.1:3000";
const token = process.env.HOST_TOKEN ?? "load-test-host-token";
const seconds = Number(process.env.LOAD_TEST_SECONDS ?? 10);
const clients = PLAYER_COLORS.map((color, index) => io(url, { transports: ["websocket"], forceNew: true, autoConnect: true }));
const snapshots = clients.map(() => 0);

await Promise.all(clients.map((client) => new Promise<void>((resolve, reject) => {
  client.once("connect", () => resolve());
  client.once("connect_error", reject);
})));
await Promise.all(clients.map((client, index) => new Promise<void>((resolve) => client.emit("join", { nickname: `Load${index}`, color: PLAYER_COLORS[index] }, () => { client.emit("setReady", true, () => resolve()); }))));
await new Promise<void>((resolve, reject) => clients[0]!.emit("hostCommand", { token, command: "start" }, (result) => result.ok ? resolve() : reject(new Error(result.error))));
clients.forEach((client, index) => client.on("gameState", () => { snapshots[index] += 1; }));
const started = Date.now();
while (Date.now() - started < seconds * 1_000) {
  clients.forEach((client, index) => client.emit("playerInput", { seq: Math.floor((Date.now() - started) / SERVER_TICK_MS) + 1, moveX: Math.cos(index), moveY: Math.sin(index), aimX: Math.cos(index + 1), aimY: Math.sin(index + 1), firing: true }));
  await new Promise((resolve) => setTimeout(resolve, 33));
}
clients.forEach((client) => client.disconnect());
const summary = { url, seconds, clients: clients.length, snapshots, minimumSnapshots: Math.min(...snapshots) };
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.minimumSnapshots < Math.max(1, seconds * 10)) process.exitCode = 1;

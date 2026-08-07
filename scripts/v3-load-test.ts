import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { io, type Socket } from "socket.io-client";

import { CHARACTER_CATALOG } from "../src/shared/character-catalog";
import { PLAYER_RADIUS, PROJECTILE_RADIUS, SERVER_TICK_MS, WALLS } from "../src/shared/constants";
import { circleHitsRect } from "../src/shared/math";
import type { Ack, ClientToServerEvents, GameSnapshot, HostAdminCommand, JoinResult, RoomSnapshot, ServerToClientEvents } from "../src/shared/protocol";

export const DEFAULT_LOAD_TEST_SECONDS = 600;
export const REQUIRED_MATCHES = 2;
export const CLIENT_COUNT = 6;

export interface LoadTestClientPlan {
  nickname: string;
  characterId: (typeof CHARACTER_CATALOG)[number]["id"];
}

export interface LoadTestPlan {
  durationSeconds: number;
  requiredMatches: number;
  clients: LoadTestClientPlan[];
}

export interface LoadTestReport {
  url: string;
  seconds: number;
  clients: number;
  starts: number;
  snapshots: number[];
  minimumSnapshots: number;
  skillActions: number;
  adminCommands: number;
  kicks: number;
  forcedWinners: number;
  wallViolations: number;
}

export interface LoadTestOptions {
  url?: string;
  token?: string;
  durationSeconds?: number;
  reportPath?: string;
  inputIntervalMs?: number;
}

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createLoadTestPlan(durationSeconds = DEFAULT_LOAD_TEST_SECONDS): LoadTestPlan {
  return {
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.floor(durationSeconds) : DEFAULT_LOAD_TEST_SECONDS,
    requiredMatches: REQUIRED_MATCHES,
    clients: CHARACTER_CATALOG.slice(0, CLIENT_COUNT).map((character, index) => ({
      nickname: `V3Load${index + 1}`,
      characterId: character.id,
    })),
  };
}

export function countWallViolations(snapshot: GameSnapshot): number {
  let violations = 0;
  for (const player of snapshot.players) {
    if (player.alive && WALLS.some((wall) => circleHitsRect(player, PLAYER_RADIUS, wall))) violations += 1;
  }
  for (const projectile of snapshot.projectiles) {
    if (WALLS.some((wall) => circleHitsRect(projectile, PROJECTILE_RADIUS, wall))) violations += 1;
  }
  return violations;
}

export function validateLoadTestReport(report: LoadTestReport): string[] {
  const errors: string[] = [];
  if (report.clients !== CLIENT_COUNT) errors.push("expected six clients");
  if (report.starts < REQUIRED_MATCHES) errors.push("expected two matches");
  if (report.minimumSnapshots < Math.max(10, report.seconds * 5)) errors.push("snapshot cadence too low");
  if (report.skillActions < 1) errors.push("skill actions were not exercised");
  if (report.adminCommands < 2 || report.kicks < 1 || report.forcedWinners < 2) errors.push("host admin commands were not fully exercised");
  if (report.wallViolations !== 0) errors.push(`wall safety violated ${report.wallViolations} times`);
  return errors;
}

export async function runLoadTest(options: LoadTestOptions = {}): Promise<LoadTestReport> {
  const plan = createLoadTestPlan(options.durationSeconds ?? readNumberEnv("LOAD_TEST_SECONDS", DEFAULT_LOAD_TEST_SECONDS));
  const url = options.url ?? process.env.GAME_URL ?? "http://127.0.0.1:3000";
  const token = options.token ?? process.env.HOST_TOKEN ?? "load-test-host-token";
  const inputIntervalMs = options.inputIntervalMs ?? 33;
  const clients = plan.clients.map(() => io(url, { transports: ["websocket"], forceNew: true }));
  const snapshots = clients.map(() => 0);
  const sessions: Array<JoinResult | null> = clients.map(() => null);
  let latestGame: GameSnapshot | undefined;
  let latestRoom: RoomSnapshot | undefined;
  let starts = 0;
  let skillActions = 0;
  let adminCommands = 0;
  let kicks = 0;
  let forcedWinners = 0;
  let wallViolations = 0;
  let sequence = 0;
  let skillSequence = 0;
  let firstWinnerCommanded = false;
  let secondWinnerCommanded = false;
  let kickCommanded = false;
  let startRequested = false;

  const acknowledge = <T>(socket: TestSocket, event: string, payload: unknown): Promise<Ack<T>> => new Promise((resolve) => {
    (socket.emit as unknown as (name: string, value: unknown, callback: (result: Ack<T>) => void) => void)(event, payload, resolve);
  });

  clients.forEach((client, index) => {
    client.on("roomState", (room) => { latestRoom = room; });
    client.on("gameState", (game) => {
      if (!game) {
        latestGame = undefined;
        return;
      }
      latestGame = game;
      snapshots[index] = (snapshots[index] ?? 0) + 1;
      wallViolations += countWallViolations(game);
    });
  });

  try {
    await Promise.all(clients.map((client) => waitForConnect(client)));
    await Promise.all(clients.map(async (client, index) => {
      const result = await acknowledge<JoinResult>(client, "join", plan.clients[index]);
      if (result.ok && result.data) sessions[index] = result.data;
      else throw new Error(result.error ?? `client ${index + 1} failed to join`);
    }));
    await prepareAndStart(clients, token, acknowledge, () => { starts += 1; });
    const startedAt = Date.now();
    const finalAdminAt = Math.max(15_000, plan.durationSeconds * 1_000 - 20_000);
    const restartDeadline = plan.durationSeconds * 1_000 - 5_000;
    let lastInputAt = 0;
    let lastSkillAt = 0;
    while (Date.now() - startedAt < plan.durationSeconds * 1_000) {
      const elapsed = Date.now() - startedAt;
      if (elapsed - lastInputAt >= inputIntervalMs) {
        lastInputAt = elapsed;
        sequence += 1;
        clients.forEach((client, index) => {
          if (!client.connected || !sessions[index]) return;
          const target = latestGame?.skillOrbs[0] ?? latestGame?.energy[0];
          const player = latestGame?.players.find((candidate) => candidate.id === sessions[index]?.playerId);
          const dx = target && player ? target.x - player.x : Math.cos(index * 1.3);
          const dy = target && player ? target.y - player.y : Math.sin(index * 1.3);
          const length = Math.hypot(dx, dy) || 1;
          client.emit("playerInput", { seq: sequence, moveX: dx / length, moveY: dy / length, aimX: -dy / length, aimY: dx / length, firing: true });
        });
      }
      if (latestRoom?.phase === "playing" || latestRoom?.phase === "overtime" || latestGame?.phase === "playing" || latestGame?.phase === "overtime") {
        if (elapsed - lastSkillAt >= 900) {
          lastSkillAt = elapsed;
          skillSequence += 1;
          clients.forEach((client) => {
            if (client.connected) {
              client.emit("useSkill", { skillActionSeq: skillSequence });
              skillActions += 1;
            }
          });
        }
        if (!firstWinnerCommanded && starts === 1 && elapsed >= 5_000) {
          await sendAdmin(clients[0]!, token, { type: "forceWinner", playerId: sessions[0]!.playerId }, acknowledge);
          firstWinnerCommanded = true;
          forcedWinners += 1;
          adminCommands += 1;
        }
        if (starts >= 2 && !kickCommanded && elapsed >= finalAdminAt && sessions[5]) {
          await sendAdmin(clients[0]!, token, { type: "kick", playerId: sessions[5]!.playerId }, acknowledge);
          kickCommanded = true;
          kicks += 1;
          adminCommands += 1;
        }
        if (starts >= 2 && kickCommanded && !secondWinnerCommanded && elapsed >= finalAdminAt && sessions[0]) {
          await sendAdmin(clients[0]!, token, { type: "forceWinner", playerId: sessions[0]!.playerId }, acknowledge);
          secondWinnerCommanded = true;
          forcedWinners += 1;
          adminCommands += 1;
        }
      } else if (latestRoom?.phase === "lobby" && starts >= 1 && firstWinnerCommanded && !secondWinnerCommanded && elapsed < restartDeadline && !startRequested) {
        startRequested = true;
        const activeClients = clients.filter((client) => client.connected);
        await prepareAndStart(activeClients, token, acknowledge, () => { starts += 1; });
        startRequested = false;
      }
      await delay(Math.min(inputIntervalMs, 50));
    }
  } finally {
    clients.forEach((client) => client.disconnect());
  }

  const report: LoadTestReport = {
    url,
    seconds: plan.durationSeconds,
    clients: clients.length,
    starts,
    snapshots,
    minimumSnapshots: Math.min(...snapshots),
    skillActions,
    adminCommands,
    kicks,
    forcedWinners,
    wallViolations,
  };
  if (options.reportPath) await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function prepareAndStart(
  clients: TestSocket[],
  token: string,
  acknowledge: <T>(socket: TestSocket, event: string, payload: unknown) => Promise<Ack<T>>,
  onStarted: () => void,
): Promise<void> {
  await Promise.all(clients.map((client) => acknowledge(client, "setReady", true)));
  const result = await acknowledge(clients[0]!, "hostCommand", { token, command: "start" });
  if (!result.ok) throw new Error(result.error ?? "failed to start match");
  onStarted();
}

async function sendAdmin(
  host: TestSocket,
  token: string,
  command: HostAdminCommand,
  acknowledge: <T>(socket: TestSocket, event: string, payload: unknown) => Promise<Ack<T>>,
): Promise<void> {
  const result = await acknowledge(host, "hostAdminCommand", { token, command });
  if (!result.ok) throw new Error(result.error ?? `host command ${command.type} failed`);
}

function waitForConnect(client: TestSocket): Promise<void> {
  if (client.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", reject);
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runLoadTest({ reportPath: process.env.LOAD_TEST_REPORT?.trim() || undefined });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const errors = validateLoadTestReport(report);
  if (errors.length > 0) {
    process.stderr.write(`${errors.join("; ")}\n`);
    process.exitCode = 1;
  }
}

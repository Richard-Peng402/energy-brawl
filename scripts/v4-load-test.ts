import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { CHARACTER_CATALOG } from "../src/shared/character-catalog";
import { PLAYER_RADIUS, PROJECTILE_RADIUS, SERVER_TICK_MS, WALLS } from "../src/shared/constants";
import { circleHitsRect } from "../src/shared/math";
import type { MatchMode } from "../src/shared/mode-catalog";
import { GameRoom } from "../src/server/room";

export type V4LoadMode = Extract<MatchMode, "team3v3" | "domination3v3" | "domination2v2v2">;
export interface V4LoadReport { clients: number; mode: V4LoadMode; simulatedSeconds: number; ticks: number; exclusiveSkillRequests: number; stepP95Ms: number; wallViolations: number; capturePointObserved: boolean; finished: boolean; }

export function runV4LoadSimulation(simulatedSeconds = 60, mode: V4LoadMode = "team3v3"): V4LoadReport {
  const room = new GameRoom();
  room.setMatchMode(mode);
  const sockets = CHARACTER_CATALOG.map((character, index) => `load-${index + 1}`);
  for (let index = 0; index < sockets.length; index += 1) {
    room.joinHuman(sockets[index]!, { nickname: `V4Load${index + 1}`, characterId: CHARACTER_CATALOG[index]!.id });
    room.setReady(sockets[index]!, true);
  }
  if (!room.startMatch().ok) throw new Error("load match failed to start");
  const durations: number[] = [];
  let wallViolations = 0;
  let exclusiveSkillRequests = 0;
  let capturePointObserved = false;
  const ticks = Math.ceil(simulatedSeconds * 1_000 / SERVER_TICK_MS);
  for (let tick = 1; tick <= ticks; tick += 1) {
    sockets.forEach((socketId, index) => {
      const angle = tick * 0.012 + index * Math.PI / 3;
      room.handleInput(socketId, { seq: tick, moveX: Math.cos(angle), moveY: Math.sin(angle), aimX: Math.cos(angle + 1.1), aimY: Math.sin(angle + 1.1), firing: true });
      if (tick % 600 === 1) {
        exclusiveSkillRequests += Number(room.handleExclusiveSkillAction(socketId, { skillActionSeq: Math.floor(tick / 600) + 1, directionX: Math.cos(angle), directionY: Math.sin(angle) }));
      }
    });
    const started = performance.now();
    room.tick(SERVER_TICK_MS);
    durations.push(performance.now() - started);
    const snapshot = room.gameSnapshot();
    if (!snapshot) continue;
    capturePointObserved ||= snapshot.capturePoint !== null && snapshot.capturePoint !== undefined;
    for (const player of snapshot.players) if (player.alive && WALLS.some((wall) => circleHitsRect(player, PLAYER_RADIUS, wall))) wallViolations += 1;
    for (const projectile of snapshot.projectiles) if (WALLS.some((wall) => circleHitsRect(projectile, PROJECTILE_RADIUS, wall))) wallViolations += 1;
  }
  durations.sort((a, b) => a - b);
  return { clients: sockets.length, mode, simulatedSeconds, ticks, exclusiveSkillRequests, stepP95Ms: durations[Math.ceil(durations.length * 0.95) - 1] ?? 0, wallViolations, capturePointObserved, finished: room.gameSnapshot()?.phase === "finished" };
}

export function validateV4LoadReport(report: V4LoadReport): string[] {
  const errors: string[] = [];
  if (report.clients !== 6) errors.push("expected six clients");
  if (!["team3v3", "domination3v3", "domination2v2v2"].includes(report.mode)) errors.push("unsupported load mode");
  if (report.mode.startsWith("domination") && !report.capturePointObserved) errors.push("capture point state was not observed");
  if (report.exclusiveSkillRequests < 6) errors.push("exclusive skills were not exercised");
  if (report.wallViolations !== 0) errors.push(`wall violations: ${report.wallViolations}`);
  if (report.stepP95Ms > SERVER_TICK_MS) errors.push(`server step p95 too high: ${report.stepP95Ms.toFixed(2)}ms`);
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const seconds = Number(process.env.V4_LOAD_SECONDS ?? 60);
  const reports = (["team3v3", "domination3v3", "domination2v2v2"] as const).map((mode) => runV4LoadSimulation(seconds, mode));
  const errors = reports.flatMap((report) => validateV4LoadReport(report).map((error) => `${report.mode}: ${error}`));
  console.log(JSON.stringify(reports, null, 2));
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
}

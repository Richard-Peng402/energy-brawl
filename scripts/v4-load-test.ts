import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { CHARACTER_CATALOG } from "../src/shared/character-catalog";
import { PLAYER_RADIUS, PROJECTILE_RADIUS, SERVER_TICK_MS } from "../src/shared/constants";
import { getMapDefinition, type MapId } from "../src/shared/map-catalog";
import { getMapMechanicDefinition, zoneBounds, zoneContainsPoint } from "../src/shared/map-mechanics";
import { circleHitsRect } from "../src/shared/math";
import type { MatchMode } from "../src/shared/mode-catalog";
import { GameRoom } from "../src/server/room";

export type V4LoadMode = MatchMode;
export interface V4LoadOptions { mapMechanicsEnabled?: boolean; }
export interface V4LoadReport {
  clients: number;
  mode: V4LoadMode;
  mapId: MapId;
  mapMechanicsEnabled: boolean;
  simulatedSeconds: number;
  ticks: number;
  exclusiveSkillRequests: number;
  stepP95Ms: number;
  wallViolations: number;
  capturePointObserved: boolean;
  staleCombatStates: number;
  mechanicWarnings: number;
  mechanicActivations: number;
  illegalZoneOverlaps: number;
  expiredMapStates: number;
  postFinishApplications: number;
  snapshotBytesP95: number;
  finished: boolean;
}

export function runV4LoadSimulation(
  simulatedSeconds = 60,
  mode: V4LoadMode = "team3v3",
  mapId: MapId = "reactor-core",
  options: V4LoadOptions = {},
): V4LoadReport {
  const room = new GameRoom();
  const mapMechanicsEnabled = options.mapMechanicsEnabled ?? true;
  room.setMatchMode(mode);
  room.setMapSelection(mapId);
  room.setMapMechanicsEnabled(mapMechanicsEnabled);
  const map = getMapDefinition(mapId);
  const walls = map.walls;
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
  let staleCombatStates = 0;
  let mechanicWarnings = 0;
  let mechanicActivations = 0;
  let expiredMapStates = 0;
  let postFinishApplications = 0;
  let finished = false;
  let lastMechanicRevision = "";
  const snapshotBytes: number[] = [];
  const illegalZoneOverlaps = countIllegalZoneOverlaps(mapId);
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
    snapshotBytes.push(Buffer.byteLength(JSON.stringify(snapshot), "utf8"));
    capturePointObserved ||= snapshot.capturePoint !== null && snapshot.capturePoint !== undefined;
    finished ||= snapshot.phase === "finished";
    const mechanic = snapshot.mapMechanic;
    const mechanicRevision = mechanic ? `${mechanic.round}:${mechanic.phase}:${mechanic.zoneIndex}` : "";
    if (mechanicRevision && mechanicRevision !== lastMechanicRevision) {
      if (mechanic?.phase === "warning") mechanicWarnings += 1;
      if (mechanic?.phase === "active") mechanicActivations += 1;
      lastMechanicRevision = mechanicRevision;
    }
    for (const player of snapshot.players) {
      if (player.alive && walls.some((wall) => circleHitsRect(player, PLAYER_RADIUS, wall))) wallViolations += 1;
      staleCombatStates += (player.combatStates ?? []).filter((state) => state.expiresAt <= snapshot.serverTime).length;
      expiredMapStates += (player.combatStates ?? []).filter((state) => (state.id === "neon-overdrive" || state.id === "crystal-resonance") && state.expiresAt <= snapshot.serverTime).length;
      if (snapshot.finishedAt !== null) {
        postFinishApplications += (player.combatStates ?? []).filter((state) =>
          (state.id === "neon-overdrive" || state.id === "crystal-resonance") && state.startedAt > snapshot.finishedAt!,
        ).length;
      }
    }
    if (snapshot.finishedAt !== null && snapshot.mapMechanic !== null && snapshot.mapMechanic !== undefined) postFinishApplications += 1;
    for (const projectile of snapshot.projectiles) if (walls.some((wall) => circleHitsRect(projectile, PROJECTILE_RADIUS, wall))) wallViolations += 1;
  }
  durations.sort((a, b) => a - b);
  snapshotBytes.sort((a, b) => a - b);
  return {
    clients: sockets.length,
    mode,
    mapId,
    mapMechanicsEnabled,
    simulatedSeconds,
    ticks,
    exclusiveSkillRequests,
    stepP95Ms: percentile95(durations),
    wallViolations,
    capturePointObserved,
    staleCombatStates,
    mechanicWarnings,
    mechanicActivations,
    illegalZoneOverlaps,
    expiredMapStates,
    postFinishApplications,
    snapshotBytesP95: percentile95(snapshotBytes),
    finished,
  };
}

export function validateV4LoadReport(report: V4LoadReport): string[] {
  const errors: string[] = [];
  if (report.clients !== 6) errors.push("expected six clients");
  if (!["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2"].includes(report.mode)) errors.push("unsupported load mode");
  if (!["reactor-core", "neon-docks", "crystal-ruins"].includes(report.mapId)) errors.push("unsupported map");
  if (report.mode.startsWith("domination") && !report.capturePointObserved) errors.push("capture point state was not observed");
  if (report.exclusiveSkillRequests < 6) errors.push("exclusive skills were not exercised");
  if (report.wallViolations !== 0) errors.push(`wall violations: ${report.wallViolations}`);
  if (report.staleCombatStates !== 0) errors.push(`stale combat states: ${report.staleCombatStates}`);
  if (report.illegalZoneOverlaps !== 0) errors.push(`illegal zone overlaps: ${report.illegalZoneOverlaps}`);
  if (report.expiredMapStates !== 0) errors.push(`expired map states: ${report.expiredMapStates}`);
  if (report.postFinishApplications !== 0) errors.push(`post-finish map applications: ${report.postFinishApplications}`);
  if (report.mapMechanicsEnabled && report.simulatedSeconds >= 60 && report.mechanicWarnings < 2) errors.push("fewer than two mechanic warnings observed");
  if (report.mapMechanicsEnabled && report.simulatedSeconds >= 60 && report.mechanicActivations < 2) errors.push("fewer than two mechanic activations observed");
  if (!report.mapMechanicsEnabled && (report.mechanicWarnings !== 0 || report.mechanicActivations !== 0)) errors.push("disabled mechanics produced events");
  if (report.snapshotBytesP95 <= 0 || report.snapshotBytesP95 > 256 * 1_024) errors.push(`snapshot p95 out of bounds: ${report.snapshotBytesP95}`);
  if (report.stepP95Ms > SERVER_TICK_MS) errors.push(`server step p95 too high: ${report.stepP95Ms.toFixed(2)}ms`);
  return errors;
}

function countIllegalZoneOverlaps(mapId: MapId): number {
  const map = getMapDefinition(mapId);
  const definition = getMapMechanicDefinition(mapId);
  const anchors = [...map.spawnPoints, ...map.energySpawnPoints, ...map.skillOrbSpawnPoints];
  let overlaps = 0;
  for (const zone of definition.zones) {
    const padding = mapId === "reactor-core" ? 0 : PLAYER_RADIUS + 36;
    overlaps += anchors.filter((point) => zoneContainsPoint(zone, point, padding)).length;
    if (mapId !== "reactor-core") {
      overlaps += map.walls.filter((wall) => zone.kind === "circle"
        ? circleHitsRect(zone, zone.radius, wall)
        : rectanglesOverlap(zoneBounds(zone), wall)).length;
    }
  }
  return overlaps;
}

function rectanglesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function percentile95(values: readonly number[]): number {
  return values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const seconds = Number(process.env.V4_LOAD_SECONDS ?? 60);
  const reports = (["reactor-core", "neon-docks", "crystal-ruins"] as const).flatMap((mapId) =>
    (["solo", "team3v3", "team2v2v2", "domination3v3", "domination2v2v2"] as const).flatMap((mode) =>
      [true, false].map((mapMechanicsEnabled) => runV4LoadSimulation(seconds, mode, mapId, { mapMechanicsEnabled })),
    ),
  );
  const errors = reports.flatMap((report) => validateV4LoadReport(report).map((error) => `${report.mapId}/${report.mode}/${report.mapMechanicsEnabled}: ${error}`));
  console.log(JSON.stringify(reports, null, 2));
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
}

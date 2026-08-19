import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { io } from "socket.io-client";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "artifacts", "map-visual-smoke");
const profileRoot = path.join(outputRoot, "edge-profile");
const argument = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const baseUrl = argument("url") ?? process.env.MAP_SMOKE_URL ?? "http://127.0.0.1:3001";
const hostToken = argument("token") ?? process.env.MAP_SMOKE_HOST_TOKEN;
const eliminationOnly = argument("elimination-only") === "true";
const edgePath = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.MAP_SMOKE_DEBUG_PORT ?? 9331);

if (!hostToken) throw new Error("Pass --token=<host token> or set MAP_SMOKE_HOST_TOKEN");

const devices = [
  { id: "desktop", width: 1_536, height: 864, dpr: 1, mobile: false },
  { id: "iphone-landscape", width: 932, height: 430, dpr: 3, mobile: true },
  { id: "ipad-landscape", width: 1_180, height: 820, dpr: 2, mobile: true },
];
const maps = ["reactor-core", "neon-docks", "crystal-ruins"];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitFor = async (check, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await wait(100);
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
};

const connectSocket = async () => {
  const socket = io(baseUrl, { transports: ["websocket"] });
  await waitFor(() => socket.connected);
  return socket;
};
const acknowledge = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(profileRoot, { recursive: true });

const nickname = `视觉验收${Date.now().toString().slice(-5)}`;

const edge = spawn(edgePath, [
  "--headless=new",
  "--hide-scrollbars",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileRoot}`,
  "about:blank",
], { stdio: "ignore" });

let cdp;
const hostSocket = await connectSocket();
let latestRoom = null;
let latestGame = null;
hostSocket.on("roomState", (snapshot) => { latestRoom = snapshot; });
hostSocket.on("gameState", (snapshot) => { latestGame = snapshot; });
try {
  const targets = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (!response.ok) return null;
      const entries = await response.json();
      return entries.find((entry) => entry.type === "page") ? entries : null;
    } catch {
      return null;
    }
  });
  const page = targets.find((entry) => entry.type === "page");
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const evaluate = async (expression) => {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true });
    return result.result.value;
  };
  const setDevice = async (device) => {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: device.width,
      height: device.height,
      deviceScaleFactor: device.dpr,
      mobile: device.mobile,
      screenOrientation: { type: "landscapePrimary", angle: 90 },
    });
    await wait(350);
  };
  const captureViewportState = async ({ stateId, mapId = null, requiredSelector, expectCanvas = false, eventPhase = null, targetDevices = devices }) => {
    const entries = [];
    for (const device of targetDevices) {
      await setDevice(device);
      await evaluate(`(() => {
        const target = document.querySelector(${JSON.stringify(requiredSelector)});
        target?.scrollIntoView({ block: "center", inline: "nearest" });
        return Boolean(target);
      })()`);
      await wait(120);
      const diagnostics = await evaluate(`(() => {
        const visible = (element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
        };
        const rectFor = (selector) => {
          const element = document.querySelector(selector);
          if (!visible(element)) return null;
          const rect = element.getBoundingClientRect();
          return { selector, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const canvas = document.querySelector('#game-root canvas');
        const canvasRect = visible(canvas) ? canvas.getBoundingClientRect() : null;
        return {
          title: document.title,
          viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
          overflow: {
            document: document.documentElement.scrollWidth - innerWidth,
            body: document.body.scrollWidth - innerWidth,
          },
          required: rectFor(${JSON.stringify(requiredSelector)}),
          canvas: canvas && canvasRect ? {
            width: canvas.width,
            height: canvas.height,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
            dpr: devicePixelRatio,
            rect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
          } : null,
          controls: [
            rectFor('#exclusive-skill-button'),
            rectFor('#skill-button'),
            rectFor('#move-stick'),
            rectFor('#aim-stick'),
          ].filter(Boolean),
        };
      })()`);
      if (!diagnostics.required) throw new Error(`Required visual state is not visible for ${stateId} ${device.id}: ${requiredSelector}`);
      if (diagnostics.required.left < -1 || diagnostics.required.top < -1 || diagnostics.required.right > diagnostics.viewport.width + 1 || diagnostics.required.bottom > diagnostics.viewport.height + 1) {
        throw new Error(`Required visual state is clipped for ${stateId} ${device.id}: ${JSON.stringify(diagnostics.required)}`);
      }
      if (diagnostics.overflow.document > 1 || diagnostics.overflow.body > 1) {
        throw new Error(`Horizontal overflow for ${stateId} ${device.id}: ${JSON.stringify(diagnostics.overflow)}`);
      }

      const eventAtCapture = latestGame?.mapEvent ? structuredClone(latestGame.mapEvent) : null;
      const eventGeometry = eventAtCapture?.point ?? eventAtCapture?.zone;
      if (expectCanvas && eventPhase && eventAtCapture?.kind !== "global-scan" && !eventGeometry) {
        throw new Error(`Event boundary assertion failed for ${stateId} ${device.id}`);
      }
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      let canvasPngBytes = null;
      if (expectCanvas) {
        const metrics = diagnostics.canvas;
        if (!metrics) throw new Error(`Missing canvas for ${stateId} ${device.id}`);
        if (Math.abs(metrics.width - metrics.clientWidth * metrics.dpr) > 2 || Math.abs(metrics.height - metrics.clientHeight * metrics.dpr) > 2) {
          throw new Error(`HiDPI mismatch for ${stateId} ${device.id}: ${JSON.stringify(metrics)}`);
        }
        const clipped = await cdp.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
          captureBeyondViewport: false,
          clip: {
            x: Math.max(0, metrics.rect.left),
            y: Math.max(0, metrics.rect.top),
            width: Math.max(1, Math.min(metrics.rect.width, diagnostics.viewport.width - Math.max(0, metrics.rect.left))),
            height: Math.max(1, Math.min(metrics.rect.height, diagnostics.viewport.height - Math.max(0, metrics.rect.top))),
            scale: 1,
          },
        });
        canvasPngBytes = Buffer.from(clipped.data, "base64").byteLength;
        if (canvasPngBytes < 4_096) throw new Error(`Nonblank canvas assertion failed for ${stateId} ${device.id}: ${canvasPngBytes} PNG bytes`);

        for (const control of diagnostics.controls) {
          if (control.left < -1 || control.top < -1 || control.right > diagnostics.viewport.width + 1 || control.bottom > diagnostics.viewport.height + 1) {
            throw new Error(`Control boundary is clipped for ${stateId} ${device.id}: ${JSON.stringify(control)}`);
          }
        }
        for (let leftIndex = 0; leftIndex < diagnostics.controls.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < diagnostics.controls.length; rightIndex += 1) {
            const left = diagnostics.controls[leftIndex];
            const right = diagnostics.controls[rightIndex];
            const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
            const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
            if (overlapWidth > 8 && overlapHeight > 8) {
              throw new Error(`Control overlap for ${stateId} ${device.id}: ${left.selector} and ${right.selector}`);
            }
          }
        }
      }

      const file = path.join(outputRoot, `${stateId}-${device.id}.png`);
      await writeFile(file, Buffer.from(screenshot.data, "base64"));
      entries.push({
        stateId,
        mapId,
        eventPhase,
        observedEventPhase: eventAtCapture?.phase ?? null,
        eventKind: eventAtCapture?.kind ?? null,
        eventGeometry: eventGeometry ?? null,
        device: device.id,
        file,
        viewport: diagnostics.viewport,
        canvas: diagnostics.canvas,
        canvasPngBytes,
      });
    }
    return entries;
  };
  const waitForGameState = async (predicate, timeoutMs) => waitFor(() => {
    if (latestGame?.phase === "finished" && !predicate(latestGame)) throw new Error("Match finished before the requested smoke state appeared");
    return latestGame && predicate(latestGame) ? latestGame : null;
  }, timeoutMs);
  const stabilizeMatch = async () => {
    const game = await waitForGameState((snapshot) => snapshot.phase === "playing" || snapshot.phase === "overtime", 15_000);
    const commands = game.players.flatMap((player) => [
      { type: "setStat", playerId: player.id, stat: "maxHealth", value: 500 },
      { type: "setStat", playerId: player.id, stat: "health", value: 500 },
      { type: "setStat", playerId: player.id, stat: "damage", value: 0 },
      { type: "setStat", playerId: player.id, stat: "fireCooldownMs", value: 2_000 },
    ]);
    const results = await Promise.all(commands.map((command) => acknowledge(hostSocket, "hostAdminCommand", { token: hostToken, command })));
    const failure = results.find((result) => !result?.ok);
    if (failure) throw new Error(failure.error ?? "Could not stabilize visual smoke match");
  };
  const ensureHighlightFixture = async () => evaluate(`(() => {
    const root = document.querySelector('#result-highlights');
    if (!root) return false;
    if (root.querySelector('.match-highlight-card')) return false;
    root.innerHTML = '<section class="match-highlights" aria-label="&#26412;&#23616;&#39640;&#20809;"><article class="match-highlight-card" data-highlight-kind="five-kill-streak"><div class="match-highlight-portrait"><span class="match-highlight-fallback" aria-hidden="true">Q</span></div><div><span>&#28779;&#21147;&#32479;&#27835;</span><b>Visual QA</b><small>5 &#36830;&#26432;</small></div></article></section>';
    return true;
  })()`);
  const ensureReady = async () => {
    const alreadyReady = await evaluate(`(() => {
      const button = document.querySelector('#ready-button');
      return Boolean(button && button.classList.contains("is-ready"));
    })()`);
    if (alreadyReady) return;

    const selected = await evaluate(`(() => {
      const character = document.querySelector('[data-character-id]:not(:disabled)');
      if (!character) return false;
      character.click();
      return true;
    })()`);
    if (!selected) throw new Error("No character is available for the visual smoke player");
    await waitFor(() => evaluate(`(() => {
      const button = document.querySelector('#ready-button');
      return Boolean(button && !button.disabled);
    })()`));

    const clicked = await evaluate(`(() => {
      const button = document.querySelector('#ready-button');
      if (!button || button.disabled || button.classList.contains("is-ready")) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) throw new Error("Could not click the ready button");
    try {
      await waitFor(() => evaluate(`(() => {
        const button = document.querySelector('#ready-button');
        return Boolean(button && button.classList.contains("is-ready"));
      })()`));
    } catch (error) {
      const diagnostics = await evaluate(`(() => {
        const button = document.querySelector('#ready-button');
        const selected = document.querySelector('[data-character-id][aria-pressed="true"]');
        return {
          button: button ? { className: button.className, disabled: button.disabled, text: button.textContent } : null,
          selectedCharacter: selected?.getAttribute('data-character-id') ?? null,
          availableCharacters: [...document.querySelectorAll('[data-character-id]:not(:disabled)')]
            .map((character) => character.getAttribute('data-character-id')),
          connection: document.querySelector('#connection-status')?.textContent ?? null,
          toast: document.querySelector('#toast')?.textContent ?? null,
          pageText: document.body.innerText.slice(-800),
        };
      })()`);
      throw new Error(`Ready was not confirmed: ${JSON.stringify(diagnostics)}`, { cause: error });
    }
  };
  await cdp.send("Page.navigate", { url: `${baseUrl}/` });
  await waitFor(async () => {
    const result = await cdp.send("Runtime.evaluate", { expression: "Boolean(document.querySelector('#join-form'))", returnByValue: true });
    return result.result.value;
  });
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const form = document.querySelector('#join-form');
      const input = document.querySelector('#nickname');
      if (!form || !input) return false;
      input.value = ${JSON.stringify(nickname)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      return true;
    })()`,
    returnByValue: true,
  });
  await waitFor(async () => {
    const result = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const button = document.querySelector('#ready-button');
        return Boolean(button && !button.classList.contains('is-hidden'));
      })()`,
      returnByValue: true,
    });
    return result.result.value;
  });

  await waitFor(() => evaluate("Boolean(document.querySelector('#character-detail [data-tactical-module-id]'))"));
  const report = await captureViewportState({
    stateId: "lobby-tactical-modules",
    requiredSelector: "#character-detail [data-tactical-module-id]",
  });

  let capturedResults = false;
  if (!eliminationOnly) for (const mapId of maps) {
    for (const device of devices) {
      await setDevice(device);
      await ensureReady();
      await wait(250);

      const mapResult = await acknowledge(hostSocket, "hostAdminCommand", { token: hostToken, command: { type: "setMap", mapSelection: mapId } });
      if (!mapResult?.ok) throw new Error(mapResult?.error ?? `Could not select ${mapId}`);
      const startResult = await acknowledge(hostSocket, "hostCommand", { token: hostToken, command: "start" });
      if (!startResult?.ok) throw new Error(startResult?.error ?? `Could not start ${mapId}`);

      await stabilizeMatch();
      await waitFor(async () => {
        const result = await cdp.send("Runtime.evaluate", {
          expression: "Boolean(document.querySelector('#arena-screen:not(.is-hidden) canvas'))",
          returnByValue: true,
        });
        return result.result.value;
      }, 15_000);
      await wait(600);

      await waitForGameState(
        (snapshot) => snapshot.mapId === mapId && snapshot.mapEvent?.phase === "warning",
        70_000,
      );
      const warningEntries = await captureViewportState({
        stateId: `${mapId}-event-warning`,
        mapId,
        requiredSelector: "#map-event-status.is-visible",
        expectCanvas: true,
        eventPhase: "warning",
        targetDevices: [device],
      });
      if (warningEntries.some((entry) => entry.observedEventPhase !== "warning")) {
        throw new Error(`Event warning changed phase during capture for ${mapId} ${device.id}`);
      }
      report.push(...warningEntries);

      await waitForGameState(
        (snapshot) => snapshot.mapId === mapId && snapshot.mapEvent?.phase === "active",
        10_000,
      );
      const activeEntries = await captureViewportState({
        stateId: `${mapId}-event-active`,
        mapId,
        requiredSelector: "#map-event-status.is-visible",
        expectCanvas: true,
        eventPhase: "active",
        targetDevices: [device],
      });
      if (activeEntries.some((entry) => entry.observedEventPhase !== "active")) {
        throw new Error(`Event active state changed phase during capture for ${mapId} ${device.id}`);
      }
      report.push(...activeEntries);

      const endResult = await acknowledge(hostSocket, "hostCommand", { token: hostToken, command: "end" });
      if (!endResult?.ok) throw new Error(endResult?.error ?? `Could not finish ${mapId}`);
      await waitForGameState((snapshot) => snapshot.phase === "finished", 10_000);
      await waitFor(() => evaluate("Boolean(document.querySelector('#results-overlay:not(.is-hidden)'))"));

      if (!capturedResults) {
        const fixtureInjected = await ensureHighlightFixture();
        const resultEntries = await captureViewportState({
          stateId: "results-highlights",
          mapId,
          requiredSelector: "#result-highlights .match-highlight-card",
        });
        for (const entry of resultEntries) entry.fixtureInjected = fixtureInjected;
        report.push(...resultEntries);
        capturedResults = true;
      }

      const resetResult = await acknowledge(hostSocket, "hostCommand", { token: hostToken, command: "reset" });
      if (!resetResult?.ok) throw new Error(resetResult?.error ?? `Could not reset ${mapId}`);
      await waitFor(() => latestRoom?.phase === "lobby");
      await wait(350);
    }
  }

  const eliminationMode = await acknowledge(hostSocket, "hostAdminCommand", {
    token: hostToken,
    command: { type: "setMode", mode: "teamElimination3v3" },
  });
  if (!eliminationMode?.ok) throw new Error(eliminationMode?.error ?? "Could not select team elimination mode");
  const eliminationMap = await acknowledge(hostSocket, "hostAdminCommand", {
    token: hostToken,
    command: { type: "setMap", mapSelection: "reactor-core" },
  });
  if (!eliminationMap?.ok) throw new Error(eliminationMap?.error ?? "Could not select elimination smoke map");
  const eliminationPreset = await acknowledge(hostSocket, "hostAdminCommand", {
    token: hostToken,
    command: {
      type: "applyRoomPreset",
      preset: {
        schemaVersion: 1,
        id: "visual-elimination-preset",
        name: "Visual Elimination QA",
        updatedAt: Date.now(),
        matchMode: "teamElimination3v3",
        mapSelection: "reactor-core",
        mapMechanicsEnabled: true,
        mapEventsEnabled: false,
        botDifficulty: "normal",
        eliminationRules: { maxScoredRounds: 7, prepMs: 5_000, liveMs: 20_000, overtimeMs: 5_000, decisiveMs: 15_000 },
        characterOverrides: {},
      },
    },
  });
  if (!eliminationPreset?.ok) throw new Error(eliminationPreset?.error ?? "Could not configure elimination smoke rules");
  await ensureReady();
  const eliminationStart = await acknowledge(hostSocket, "hostCommand", { token: hostToken, command: "start" });
  if (!eliminationStart?.ok) throw new Error(eliminationStart?.error ?? "Could not start elimination smoke match");
  await stabilizeMatch();
  const eliminationLive = await waitForGameState((snapshot) => snapshot.elimination?.phase === "live", 15_000);
  const eliminationEntries = await captureViewportState({
    stateId: "team-elimination-hud",
    mapId: "reactor-core",
    requiredSelector: "#elimination-hud:not(.is-hidden)",
    expectCanvas: true,
  });
  for (const entry of eliminationEntries) {
    entry.observedRoundPhase = eliminationLive.elimination?.phase ?? null;
    entry.roundScores = eliminationLive.elimination?.roundScores ?? [];
  }
  report.push(...eliminationEntries);

  const localPlayerId = eliminationLive.players.find((player) => !player.isBot)?.id;
  if (!localPlayerId) throw new Error("Could not identify the local smoke player in team elimination");
  const enemyBots = eliminationLive.players.filter((player) => player.isBot && player.teamId !== eliminationLive.players.find((candidate) => candidate.id === localPlayerId)?.teamId);
  const alliedBots = eliminationLive.players.filter((player) => player.isBot && player.teamId === eliminationLive.players.find((candidate) => candidate.id === localPlayerId)?.teamId);
  const spectatorFixtureCommands = [
    { type: "setStat", playerId: localPlayerId, stat: "maxHealth", value: 500 },
    { type: "setStat", playerId: localPlayerId, stat: "health", value: 0 },
    ...alliedBots.flatMap((player) => [
      { type: "setStat", playerId: player.id, stat: "maxHealth", value: 500 },
      { type: "setStat", playerId: player.id, stat: "health", value: 500 },
      { type: "setStat", playerId: player.id, stat: "damage", value: 0 },
    ]),
    ...enemyBots.flatMap((player) => [
      { type: "setStat", playerId: player.id, stat: "damage", value: 200 },
      { type: "setStat", playerId: player.id, stat: "fireCooldownMs", value: 100 },
      { type: "setStat", playerId: player.id, stat: "moveSpeed", value: 600 },
      { type: "setStat", playerId: player.id, stat: "projectileSpeed", value: 2_000 },
    ]),
  ];
  const fixtureResults = await Promise.all(spectatorFixtureCommands.map((command) => acknowledge(hostSocket, "hostAdminCommand", { token: hostToken, command })));
  const fixtureFailure = fixtureResults.find((result) => !result?.ok);
  if (fixtureFailure) throw new Error(fixtureFailure.error ?? "Could not prepare team elimination spectator fixture");
  const spectatorState = await waitForGameState(
    (snapshot) => snapshot.elimination?.phase !== "result" && snapshot.players.find((player) => player.id === localPlayerId)?.alive === false,
    15_000,
  );
  const stopEnemyResults = await Promise.all(enemyBots.map((player) => acknowledge(hostSocket, "hostAdminCommand", { token: hostToken, command: { type: "setStat", playerId: player.id, stat: "damage", value: 0 } })));
  const stopEnemyFailure = stopEnemyResults.find((result) => !result?.ok);
  if (stopEnemyFailure) throw new Error(stopEnemyFailure.error ?? "Could not stabilize team elimination spectator state");
  const spectatorEntries = await captureViewportState({
    stateId: "team-elimination-spectator",
    mapId: "reactor-core",
    requiredSelector: "#elimination-spectator:not(.is-hidden)",
    expectCanvas: true,
  });
  for (const entry of spectatorEntries) {
    entry.observedRoundPhase = spectatorState.elimination?.phase ?? null;
    entry.spectatorTarget = await evaluate("document.querySelector('#elimination-spectator-target')?.textContent ?? ''");
    entry.localAlive = false;
  }
  report.push(...spectatorEntries);

  const roundResultState = await waitForGameState((snapshot) => snapshot.elimination?.phase === "result", 30_000);
  const roundResultEntries = await captureViewportState({
    stateId: "team-elimination-round-result",
    mapId: "reactor-core",
    requiredSelector: "#elimination-round-result:not(.is-hidden)",
    expectCanvas: true,
  });
  for (const entry of roundResultEntries) {
    entry.observedRoundPhase = roundResultState.elimination?.phase ?? null;
    entry.roundScores = roundResultState.elimination?.roundScores ?? [];
  }
  report.push(...roundResultEntries);

  const nextRoundState = await waitForGameState(
    (snapshot) => snapshot.elimination?.roundIndex === (roundResultState.elimination?.roundIndex ?? 1) + 1 && snapshot.elimination?.phase === "prep" && snapshot.players.find((player) => player.id === localPlayerId)?.alive === true,
    10_000,
  );
  const nextRoundEntries = await captureViewportState({
    stateId: "team-elimination-next-round",
    mapId: "reactor-core",
    requiredSelector: "#elimination-hud:not(.is-hidden)",
    expectCanvas: true,
  });
  for (const entry of nextRoundEntries) {
    entry.observedRoundPhase = nextRoundState.elimination?.phase ?? null;
    entry.observedRoundIndex = nextRoundState.elimination?.roundIndex ?? null;
    entry.localAlive = true;
  }
  report.push(...nextRoundEntries);

  const eliminationStateSelectors = [
    "#elimination-hud:not(.is-hidden)",
    "#elimination-spectator:not(.is-hidden)",
    "#elimination-round-result:not(.is-hidden)",
  ];
  if (eliminationStateSelectors.length !== 3) throw new Error("Elimination visual state selector matrix is incomplete");
  const eliminationEnd = await acknowledge(hostSocket, "hostCommand", { token: hostToken, command: "end" });
  if (!eliminationEnd?.ok) throw new Error(eliminationEnd?.error ?? "Could not finish elimination smoke match");
  await waitForGameState((snapshot) => snapshot.phase === "finished", 10_000);
  const eliminationReset = await acknowledge(hostSocket, "hostCommand", { token: hostToken, command: "reset" });
  if (!eliminationReset?.ok) throw new Error(eliminationReset?.error ?? "Could not reset elimination smoke match");
  await waitFor(() => latestRoom?.phase === "lobby");

  await evaluate(`localStorage.setItem("energy-brawl:room-presets:v1", ${JSON.stringify(JSON.stringify([{
    schemaVersion: 1,
    id: "visual-smoke-preset",
    name: "Visual QA",
    updatedAt: Date.now(),
    matchMode: "solo",
    mapSelection: "reactor-core",
    mapMechanicsEnabled: true,
    mapEventsEnabled: true,
    botDifficulty: "normal",
    characterOverrides: {},
  }]))})`);
  await cdp.send("Page.navigate", { url: `${baseUrl}/host?token=${encodeURIComponent(hostToken)}` });
  await waitFor(() => evaluate("Boolean(document.querySelector('.host-preset-bar'))"), 15_000);
  report.push(...await captureViewportState({
    stateId: "host-preset-bar",
    requiredSelector: ".host-preset-bar",
  }));

  await writeFile(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Map visual smoke passed: ${report.length} screenshots in ${outputRoot}`);
} finally {
  cdp?.close();
  hostSocket.disconnect();
  edge.kill();
}

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

  const report = [];
  for (const mapId of maps) {
    await ensureReady();
    await wait(250);

    const mapResult = await acknowledge(hostSocket, "hostAdminCommand", { token: hostToken, command: { type: "setMap", mapSelection: mapId } });
    if (!mapResult?.ok) throw new Error(mapResult?.error ?? `Could not select ${mapId}`);
    const startResult = await acknowledge(hostSocket, "hostCommand", { token: hostToken, command: "start" });
    if (!startResult?.ok) throw new Error(startResult?.error ?? `Could not start ${mapId}`);

    await waitFor(async () => {
      const result = await cdp.send("Runtime.evaluate", {
        expression: "Boolean(document.querySelector('#arena-screen:not(.is-hidden) canvas'))",
        returnByValue: true,
      });
      return result.result.value;
    }, 15_000);
    await wait(1_000);

    for (const device of devices) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: device.width,
        height: device.height,
        deviceScaleFactor: device.dpr,
        mobile: device.mobile,
        screenOrientation: { type: "landscapePrimary", angle: 90 },
      });
      await wait(800);
      const metricsResult = await cdp.send("Runtime.evaluate", {
        expression: `(() => { const canvas = document.querySelector('#game-root canvas'); return canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight, dpr: devicePixelRatio } : null; })()`,
        returnByValue: true,
      });
      const metrics = metricsResult.result.value;
      if (!metrics) throw new Error(`Missing canvas for ${mapId} ${device.id}`);
      if (Math.abs(metrics.width - metrics.clientWidth * metrics.dpr) > 2 || Math.abs(metrics.height - metrics.clientHeight * metrics.dpr) > 2) {
        throw new Error(`HiDPI mismatch for ${mapId} ${device.id}: ${JSON.stringify(metrics)}`);
      }
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const file = path.join(outputRoot, `${mapId}-${device.id}.png`);
      await writeFile(file, Buffer.from(screenshot.data, "base64"));
      report.push({ mapId, device: device.id, file, metrics });
    }

    const resetResult = await acknowledge(hostSocket, "hostCommand", { token: hostToken, command: "reset" });
    if (!resetResult?.ok) throw new Error(resetResult?.error ?? `Could not reset ${mapId}`);
    await wait(500);
  }

  await writeFile(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Map visual smoke passed: ${report.length} screenshots in ${outputRoot}`);
} finally {
  cdp?.close();
  hostSocket.disconnect();
  edge.kill();
}

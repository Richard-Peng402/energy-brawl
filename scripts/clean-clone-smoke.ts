import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ServerInfo } from "../src/shared/protocol";

interface AssetManifest {
  entries: Array<{ outputFiles?: string[] }>;
}

export function collectRuntimeAssetUrls(manifests: readonly AssetManifest[]): string[] {
  const urls = new Set<string>();
  for (const manifest of manifests) {
    for (const entry of manifest.entries) {
      for (const output of entry.outputFiles ?? []) {
        const normalized = output.replaceAll("\\", "/");
        if (!/^\/assets\/v[34]\//.test(normalized) || normalized.includes("..")) {
          throw new Error(`Asset is outside repository runtime assets: ${output}`);
        }
        urls.add(normalized);
      }
    }
  }
  return [...urls].sort();
}

export function extractServerPort(output: string): number | null {
  const match = /主机控制台:\s*http:\/\/127\.0\.0\.1:(\d+)\/host/.exec(output);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

async function runSmoke(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageJson = await readJson<{ version: string }>(path.join(root, "package.json"));
  const manifests = await Promise.all([
    readJson<AssetManifest>(path.join(root, "public/assets/v3/manifest.json")),
    readJson<AssetManifest>(path.join(root, "public/assets/v4/manifest.json")),
  ]);
  const assetUrls = collectRuntimeAssetUrls(manifests);
  const requestedPort = 0;
  const tsxCli = path.join(root, "node_modules/tsx/dist/cli.mjs");
  const server = spawn(process.execPath, [tsxCli, "src/server/index.ts"], {
    cwd: root,
    env: { ...process.env, OPEN_HOST: "0", PORT: String(requestedPort) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let serverOutput = "";
  server.stdout?.on("data", (chunk) => { serverOutput += String(chunk); });
  server.stderr?.on("data", (chunk) => { serverOutput += String(chunk); });

  try {
    const actualPort = await waitForServerPort(() => serverOutput);
    const baseUrl = `http://127.0.0.1:${actualPort}`;
    const info = await pollServerInfo(`${baseUrl}/api/info`);
    if (info.version !== packageJson.version) {
      throw new Error(`API version ${info.version} does not match package version ${packageJson.version}`);
    }
    const responses = await Promise.all(assetUrls.map((url) => fetch(`${baseUrl}${url}`)));
    const failed = responses.flatMap((response, index) => response.ok ? [] : [`${assetUrls[index]} (${response.status})`]);
    if (failed.length > 0) throw new Error(`Runtime assets failed to load:\n${failed.join("\n")}`);
    console.log(`Clean-clone smoke passed: API ${info.version}, ${assetUrls.length} runtime assets.`);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nServer output:\n${serverOutput}`);
  } finally {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => server.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
}

async function waitForServerPort(readOutput: () => string): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = extractServerPort(readOutput());
    if (port !== null) return port;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Spawned server did not report its listening port");
}

async function pollServerInfo(url: string): Promise<ServerInfo> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return await response.json() as ServerInfo;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError instanceof Error ? lastError : new Error("Server did not become ready");
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryPoint) await runSmoke();

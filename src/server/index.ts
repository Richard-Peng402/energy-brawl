import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";

import express from "express";
import QRCode from "qrcode";

import packageJson from "../../package.json";

import { attachGameNetwork } from "./network";
import { listenOnAvailablePort } from "./port";
import { GameRoom } from "./room";
import { discoverNetworkSnapshot } from "./network-topology";
import { NetworkSnapshotProvider } from "./network-snapshot-provider";
import { applyNoStoreHeaders, buildServerInfo, getAllowedLanAddresses } from "./server-info";

const preferredPort = Number.parseInt(process.env.PORT ?? "3000", 10);
let port = preferredPort;
const app = express();
const httpServer = createServer(app);
const room = new GameRoom();
const hostToken = process.env.NODE_ENV === "test" ? process.env.HOST_TOKEN?.trim() || randomBytes(18).toString("hex") : randomBytes(18).toString("hex");
let allowedLanAddresses: string[] = [];
const network = attachGameNetwork(httpServer, room, hostToken, () => allowedLanAddresses, packageJson.version);
const topology = new NetworkSnapshotProvider(() => discoverNetworkSnapshot({ port, interfaces: networkInterfaces() }));
const clientDirectory = path.resolve(process.cwd(), "dist");

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.static(clientDirectory));

app.get("/api/info", async (_request, response) => {
  applyNoStoreHeaders(response);
  const snapshot = await topology.get();
  allowedLanAddresses = getAllowedLanAddresses(snapshot);
  const baseInfo = buildServerInfo(snapshot, room.snapshot(), packageJson.version);
  const qrDataUrls = await Promise.all(baseInfo.joinUrls.map((url) => QRCode.toDataURL(url, { margin: 1, width: 320 })));
  const info = { ...baseInfo, qrDataUrls };
  response.json(info);
});

app.get(["/", "/host"], (_request, response) => {
  response.sendFile(path.join(clientDirectory, "index.html"), (error) => {
    if (error && !response.headersSent) {
      response.status(503).send("客户端尚未构建，请先运行 npm.cmd run build");
    }
  });
});

port = await listenOnAvailablePort(httpServer, preferredPort, "0.0.0.0");
{
  const startupSnapshot = await topology.get();
  allowedLanAddresses = getAllowedLanAddresses(startupSnapshot);
  const joinUrls = startupSnapshot.status === "unavailable"
    ? []
    : startupSnapshot.candidates.filter((candidate) => candidate.kind !== "virtual").map((candidate) => candidate.url);
  const hostUrl = `http://127.0.0.1:${port}/host?token=${hostToken}`;
  console.log("\n能量乱斗服务器已启动");
  if (preferredPort > 0 && port !== preferredPort) console.log(`端口 ${preferredPort} 已被占用，已自动改用 ${port}`);
  console.log(`主机控制台: ${hostUrl}`);
  for (const url of joinUrls) console.log(`手机加入: ${url}`);
  console.log("按 Ctrl+C 停止服务器\n");
  if (process.env.OPEN_HOST === "1" && process.platform === "win32") {
    const opener = spawn("cmd.exe", ["/c", "start", "", hostUrl], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    opener.unref();
  }
}

async function shutdown(): Promise<void> {
  await network.close();
  if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

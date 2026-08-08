import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";

import express from "express";
import QRCode from "qrcode";

import type { ServerInfo } from "../shared/protocol";
import { getLanAddresses } from "./lan-address";
import { attachGameNetwork } from "./network";
import { listenOnAvailablePort } from "./port";
import { GameRoom } from "./room";

const preferredPort = Number.parseInt(process.env.PORT ?? "3000", 10);
let port = preferredPort;
const app = express();
const httpServer = createServer(app);
const room = new GameRoom();
const hostToken = process.env.NODE_ENV === "test" ? process.env.HOST_TOKEN?.trim() || randomBytes(18).toString("hex") : randomBytes(18).toString("hex");
const network = attachGameNetwork(httpServer, room, hostToken);
const clientDirectory = path.resolve(process.cwd(), "dist");

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.static(clientDirectory));

app.get("/api/info", async (_request, response) => {
  const joinUrls = getLanAddresses(port, networkInterfaces());
  const qrDataUrls = await Promise.all(joinUrls.map((url) => QRCode.toDataURL(url, { margin: 1, width: 320 })));
  const info: ServerInfo = {
    name: "能量乱斗",
    version: "4.1.0",
    joinUrls,
    qrDataUrls,
    room: room.snapshot(),
  };
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
  const joinUrls = getLanAddresses(port, networkInterfaces());
  const hostUrl = `http://127.0.0.1:${port}/host?token=${hostToken}`;
  console.log("\n能量乱斗服务器已启动");
  if (port !== preferredPort) console.log(`端口 ${preferredPort} 已被占用，已自动改用 ${port}`);
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

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";

import express from "express";
import QRCode from "qrcode";

import type { ServerInfo } from "../shared/protocol";
import { attachGameNetwork } from "./network";
import { GameRoom } from "./room";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = express();
const httpServer = createServer(app);
const room = new GameRoom();
const hostToken = randomBytes(18).toString("hex");
const network = attachGameNetwork(httpServer, room, hostToken);
const clientDirectory = path.resolve(process.cwd(), "dist");

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.static(clientDirectory));

app.get("/api/info", async (_request, response) => {
  const joinUrls = getLanAddresses(PORT);
  const qrDataUrls = await Promise.all(joinUrls.map((url) => QRCode.toDataURL(url, { margin: 1, width: 320 })));
  const info: ServerInfo = {
    name: "能量乱斗",
    version: "0.1.0",
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

httpServer.listen(PORT, "0.0.0.0", () => {
  const joinUrls = getLanAddresses(PORT);
  const hostUrl = `http://127.0.0.1:${PORT}/host?token=${hostToken}`;
  console.log("\n能量乱斗服务器已启动");
  console.log(`主机控制台: ${hostUrl}`);
  for (const url of joinUrls) console.log(`手机加入: ${url}`);
  console.log("按 Ctrl+C 停止服务器\n");
});

async function shutdown(): Promise<void> {
  await network.close();
  if (httpServer.listening) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

function getLanAddresses(port: number): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivateAddress(entry.address)) {
        addresses.add(`http://${entry.address}:${port}/`);
      }
    }
  }
  return addresses.size > 0 ? [...addresses] : [`http://127.0.0.1:${port}/`];
}

function isPrivateAddress(address: string): boolean {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

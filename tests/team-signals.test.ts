import { createServer } from "node:http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientToServerEvents, ServerToClientEvents } from "../src/shared/protocol";
import { attachGameNetwork } from "../src/server/network";
import { GameRoom } from "../src/server/room";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => { await Promise.all(cleanups.splice(0).map((cleanup) => cleanup())); });

describe("team quick signals", () => {
  it("broadcasts valid signals only to teammates and rate-limits spam", async () => {
    const server = createServer();
    const room = new GameRoom();
    const network = attachGameNetwork(server, room, "test-token", undefined, undefined, undefined, { autoPoll: false });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const url = `http://127.0.0.1:${address.port}`;
    const red = createClient(url, { transports: ["websocket"], forceNew: true });
    const blue = createClient(url, { transports: ["websocket"], forceNew: true });
    await Promise.all([waitForConnect(red), waitForConnect(blue)]);
    cleanups.push(async () => { red.disconnect(); blue.disconnect(); await network.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });

    await emitAck(red, "join", { nickname: "红队", characterId: "blaze" });
    await emitAck(blue, "join", { nickname: "蓝队", characterId: "medic" });
    await emitAck(red, "hostAdminCommand", { token: "test-token", command: { type: "setMode", mode: "team3v3" } });
    await emitAck(red, "setReady", true);
    await emitAck(blue, "setReady", true);
    await emitAck(red, "hostCommand", { token: "test-token", command: "start" });

    const redEvent = once(red, "teamSignal");
    let blueCount = 0;
    blue.on("teamSignal", () => { blueCount += 1; });
    red.emit("teamSignal", { kind: "attack" });
    await expect(redEvent).resolves.toMatchObject({ kind: "attack", senderName: "红队", teamId: expect.any(String) });
    red.emit("teamSignal", { kind: "heal" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(blueCount).toBe(0);
  });

  it("ignores malformed signals and signals from solo rooms", async () => {
    const server = createServer();
    const room = new GameRoom();
    const network = attachGameNetwork(server, room, "test-token", undefined, undefined, undefined, { autoPoll: false });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const client = createClient(`http://127.0.0.1:${address.port}`, { transports: ["websocket"], forceNew: true });
    await waitForConnect(client);
    cleanups.push(async () => { client.disconnect(); await network.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
    await emitAck(client, "join", { nickname: "个人", characterId: "blaze" });
    let count = 0;
    client.on("teamSignal", () => { count += 1; });
    client.emit("teamSignal", { kind: "not-valid" } as never);
    client.emit("teamSignal", { kind: "group" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(count).toBe(0);
  });
});

function waitForConnect(client: TestClient): Promise<void> {
  return new Promise((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
}

function once(client: TestClient, event: "teamSignal"): Promise<Parameters<ServerToClientEvents["teamSignal"]>[0]> {
  return new Promise((resolve) => client.once(event, resolve));
}

function emitAck(client: TestClient, event: "join", payload: Parameters<ClientToServerEvents["join"]>[0]): Promise<unknown>;
function emitAck(client: TestClient, event: "hostAdminCommand", payload: Parameters<ClientToServerEvents["hostAdminCommand"]>[0]): Promise<unknown>;
function emitAck(client: TestClient, event: "setReady", payload: Parameters<ClientToServerEvents["setReady"]>[0]): Promise<unknown>;
function emitAck(client: TestClient, event: "hostCommand", payload: Parameters<ClientToServerEvents["hostCommand"]>[0]): Promise<unknown>;
function emitAck(client: TestClient, event: "join" | "hostAdminCommand" | "setReady" | "hostCommand", payload: unknown): Promise<unknown> {
  return new Promise((resolve) => (client.emit as unknown as (event: string, payload: unknown, ack: (value: unknown) => void) => void)(event, payload, resolve));
}

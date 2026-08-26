import { createServer } from "node:http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import type { Ack, ClientToServerEvents, RoomSelectionResult, ServerToClientEvents } from "../src/shared/protocol";
import { attachGameNetwork, type GameNetwork } from "../src/server/network";
import { GameRoom } from "../src/server/room";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => { await Promise.all(cleanups.splice(0).map((cleanup) => cleanup())); });

describe("network room routing", () => {
  it("creates isolated rooms and keeps lobby broadcasts inside the selected room", async () => {
    const { first, second } = await createHarness();
    const firstRoom = await noPayloadAck(first, "createRoom");
    const secondRoom = await noPayloadAck(second, "createRoom");
    expect(firstRoom.data?.roomCode).not.toBe(secondRoom.data?.roomCode);

    await payloadAck(first, "join", { nickname: "Alpha", characterId: "blaze" });
    await payloadAck(second, "join", { nickname: "Bravo", characterId: "medic" });
    const rooms = await noPayloadAck(first, "listRooms");
    const summaries = (rooms.data as { rooms: Array<{ code: string; playerCount: number }> }).rooms;
    expect(summaries.find((entry) => entry.code === firstRoom.data?.roomCode)?.playerCount).toBe(1);
    expect(summaries.find((entry) => entry.code === secondRoom.data?.roomCode)?.playerCount).toBe(1);

    const firstState = once(first, "roomState");
    let secondBroadcasts = 0;
    second.once("roomState", () => { secondBroadcasts += 1; });
    await payloadAck(first, "setReady", true);
    await expect(firstState).resolves.toMatchObject({ players: [expect.objectContaining({ nickname: "Alpha", ready: true })] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(secondBroadcasts).toBe(0);
  });

  it("joins by code and quick-joins the oldest available room", async () => {
    const { first, second } = await createHarness();
    const created = await noPayloadAck(first, "createRoom");
    const joined = await payloadAck(second, "joinRoom", created.data!.roomCode);
    expect(joined.data?.roomCode).toBe(created.data?.roomCode);
    const quick = await noPayloadAck(second, "quickJoin");
    expect(quick.data?.roomCode).toBe("AAAAAA");
  });

  it("releases the old room seat when a client switches rooms", async () => {
    const { first, second } = await createHarness();
    const firstRoom = await noPayloadAck(first, "createRoom");
    await payloadAck(first, "join", { nickname: "Alpha", characterId: "blaze" });
    const secondRoom = await noPayloadAck(second, "createRoom");
    await payloadAck(first, "joinRoom", secondRoom.data!.roomCode);
    const rooms = await noPayloadAck(first, "listRooms");
    const summaries = rooms.data!.rooms;
    expect(summaries.find((entry) => entry.code === firstRoom.data!.roomCode)?.playerCount).toBe(0);
    expect(summaries.find((entry) => entry.code === secondRoom.data!.roomCode)?.playerCount).toBe(0);
  });

  it("keeps two six-client lobbies isolated during live simulation", async () => {
    const { clients, network } = await createManyHarness(6);
    const firstRoom = await noPayloadAck(clients[0]!, "createRoom");
    const secondRoom = await noPayloadAck(clients[3]!, "createRoom");
    const firstCode = firstRoom.data!.roomCode;
    const secondCode = secondRoom.data!.roomCode;
    for (const [index, client] of clients.entries()) {
      if (index !== 0 && index !== 3) await payloadAck(client, "joinRoom", index < 3 ? firstCode : secondCode);
      await payloadAck(client, "join", { nickname: `Load${index + 1}`, characterId: ["blaze", "medic", "fortress", "arc", "phase", "runner"][index] });
      await payloadAck(client, "setReady", true);
    }
    const firstGame = once(clients[0]!, "gameState");
    const secondGame = once(clients[3]!, "gameState");
    await hostAck(clients[0]!, "start", "test-token");
    await hostAck(clients[3]!, "start", "test-token");
    network.advance(16.6667);
    const [firstSnapshot, secondSnapshot] = await Promise.all([firstGame, secondGame]);
    const firstNames = firstSnapshot?.players.map((player) => player.nickname) ?? [];
    const secondNames = secondSnapshot?.players.map((player) => player.nickname) ?? [];
    expect(firstNames.filter((name) => name.startsWith("Load"))).toEqual(["Load1", "Load2", "Load3"]);
    expect(secondNames.filter((name) => name.startsWith("Load"))).toEqual(["Load4", "Load5", "Load6"]);
    expect(firstNames).not.toContain("Load4");
    expect(secondNames).not.toContain("Load1");

    const handover = once(clients[0]!, "playerHandover");
    clients[1]!.disconnect();
    await expect(handover).resolves.toMatchObject({ controlOwner: "bot" });
  });
});

async function createHarness(): Promise<{ first: TestClient; second: TestClient; network: GameNetwork }> {
  const server = createServer();
  const network = attachGameNetwork(server, new GameRoom(), "test-token", undefined, undefined, undefined, { autoPoll: false });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  const url = `http://127.0.0.1:${address.port}`;
  const first = createClient(url, { transports: ["websocket"], forceNew: true });
  const second = createClient(url, { transports: ["websocket"], forceNew: true });
  await Promise.all([waitForConnect(first), waitForConnect(second)]);
  cleanups.push(async () => {
    first.disconnect(); second.disconnect(); await network.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { first, second, network };
}

async function createManyHarness(count: number): Promise<{ clients: TestClient[]; network: GameNetwork }> {
  const server = createServer();
  const network = attachGameNetwork(server, new GameRoom(), "test-token", undefined, undefined, undefined, { autoPoll: false });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  const url = `http://127.0.0.1:${address.port}`;
  const clients = Array.from({ length: count }, () => createClient(url, { transports: ["websocket"], forceNew: true }));
  await Promise.all(clients.map(waitForConnect));
  cleanups.push(async () => {
    clients.forEach((client) => client.disconnect());
    await network.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { clients, network };
}

function waitForConnect(client: TestClient): Promise<void> {
  return new Promise((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
}

function once<E extends "roomState" | "gameState" | "playerHandover">(client: TestClient, event: E): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => (client.once as unknown as (event: E, listener: (snapshot: Parameters<ServerToClientEvents[E]>[0]) => void) => void)(event, resolve));
}

function noPayloadAck(client: TestClient, event: "createRoom" | "quickJoin"): Promise<Ack<RoomSelectionResult>>;
function noPayloadAck(client: TestClient, event: "listRooms"): Promise<Ack<{ rooms: Array<{ code: string; playerCount: number }> }>>;
function noPayloadAck(client: TestClient, event: string): Promise<Ack<unknown>> {
  return new Promise((resolve) => (client.emit as unknown as (event: string, ack: (value: Ack<unknown>) => void) => void)(event, resolve));
}

function payloadAck(client: TestClient, event: string, payload: unknown): Promise<Ack<RoomSelectionResult>> {
  return new Promise((resolve) => (client.emit as unknown as (event: string, payload: unknown, ack: (value: Ack<RoomSelectionResult>) => void) => void)(event, payload, resolve));
}

function hostAck(client: TestClient, command: "start" | "startCountdown", token: string): Promise<Ack<unknown>> {
  return new Promise((resolve) => client.emit("hostCommand", { token, command }, resolve));
}

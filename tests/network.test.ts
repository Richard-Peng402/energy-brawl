import { createServer } from "node:http";

import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { PLAYER_COLORS, RECONNECT_WINDOW_MS } from "../src/shared/constants";
import type {
  Ack,
  ClientToServerEvents,
  HostCommand,
  JoinPayload,
  JoinResult,
  ServerToClientEvents,
} from "../src/shared/protocol";
import { attachGameNetwork, isAllowedLanOrigin, type GameNetwork } from "../src/server/network";
import { GameRoom } from "../src/server/room";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function createHarness(): Promise<{ client: TestClient; network: GameNetwork; room: GameRoom; url: string }> {
  const server = createServer();
  const room = new GameRoom();
  const network = attachGameNetwork(server, room, "test-host-token");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
  const client = createClient(`http://127.0.0.1:${address.port}`, {
    transports: ["websocket"],
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  cleanups.push(async () => {
    client.disconnect();
    await network.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { client, network, room, url: `http://127.0.0.1:${address.port}` };
}

describe("game network", () => {
  it("rejects blank nicknames and accepts a valid player", async () => {
    const { client } = await createHarness();

    const rejected = await emitAck(client, "join", { nickname: "   ", color: PLAYER_COLORS[0] });
    const accepted = await emitAck(client, "join", { nickname: "小明", color: PLAYER_COLORS[0] });

    expect(rejected).toMatchObject({ ok: false });
    expect(accepted).toMatchObject({ ok: true, data: { playerId: expect.any(String) } });
  });

  it("requires the host token before starting a match", async () => {
    const { client } = await createHarness();
    await emitAck(client, "join", { nickname: "小明", color: PLAYER_COLORS[0] });
    await emitAck(client, "setReady", true);

    const rejected = await emitAck(client, "hostCommand", { token: "wrong", command: "start" });
    const accepted = await emitAck(client, "hostCommand", { token: "test-host-token", command: "start" });

    expect(rejected).toMatchObject({ ok: false });
    expect(accepted).toMatchObject({ ok: true });
  });

  it("stays available when a client omits the acknowledgement callback", async () => {
    const { client } = await createHarness();
    const unsafeEmit = client.emit.bind(client) as unknown as (event: string, payload: unknown) => void;

    unsafeEmit("hostCommand", { token: "wrong", command: "start" });
    const accepted = await emitAck(client, "join", { nickname: "仍可加入", color: PLAYER_COLORS[0] });

    expect(accepted.ok).toBe(true);
  });

  it("accepts local and RFC1918 origins but rejects public and lookalike hostnames", () => {
    expect(isAllowedLanOrigin(undefined)).toBe(true);
    expect(isAllowedLanOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedLanOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedLanOrigin("http://10.0.0.1:3000")).toBe(true);
    expect(isAllowedLanOrigin("http://192.168.1.8:3000")).toBe(true);
    expect(isAllowedLanOrigin("http://172.16.0.1:3000")).toBe(true);
    expect(isAllowedLanOrigin("https://example.com")).toBe(false);
    expect(isAllowedLanOrigin("https://127.0.0.1.evil.example")).toBe(false);
    expect(isAllowedLanOrigin("https://192.168.1.8.evil.example")).toBe(false);
    expect(isAllowedLanOrigin("https://10.0.0.1.evil.example")).toBe(false);
    expect(isAllowedLanOrigin("https://172.16.0.1.evil.example")).toBe(false);
    expect(isAllowedLanOrigin("http://[::1]:5173")).toBe(true);
  });

  it("notifies observers when autonomous expiry returns a match to the lobby", async () => {
    const { client: observer, network, url } = await createHarness();
    const player = createClient(url, { transports: ["websocket"], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      player.once("connect", resolve);
      player.once("connect_error", reject);
    });
    cleanups.push(async () => {
      player.disconnect();
    });

    const joinedState = new Promise<Parameters<ServerToClientEvents["roomState"]>[0]>((resolve) => {
      observer.once("roomState", resolve);
    });
    await emitAck(player, "join", { nickname: "观察对象", color: PLAYER_COLORS[0] });
    await expect(joinedState).resolves.toMatchObject({ players: [{ connected: true }] });
    const disconnectedState = new Promise<Parameters<ServerToClientEvents["roomState"]>[0]>((resolve) => {
      observer.once("roomState", resolve);
    });
    player.disconnect();
    await expect(disconnectedState).resolves.toMatchObject({ players: [{ connected: false }] });

    const roomState = new Promise<Parameters<ServerToClientEvents["roomState"]>[0]>((resolve) => {
      observer.once("roomState", resolve);
    });
    network.advance(RECONNECT_WINDOW_MS + 1);

    await expect(roomState).resolves.toMatchObject({ phase: "lobby", players: [] });
    await network.close();
  });
});

function emitAck(client: TestClient, event: "join", payload: JoinPayload): Promise<Ack<JoinResult>>;
function emitAck(client: TestClient, event: "setReady", payload: boolean): Promise<Ack>;
function emitAck(
  client: TestClient,
  event: "hostCommand",
  payload: { token: string; command: HostCommand },
): Promise<Ack>;
function emitAck(
  client: TestClient,
  event: string,
  payload: unknown,
): Promise<Ack<JoinResult> | Ack> {
  const emit = client.emit.bind(client) as unknown as (
    eventName: string,
    eventPayload: unknown,
    acknowledge: (result: Ack<JoinResult> | Ack) => void,
  ) => void;
  return new Promise((resolve) => emit(event, payload, resolve));
}

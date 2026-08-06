import { createServer } from "node:http";

import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RECONNECT_WINDOW_MS, SERVER_TICK_MS } from "../src/shared/constants";
import type {
  Ack,
  ClientToServerEvents,
  HostCommand,
  JoinPayload,
  JoinResult,
  ServerToClientEvents,
} from "../src/shared/protocol";
import {
  advanceSnapshotDeadline,
  attachGameNetwork,
  isAllowedLanOrigin,
  type GameNetwork,
} from "../src/server/network";
import { GameRoom } from "../src/server/room";
import { buildCharacterSelection } from "../src/client/network";

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
  it("locks characters used by other humans but keeps AI choices available with full details", () => {
    const room = {
      phase: "lobby" as const,
      canStart: false,
      players: [
        { id: "human", nickname: "真人", characterId: "blaze" as const, color: "#f00", isBot: false, connected: true, ready: false, score: 0 },
        { id: "bot", nickname: "AI", characterId: "medic" as const, color: "#0f0", isBot: true, connected: true, ready: true, score: 0 },
      ],
    };

    const cards = buildCharacterSelection(room, "viewer", "medic");

    expect(cards.find((card) => card.id === "blaze")).toMatchObject({ unavailable: true });
    expect(cards.find((card) => card.id === "medic")).toMatchObject({
      unavailable: false,
      selected: true,
      role: "续航支援",
      passiveName: "能量回流",
      passiveDescription: "拾取普通能量球恢复 12 点生命。",
      advantage: "能量球治疗 12",
      tradeoff: "单发伤害 23",
      maxHealth: expect.any(Number),
      damage: 23,
      moveSpeed: expect.any(Number),
      fireCooldownMs: expect.any(Number),
      projectileSpeed: expect.any(Number),
    });
  });

  it("skips a day of stale snapshot deadlines in one calculation", () => {
    const serverTime = 86_400_000;

    const deadline = advanceSnapshotDeadline(100, serverTime, 30);

    expect(deadline).toBeGreaterThan(serverTime);
    expect(deadline - serverTime).toBeCloseTo(1_000 / 30, 5);
  });

  it("rejects blank nicknames and accepts a valid player", async () => {
    const { client } = await createHarness();

    const rejected = await emitAck(client, "join", { nickname: "   ", characterId: "blaze" });
    const accepted = await emitAck(client, "join", { nickname: "小明", characterId: "blaze" });

    expect(rejected).toMatchObject({ ok: false });
    expect(accepted).toMatchObject({ ok: true, data: { playerId: expect.any(String) } });
  });

  it("requires the host token before starting a match", async () => {
    const { client } = await createHarness();
    await emitAck(client, "join", { nickname: "小明", characterId: "blaze" });
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
    const accepted = await emitAck(client, "join", { nickname: "仍可加入", characterId: "blaze" });

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
    await emitAck(player, "join", { nickname: "观察对象", characterId: "blaze" });
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

  it("returns a finished match to the lobby through the player event", async () => {
    const { client, room } = await createHarness();
    await emitAck(client, "join", { nickname: "Player", characterId: "blaze" });
    await emitAck(client, "setReady", true);
    await emitAck(client, "hostCommand", { token: "test-host-token", command: "start" });
    await emitAck(client, "hostCommand", { token: "test-host-token", command: "end" });
    const clearedGame = new Promise<void>((resolve) => {
      const handleGameState: ServerToClientEvents["gameState"] = (snapshot) => {
        if (snapshot !== null) return;
        client.off("gameState", handleGameState);
        resolve();
      };
      client.on("gameState", handleGameState);
    });

    const result = await new Promise<Ack>((resolve) => client.emit("returnToLobby", resolve));

    expect(result.ok).toBe(true);
    expect(room.snapshot()).toMatchObject({ phase: "lobby", players: [{ ready: false, isBot: false }] });
    await expect(clearedGame).resolves.toBeUndefined();
  });

  it("keeps full and reduced snapshot cadences isolated per client", async () => {
    const { client, network, room, url } = await createHarness();
    const reducedClient = createClient(url, { transports: ["websocket"], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      reducedClient.once("connect", resolve);
      reducedClient.once("connect_error", reject);
    });
    cleanups.push(async () => {
      reducedClient.disconnect();
    });
    await emitAck(client, "join", { nickname: "Player", characterId: "blaze" });
    await emitAck(reducedClient, "join", { nickname: "Reduced", characterId: "medic" });
    await emitAck(client, "setReady", true);
    await emitAck(reducedClient, "setReady", true);
    await emitAck(client, "hostCommand", { token: "test-host-token", command: "start" });
    const fullSocket = network.io.sockets.sockets.get(client.id!)!;
    const reducedSocket = network.io.sockets.sockets.get(reducedClient.id!)!;
    const received = new Promise<void>((resolve) => {
      reducedSocket.once("performanceHint", () => queueMicrotask(resolve));
    });

    reducedClient.emit("performanceHint", { snapshotMode: "reduced", frameP95Ms: 28 });
    await received;
    const fullEmit = vi.spyOn(fullSocket.volatile, "emit");
    const reducedEmit = vi.spyOn(reducedSocket.volatile, "emit");
    const gameSnapshot = vi.spyOn(room, "gameSnapshot");

    for (let tick = 0; tick < 180; tick += 1) network.advance(SERVER_TICK_MS);

    const fullSnapshots = fullEmit.mock.calls.filter(([event]) => event === "gameState").length;
    const reducedSnapshots = reducedEmit.mock.calls.filter(([event]) => event === "gameState").length;

    expect(fullSocket.data.snapshotRate).toBe(30);
    expect(reducedSocket.data.snapshotRate).toBe(20);
    expect(fullSnapshots).toBeGreaterThanOrEqual(89);
    expect(fullSnapshots).toBeLessThanOrEqual(90);
    expect(reducedSnapshots).toBeGreaterThanOrEqual(59);
    expect(reducedSnapshots).toBeLessThanOrEqual(60);
    expect(gameSnapshot).toHaveBeenCalledTimes(90);
  });

  it("queues skill actions from the socket until the next fixed simulation step", async () => {
    const { client, network, room } = await createHarness();
    const joined = await emitAck(client, "join", { nickname: "Skill User", characterId: "blaze" });
    await emitAck(client, "setReady", true);
    await emitAck(client, "hostCommand", { token: "test-host-token", command: "start" });
    const serverSocket = network.io.sockets.sockets.get(client.id!)!;
    const received = new Promise<void>((resolve) => serverSocket.once("useSkill", () => queueMicrotask(resolve)));

    client.emit("useSkill", { skillActionSeq: 1 });
    await received;
    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)!.lastProcessedSkillAction).toBe(0);
    network.advance(SERVER_TICK_MS);

    expect(room.gameSnapshot()!.players.find((player) => player.id === joined.data!.playerId)!.lastProcessedSkillAction).toBe(1);
  });

  it("does not reset an existing snapshot deadline for repeated or invalid hints", async () => {
    const { client, network } = await createHarness();
    await emitAck(client, "join", { nickname: "Player", characterId: "blaze" });
    await emitAck(client, "setReady", true);
    await emitAck(client, "hostCommand", { token: "test-host-token", command: "start" });
    network.advance(SERVER_TICK_MS * 2);
    const serverSocket = network.io.sockets.sockets.get(client.id!)!;
    const sendHint = async (hint: unknown) => {
      const received = new Promise<void>((resolve) => {
        serverSocket.once("performanceHint", () => queueMicrotask(resolve));
      });
      const unsafeEmit = client.emit.bind(client) as unknown as (event: string, payload: unknown) => void;
      unsafeEmit("performanceHint", hint);
      await received;
    };

    await sendHint({ snapshotMode: "reduced", frameP95Ms: 28 });
    const previousDeadline = serverSocket.data.nextSnapshotAt;
    await sendHint({ snapshotMode: "reduced", frameP95Ms: 35 });
    await sendHint({ snapshotMode: "turbo", frameP95Ms: 2 });
    await sendHint({ snapshotMode: "full", frameP95Ms: -1 });
    await sendHint({ snapshotMode: "full", frameP95Ms: Number.NaN });
    await sendHint({ snapshotMode: "full", frameP95Ms: Number.POSITIVE_INFINITY });
    await sendHint({ snapshotMode: "full", frameP95Ms: 1_001 });

    expect(serverSocket.data.snapshotRate).toBe(20);
    expect(serverSocket.data.nextSnapshotAt).toBe(previousDeadline);
  });

  it("caps a production clock poll at three fixed simulation steps", async () => {
    const { client, network, room } = await createHarness();
    await emitAck(client, "join", { nickname: "Player", characterId: "blaze" });
    await emitAck(client, "setReady", true);
    await emitAck(client, "hostCommand", { token: "test-host-token", command: "start" });
    const before = room.gameSnapshot()!.serverTime;
    const pollStart = performance.now();
    network.poll(pollStart);

    expect(network.poll(pollStart + SERVER_TICK_MS * 20)).toBe(3);

    expect(room.gameSnapshot()!.serverTime - before).toBeCloseTo(SERVER_TICK_MS * 3);
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

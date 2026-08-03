import { createServer } from "node:http";

import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { PLAYER_COLORS } from "../src/shared/constants";
import type {
  Ack,
  ClientToServerEvents,
  HostCommand,
  JoinPayload,
  JoinResult,
  ServerToClientEvents,
} from "../src/shared/protocol";
import { attachGameNetwork, type GameNetwork } from "../src/server/network";
import { GameRoom } from "../src/server/room";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function createHarness(): Promise<{ client: TestClient; network: GameNetwork }> {
  const server = createServer();
  const network = attachGameNetwork(server, new GameRoom(), "test-host-token");
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
  return { client, network };
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

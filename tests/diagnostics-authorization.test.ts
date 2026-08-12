import { createServer } from "node:http";

import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import type { ClientDiagnosticSample, HostDiagnosticsSnapshot } from "../src/shared/diagnostics";
import type { Ack, ClientToServerEvents, JoinResult, ServerToClientEvents } from "../src/shared/protocol";
import { attachGameNetwork } from "../src/server/network";
import { GameRoom } from "../src/server/room";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("host diagnostics authorization and lifecycle", () => {
  it("allows only a non-player loopback client with the host token", async () => {
    const { player, host, network } = await createHarness();
    await join(player);

    await expect(subscribe(player, "test-host-token")).resolves.toMatchObject({ ok: false });
    await expect(subscribe(host, "wrong")).resolves.toMatchObject({ ok: false });
    await expect(subscribe(host, "test-host-token")).resolves.toEqual({ ok: true });

    const hostJoin = await emitAck(host, "join", { nickname: "Former Host", characterId: "medic" }) as Ack<JoinResult>;
    expect(hostJoin.ok).toBe(true);
    const hostSocket = network.io.sockets.sockets.get(host.id!)!;
    expect(hostSocket.data.hostDiagnosticsAuthorized).toBe(false);
    expect(hostSocket.rooms.has("host-diagnostics")).toBe(false);
  });

  it("accepts one valid sample per rate window and emits an anonymous forced report", async () => {
    const { player, host, network } = await createHarness();
    const joined = await join(player);
    await subscribe(host, "test-host-token");
    await emitAck(player, "setReady", true);
    const sessionPromise = onceEvent(player, "diagnosticsSession");
    await emitAck(player, "hostCommand", { token: "test-host-token", command: "start" });
    const session = await sessionPromise;
    expect(session.matchId).toEqual(expect.any(String));

    const snapshotPromise = new Promise<HostDiagnosticsSnapshot>((resolve) => {
      const handler = (snapshot: HostDiagnosticsSnapshot) => {
        if (snapshot.players.some((entry) => entry.sample?.rttMs === 40)) {
          host.off("hostDiagnostics", handler);
          resolve(snapshot);
        }
      };
      host.on("hostDiagnostics", handler);
    });
    player.emit("diagnosticsSample", { ...sample(session.matchId!), token: "must-not-survive", payload: "small-extra" } as ClientDiagnosticSample);
    player.emit("diagnosticsSample", sample(session.matchId!, { rttMs: 180 }));
    network.advance(1_000);
    await expect(snapshotPromise).resolves.toMatchObject({
      players: [expect.objectContaining({ playerId: joined.playerId, sample: expect.objectContaining({ rttMs: 40 }) })],
      server: expect.objectContaining({ acceptedSamples: 1, rejectedSamples: 1 }),
    });

    const reportPromise = onceEvent(host, "diagnosticReport");
    await emitAck(player, "hostCommand", { token: "test-host-token", command: "end" });
    const report = await reportPromise;
    expect(report.endReason).toBe("forced");
    expect(report.players[0]?.alias).toBe("P1");
    expect(JSON.stringify(report)).not.toContain(joined.playerId);
    expect(JSON.stringify(report)).not.toContain("must-not-survive");
    expect(JSON.stringify(report)).not.toContain("payload");
  });
});

async function createHarness(): Promise<{ player: TestClient; host: TestClient; network: ReturnType<typeof attachGameNetwork> }> {
  const server = createServer();
  const room = new GameRoom();
  const network = attachGameNetwork(server, room, "test-host-token", () => [], "4.3.2");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test port");
  const url = `http://127.0.0.1:${address.port}`;
  const player = await connect(url);
  const host = await connect(url);
  cleanups.push(async () => {
    player.disconnect();
    host.disconnect();
    await network.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { player, host, network };
}

async function connect(url: string): Promise<TestClient> {
  const client = createClient(url, { transports: ["websocket"], forceNew: true });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return client;
}

async function join(client: TestClient): Promise<JoinResult> {
  const result = await emitAck(client, "join", { nickname: "Player", characterId: "blaze" }) as Ack<JoinResult>;
  if (!result.ok || !result.data) throw new Error("join failed");
  return result.data;
}

function subscribe(client: TestClient, token: string): Promise<Ack> {
  return new Promise((resolve) => client.emit("subscribeHostDiagnostics", { token }, resolve));
}

function onceEvent<E extends keyof ServerToClientEvents>(client: TestClient, event: E): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => client.once(event, resolve as never));
}

function emitAck(client: TestClient, event: string, payload: unknown): Promise<Ack | Ack<JoinResult>> {
  const emit = client.emit.bind(client) as unknown as (name: string, value: unknown, acknowledge: (result: Ack | Ack<JoinResult>) => void) => void;
  return new Promise((resolve) => emit(event, payload, resolve));
}

function sample(matchId: string, overrides: Partial<ClientDiagnosticSample> = {}): ClientDiagnosticSample {
  return {
    schemaVersion: 1, matchId, sampledAt: Date.now(), rttMs: 40,
    inputAckP50Ms: 30, inputAckP95Ms: 40, inputAckMaxMs: 45,
    frameP50Ms: 16, frameP95Ms: 18, frameMaxMs: 20,
    correctionP95Px: 2, correctionMaxPx: 4, hardCorrections: 0, stalls: 0,
    pendingInputs: 0, reconnects: 0, connected: true,
    network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false },
    ...overrides,
  };
}

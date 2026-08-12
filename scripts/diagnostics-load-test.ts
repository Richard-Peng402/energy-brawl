import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { io as createClient, type Socket as ClientSocket } from "socket.io-client";

import { CHARACTER_CATALOG } from "../src/shared/character-catalog";
import type { ClientDiagnosticSample } from "../src/shared/diagnostics";
import type { Ack, ClientToServerEvents, JoinResult, ServerToClientEvents } from "../src/shared/protocol";
import { attachGameNetwork } from "../src/server/network";
import { GameRoom } from "../src/server/room";

type LoadClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

export interface DiagnosticsLoadOptions {
  simulatedSeconds?: number;
  clients?: number;
  includeInvalidProbes?: boolean;
}

export interface DiagnosticsLoadReport {
  clients: number;
  simulatedSeconds: number;
  acceptedSamples: number;
  rejectedSamples: number;
  invalidProbesRejected: number;
  hostSnapshots: number;
  aggregateP95Ms: number;
  maxSerializedSampleBytes: number;
  connectedPlayers: number;
}

export async function runDiagnosticsLoadTest(options: DiagnosticsLoadOptions = {}): Promise<DiagnosticsLoadReport> {
  const simulatedSeconds = options.simulatedSeconds ?? 60;
  const clientCount = options.clients ?? 6;
  if (clientCount !== 6) throw new Error("diagnostics load gate requires six clients");
  let clock = 1_000;
  const server = createServer();
  const room = new GameRoom();
  const network = attachGameNetwork(server, room, "load-host-token", () => [], "4.3.2", () => clock);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("diagnostics load server did not bind");
  const url = `http://127.0.0.1:${address.port}`;
  const clients: LoadClient[] = [];
  let host: LoadClient | null = null;
  try {
    for (let index = 0; index < clientCount; index += 1) {
      const client = await connect(url);
      clients.push(client);
      const joined = await emitAck<JoinResult>(client, "join", { nickname: `Load${index + 1}`, characterId: CHARACTER_CATALOG[index]!.id });
      if (!joined.ok) throw new Error(`load client ${index + 1} failed to join`);
      await emitAck(client, "setReady", true);
    }
    host = await connect(url);
    const subscribed = await emitAck(host, "subscribeHostDiagnostics", { token: "load-host-token" });
    if (!subscribed.ok) throw new Error("load host failed to subscribe");

    const sessionPromise = onceEvent(clients[0]!, "diagnosticsSession");
    const started = await emitAck(clients[0]!, "hostCommand", { token: "load-host-token", command: "start" });
    if (!started.ok) throw new Error("diagnostics load match failed to start");
    const { matchId } = await sessionPromise;
    if (!matchId) throw new Error("diagnostics session id missing");

    let hostSnapshots = 0;
    let acceptedSamples = 0;
    let rejectedSamples = 0;
    let maxSerializedSampleBytes = 0;
    host.on("hostDiagnostics", (snapshot) => {
      if (!snapshot.server) return;
      hostSnapshots += 1;
      acceptedSamples += snapshot.server.acceptedSamples;
      rejectedSamples += snapshot.server.rejectedSamples;
    });

    for (let second = 1; second <= simulatedSeconds; second += 1) {
      clock += 1_000;
      const processed = clients.map((client) => waitForServerEvent(network, client.id!, "diagnosticsSample"));
      clients.forEach((client, index) => {
        const value = diagnosticSample(matchId, clock, index);
        maxSerializedSampleBytes = Math.max(maxSerializedSampleBytes, Buffer.byteLength(JSON.stringify(value)));
        client.emit("diagnosticsSample", value);
      });
      await Promise.all(processed);
      if (options.includeInvalidProbes && second === 1) {
        const serverEvent = waitForServerEvent(network, clients[0]!.id!, "diagnosticsSample");
        clients[0]!.emit("diagnosticsSample", diagnosticSample(matchId, clock, 0, { rttMs: 180 }));
        await serverEvent;
        const invalidEvent = waitForServerEvent(network, clients[1]!.id!, "diagnosticsSample");
        const unsafeEmit = clients[1]!.emit.bind(clients[1]) as unknown as (event: string, payload: unknown) => void;
        unsafeEmit("diagnosticsSample", { ...diagnosticSample(matchId, clock, 1), payload: "x".repeat(10_000) });
        await invalidEvent;
      }
      const hostSnapshot = waitForHostSnapshot(host, clock);
      network.advance(1_000);
      await hostSnapshot;
    }

    const aggregationTiming = network.diagnosticsTiming();
    return {
      clients: clientCount,
      simulatedSeconds,
      acceptedSamples,
      rejectedSamples,
      invalidProbesRejected: options.includeInvalidProbes ? rejectedSamples : 0,
      hostSnapshots,
      aggregateP95Ms: aggregationTiming.p95,
      maxSerializedSampleBytes,
      connectedPlayers: clients.filter((client) => client.connected).length,
    };
  } finally {
    clients.forEach((client) => client.disconnect());
    host?.disconnect();
    await network.close();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export function validateDiagnosticsLoadReport(report: DiagnosticsLoadReport): string[] {
  const errors: string[] = [];
  if (report.clients !== 6) errors.push("expected six clients");
  if (report.acceptedSamples !== report.clients * report.simulatedSeconds) errors.push(`accepted sample mismatch: ${report.acceptedSamples}`);
  const expectedRejectedSamples = report.invalidProbesRejected > 0 ? 2 : 0;
  if (report.rejectedSamples !== expectedRejectedSamples || report.invalidProbesRejected !== expectedRejectedSamples) {
    errors.push(`rejected sample mismatch: ${report.rejectedSamples}/${report.invalidProbesRejected}`);
  }
  if (report.hostSnapshots < Math.max(1, report.simulatedSeconds - 1)) errors.push(`host snapshots too low: ${report.hostSnapshots}`);
  if (report.aggregateP95Ms >= 5) errors.push(`aggregate p95 too high: ${report.aggregateP95Ms.toFixed(3)}ms`);
  if (report.maxSerializedSampleBytes >= 2_048) errors.push(`sample too large: ${report.maxSerializedSampleBytes}`);
  if (report.connectedPlayers !== 6) errors.push(`connected players: ${report.connectedPlayers}`);
  return errors;
}

function diagnosticSample(matchId: string, sampledAt: number, index: number, overrides: Partial<ClientDiagnosticSample> = {}): ClientDiagnosticSample {
  return {
    schemaVersion: 1, matchId, sampledAt, rttMs: 35 + index,
    inputAckP50Ms: 28, inputAckP95Ms: 42, inputAckMaxMs: 50,
    frameP50Ms: 16, frameP95Ms: 18, frameMaxMs: 22,
    correctionP95Px: 2, correctionMaxPx: 4, hardCorrections: 0, stalls: 0,
    pendingInputs: 1, reconnects: 0, connected: true,
    network: { effectiveType: "4g", downlinkMbps: 20, estimatedRttMs: 30, saveData: false },
    ...overrides,
  };
}

async function connect(url: string): Promise<LoadClient> {
  const client = createClient(url, { transports: ["websocket"], forceNew: true });
  await new Promise<void>((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
  return client;
}

function emitAck<T = undefined>(client: LoadClient, event: string, payload: unknown): Promise<Ack<T>> {
  const emit = client.emit.bind(client) as unknown as (name: string, value: unknown, acknowledge: (result: Ack<T>) => void) => void;
  return new Promise((resolve) => emit(event, payload, resolve));
}

function onceEvent<E extends keyof ServerToClientEvents>(client: LoadClient, event: E): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => client.once(event, resolve as never));
}

function waitForServerEvent(network: ReturnType<typeof attachGameNetwork>, socketId: string, event: string): Promise<void> {
  const socket = network.io.sockets.sockets.get(socketId);
  if (!socket) throw new Error("server socket missing");
  return new Promise((resolve) => socket.once(event as never, () => queueMicrotask(resolve)));
}

function waitForHostSnapshot(host: LoadClient, sampledAt: number): Promise<void> {
  return new Promise((resolve) => {
    const handler: ServerToClientEvents["hostDiagnostics"] = (snapshot) => {
      if (snapshot.server?.sampledAt !== sampledAt) return;
      host.off("hostDiagnostics", handler);
      queueMicrotask(resolve);
    };
    host.on("hostDiagnostics", handler);
  });
}

async function main(): Promise<void> {
  const report = await runDiagnosticsLoadTest({ includeInvalidProbes: true });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const errors = validateDiagnosticsLoadReport(report);
  if (errors.length) { process.stderr.write(`${errors.join("; ")}\n`); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

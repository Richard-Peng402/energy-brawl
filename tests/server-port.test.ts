import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { listenOnAvailablePort } from "../src/server/port";

const servers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  servers.clear();
});

describe("listenOnAvailablePort", () => {
  it("uses the next port when the preferred port is occupied", async () => {
    const blocker = createServer();
    servers.add(blocker);
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const address = blocker.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");

    const server = createServer();
    servers.add(server);
    const selectedPort = await listenOnAvailablePort(server, address.port, "127.0.0.1", 3);

    expect(selectedPort).toBe(address.port + 1);
  });

  it("returns the actual operating-system port when zero requests an ephemeral port", async () => {
    const server = createServer();
    servers.add(server);

    const selectedPort = await listenOnAvailablePort(server, 0, "127.0.0.1");

    expect(selectedPort).toBeGreaterThan(0);
    expect(server.address()).toMatchObject({ port: selectedPort });
  });
});

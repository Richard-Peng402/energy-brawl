import type { Server } from "node:http";

export async function listenOnAvailablePort(
  server: Server,
  preferredPort: number,
  host: string,
  attempts = 20,
): Promise<number> {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = preferredPort + offset;
    try {
      await listen(server, port, host);
      return port;
    } catch (error) {
      if (!isAddressInUse(error) || offset === attempts - 1) throw error;
    }
  }
  throw new Error("No available port found");
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

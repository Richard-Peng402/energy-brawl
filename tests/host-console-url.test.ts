import { describe, expect, it } from "vitest";

import { localHostConsoleUrl } from "../src/client/host-console-url";

describe("host console local-only redirect", () => {
  it("redirects a LAN-hosted control page to the server PC loopback address", () => {
    expect(localHostConsoleUrl({ protocol: "http:", hostname: "192.168.1.10", port: "3000", pathname: "/host", search: "?token=secret" }))
      .toBe("http://127.0.0.1:3000/host?token=secret");
  });

  it("does not redirect an already local control page", () => {
    expect(localHostConsoleUrl({ protocol: "http:", hostname: "127.0.0.1", port: "3000", pathname: "/host", search: "?token=secret" }))
      .toBeNull();
    expect(localHostConsoleUrl({ protocol: "http:", hostname: "localhost", port: "3000", pathname: "/host", search: "?token=secret" }))
      .toBeNull();
  });
});

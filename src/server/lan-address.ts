import type { NetworkInterfaceInfo } from "node:os";

type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

export function getLanAddresses(port: number, interfaces: NetworkInterfaces): string[] {
  const addresses: Array<{ address: string; fallback: boolean }> = [];
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivateAddress(entry.address)) {
        addresses.push({
          address: entry.address,
          fallback: entry.address === "192.168.137.1",
        });
      }
    }
  }

  addresses.sort((left, right) => Number(left.fallback) - Number(right.fallback));
  const uniqueAddresses = [...new Set(addresses.map(({ address }) => address))];
  return uniqueAddresses.length > 0
    ? uniqueAddresses.map((address) => `http://${address}:${port}/`)
    : [`http://127.0.0.1:${port}/`];
}

function isPrivateAddress(address: string): boolean {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

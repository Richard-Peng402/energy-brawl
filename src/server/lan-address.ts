import type { NetworkInterfaceInfo } from "node:os";

type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

export function getLanAddresses(port: number, interfaces: NetworkInterfaces): string[] {
  const addresses: Array<{ address: string; priority: number }> = [];
  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivateAddress(entry.address)) {
        addresses.push({
          address: entry.address,
          priority: interfacePriority(interfaceName, entry.address),
        });
      }
    }
  }

  addresses.sort((left, right) => left.priority - right.priority || left.address.localeCompare(right.address));
  const uniqueAddresses = [...new Set(addresses.map(({ address }) => address))];
  return uniqueAddresses.length > 0
    ? uniqueAddresses.map((address) => `http://${address}:${port}/`)
    : [`http://127.0.0.1:${port}/`];
}

function interfacePriority(interfaceName: string, address: string): number {
  const normalized = interfaceName.toLowerCase();
  if (/vethernet|virtual|vmware|virtualbox|hyper-v|wsl|docker|loopback|tap|tun|vpn/.test(normalized)) return 100;
  if (address === "192.168.137.1") return 80;
  if (/wlan|wi-?fi|wireless|无线/.test(normalized)) return 0;
  if (/ethernet|以太网/.test(normalized)) return 10;
  return 30;
}

function isPrivateAddress(address: string): boolean {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

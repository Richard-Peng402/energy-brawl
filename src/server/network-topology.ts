import { createHash } from "node:crypto";
import { networkInterfaces as readNetworkInterfaces, type NetworkInterfaceInfo } from "node:os";

import { gateway4async as readDefaultGateway } from "default-gateway";
import type { NetworkCandidate, NetworkKind, NetworkSnapshot, NetworkStatus } from "../shared/network";

export type NetworkInterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;
export type { NetworkCandidate, NetworkKind, NetworkSnapshot, NetworkStatus } from "../shared/network";

export interface DefaultGateway {
  interface: string;
  gateway: string;
}

export interface NetworkDiscoveryInput {
  port: number;
  interfaces?: NetworkInterfaceMap;
  defaultGateway?: DefaultGateway | null;
  checkedAt?: number;
}

type RankedCandidate = NetworkCandidate & { sharesDefaultGatewaySubnet: boolean };

export async function discoverNetworkSnapshot(input: NetworkDiscoveryInput): Promise<NetworkSnapshot> {
  const interfaces = input.interfaces ?? readNetworkInterfaces();
  const gateway = input.defaultGateway === undefined ? await getDefaultGateway() : input.defaultGateway;
  return buildNetworkSnapshot(input.port, interfaces, gateway, input.checkedAt ?? Date.now());
}

function buildNetworkSnapshot(
  port: number,
  interfaces: NetworkInterfaceMap,
  gateway: DefaultGateway | null,
  checkedAt: number,
): NetworkSnapshot {
  const candidates: RankedCandidate[] = [];

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal || !isUsableAddress(entry.address)) continue;
      const kind = classifyInterface(interfaceName, entry.address);
      candidates.push({
        interfaceName,
        address: entry.address,
        kind,
        isDefaultRoute: gateway?.interface === interfaceName,
        url: buildUrl(entry.address, port),
        sharesDefaultGatewaySubnet: gateway?.interface === interfaceName && sameSubnet(entry.address, gateway.gateway, entry.netmask),
      });
    }
  }

  const rankedCandidates = uniqueByAddress(candidates).sort(compareCandidates);
  const routable = rankedCandidates.filter((candidate) => candidate.kind !== "virtual");
  const primary = choosePrimary(routable, gateway);
  const status = getStatus(routable, primary);
  const candidatesForSnapshot = rankedCandidates.map(stripRankingMetadata);
  const warnings = getWarnings(status, candidatesForSnapshot, gateway);
  const primaryUrl = primary?.url ?? null;
  const revision = createRevision(port, status, primaryUrl, candidatesForSnapshot);

  return { revision, checkedAt, status, primaryUrl, candidates: candidatesForSnapshot, warnings };
}

function choosePrimary(candidates: RankedCandidate[], gateway: DefaultGateway | null): RankedCandidate | undefined {
  if (gateway) {
    const subnetMatch = candidates.find((candidate) => candidate.sharesDefaultGatewaySubnet);
    if (subnetMatch) return subnetMatch;
    const routed = candidates.find((candidate) => candidate.isDefaultRoute);
    if (routed) return routed;
  }

  return [...candidates].sort(compareCandidates)[0];
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  const priority = (candidate: RankedCandidate): number => {
    if (candidate.sharesDefaultGatewaySubnet) return 0;
    if (candidate.isDefaultRoute) return 1;
    if (candidate.kind === "wifi") return 10;
    if (candidate.kind === "ethernet") return 20;
    if (candidate.kind === "hotspot") return 30;
    if (candidate.kind === "unknown") return 40;
    return 100;
  };
  return priority(left) - priority(right) || left.address.localeCompare(right.address);
}

function getStatus(candidates: RankedCandidate[], primary: RankedCandidate | undefined): NetworkStatus {
  if (!primary) return "unavailable";
  if (candidates.length === 1 && primary.kind === "hotspot") return "hotspot-only";
  return "ready";
}

function getWarnings(status: NetworkStatus, candidates: NetworkCandidate[], gateway: DefaultGateway | null): string[] {
  const warnings: string[] = [];
  if (status === "hotspot-only") warnings.push("当前仅检测到电脑热点，其他设备需要连接该热点。");
  if (status === "unavailable") warnings.push("没有可用于局域网访问的物理网卡地址。");
  if (candidates.some((candidate) => candidate.kind === "virtual")) warnings.push("检测到虚拟网卡，已排除其作为主要加入地址。");
  if (!gateway && status === "ready") warnings.push("未检测到默认路由，已按物理网卡优先级选择地址。");
  return warnings;
}

function uniqueByAddress(candidates: RankedCandidate[]): RankedCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.address)) return false;
    seen.add(candidate.address);
    return true;
  });
}

function stripRankingMetadata(candidate: RankedCandidate): NetworkCandidate {
  const { sharesDefaultGatewaySubnet: _ignored, ...networkCandidate } = candidate;
  return networkCandidate;
}

function classifyInterface(interfaceName: string, address: string): NetworkKind {
  if (address === "192.168.137.1" || /hotspot|mobile\s*hotspot|移动热点|WLAN\s*4/i.test(interfaceName)) return "hotspot";
  if (/vethernet|virtual|vmware|virtualbox|hyper-v|wsl|docker|loopback|tap|tun|vpn/i.test(interfaceName)) return "virtual";
  if (/wlan|wi-?fi|wireless|wifi|无线/i.test(interfaceName)) return "wifi";
  if (/ethernet|以太网|^eth\d*$|^en\w*/i.test(interfaceName)) return "ethernet";
  return "unknown";
}

function isUsableAddress(address: string): boolean {
  if (!isIPv4(address)) return false;
  if (address.startsWith("127.")) return false;
  if (address.startsWith("169.254.")) return false;
  if (address === "0.0.0.0") return false;
  return true;
}

function isIPv4(address: string): boolean {
  const octets = address.split(".");
  return octets.length === 4 && octets.every((octet) => /^\d+$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255);
}

function sameSubnet(address: string, gateway: string, netmask: string): boolean {
  const addressValue = ipv4ToNumber(address);
  const gatewayValue = ipv4ToNumber(gateway);
  const maskValue = ipv4ToNumber(netmask);
  return addressValue !== null && gatewayValue !== null && maskValue !== null &&
    (addressValue & maskValue) === (gatewayValue & maskValue);
}

function ipv4ToNumber(address: string): number | null {
  if (!isIPv4(address)) return null;
  return address.split(".").reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function buildUrl(address: string, port: number): string {
  return `http://${address}:${port}/`;
}

function createRevision(port: number, status: NetworkStatus, primaryUrl: string | null, candidates: NetworkCandidate[]): string {
  const fingerprint = candidates.map(({ interfaceName, address, kind, isDefaultRoute }) => ({ interfaceName, address, kind, isDefaultRoute }));
  return createHash("sha1")
    .update(JSON.stringify({ port, status, primaryUrl, candidates: fingerprint }))
    .digest("hex")
    .slice(0, 12);
}

async function getDefaultGateway(): Promise<DefaultGateway | null> {
  try {
    const result = await readDefaultGateway();
    if (!result.int) return null;
    return { interface: result.int, gateway: result.gateway };
  } catch {
    return null;
  }
}

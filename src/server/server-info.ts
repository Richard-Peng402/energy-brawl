import type { NetworkSnapshot } from "../shared/network";
import type { RoomSnapshot, ServerInfo } from "../shared/protocol";

interface HeaderWriter {
  setHeader(name: string, value: string): unknown;
}

export function buildServerInfo(network: NetworkSnapshot, room: RoomSnapshot, version: string): ServerInfo {
  const joinUrls = network.status === "unavailable"
    ? []
    : network.candidates
      .filter((candidate) => candidate.kind !== "virtual")
      .map((candidate) => candidate.url);

  return {
    name: "能量乱斗",
    version,
    joinUrls,
    qrDataUrls: [],
    network,
    room,
  };
}

export function getAllowedLanAddresses(network: NetworkSnapshot): string[] {
  return network.candidates
    .filter((candidate) => candidate.kind !== "virtual")
    .map((candidate) => candidate.address);
}

export function applyNoStoreHeaders(response: HeaderWriter): void {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
}

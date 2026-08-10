export type NetworkKind = "wifi" | "ethernet" | "hotspot" | "virtual" | "unknown";
export type NetworkStatus = "ready" | "hotspot-only" | "limited" | "unavailable";

export interface NetworkCandidate {
  interfaceName: string;
  address: string;
  kind: NetworkKind;
  isDefaultRoute: boolean;
  url: string;
}

export interface NetworkSnapshot {
  revision: string;
  checkedAt: number;
  status: NetworkStatus;
  primaryUrl: string | null;
  candidates: NetworkCandidate[];
  warnings: string[];
}

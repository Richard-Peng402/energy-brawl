import { DIAGNOSTIC_SCHEMA_VERSION, type DeviceDiagnosticProfile, type NetworkDiagnosticSummary } from "../shared/diagnostics";

export interface DeviceProfileNavigator {
  userAgent: string;
  maxTouchPoints: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgentData?: { model?: string };
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
}

export interface DeviceProfileScreen {
  width: number;
  height: number;
}

export function collectDeviceProfile(
  navigatorLike: DeviceProfileNavigator,
  screenLike: DeviceProfileScreen,
  devicePixelRatio: number,
): DeviceDiagnosticProfile {
  const browser = parseBrowser(navigatorLike.userAgent);
  const network = collectNetworkSummary(navigatorLike.connection);
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    browser: browser.name,
    browserVersion: browser.version,
    platform: parsePlatform(navigatorLike.userAgent),
    deviceModel: boundedText(navigatorLike.userAgentData?.model, 128),
    screenWidth: finiteOrZero(screenLike.width),
    screenHeight: finiteOrZero(screenLike.height),
    devicePixelRatio: finiteOrZero(devicePixelRatio),
    maxTouchPoints: integerOrZero(navigatorLike.maxTouchPoints),
    hardwareConcurrency: finiteOrNull(navigatorLike.hardwareConcurrency),
    deviceMemoryGb: finiteOrNull(navigatorLike.deviceMemory),
    network,
  };
}

export function collectNetworkSummary(connection: DeviceProfileNavigator["connection"]): NetworkDiagnosticSummary {
  return {
    effectiveType: boundedText(connection?.effectiveType, 32),
    downlinkMbps: finiteOrNull(connection?.downlink),
    estimatedRttMs: finiteOrNull(connection?.rtt),
    saveData: typeof connection?.saveData === "boolean" ? connection.saveData : null,
  };
}

function parseBrowser(userAgent: string): { name: string; version: string | null } {
  const candidates: Array<[string, RegExp]> = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, pattern] of candidates) {
    const match = userAgent.match(pattern);
    if (match) return { name, version: match[1]?.split(".")[0] ?? null };
  }
  return { name: "Unknown", version: null };
}

function parsePlatform(userAgent: string): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown";
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function finiteOrZero(value: unknown): number {
  return finiteOrNull(value) ?? 0;
}

function integerOrZero(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

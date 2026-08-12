import { isIP } from "node:net";

export function maskNetworkAddress(address: string | undefined): string {
  const normalized = normalizeAddress(address);
  if (!normalized) return "未知";
  if (normalized === "127.0.0.1" || normalized === "::1") return "本机";
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".");
    return `${octets[0]}.${octets[1]}.${octets[2]}.xxx`;
  }
  if (isIP(normalized) === 6) return maskIpv6(normalized);
  return "未知";
}

function normalizeAddress(address: string | undefined): string | null {
  if (!address) return null;
  const trimmed = address.trim().toLowerCase();
  const mapped = trimmed.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1] && isIP(mapped[1]) === 4) return mapped[1];
  return isIP(trimmed) > 0 ? trimmed : null;
}

function maskIpv6(address: string): string {
  const [head = "", tail = ""] = address.split("::", 2);
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    .map((group) => group.replace(/^0+(?=[0-9a-f])/, "") || "0");
  return `${groups.slice(0, 4).join(":")}::/64`;
}

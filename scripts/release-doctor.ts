import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { discoverNetworkSnapshot } from "../src/server/network-topology";
import type { NetworkSnapshot } from "../src/shared/network";

export interface DoctorResult {
  ok: boolean;
  message: string;
}

interface PackageMetadata {
  version?: string;
}

interface LockMetadata {
  packages?: { ""?: { version?: string } };
}

interface AssetEntry {
  outputFiles?: string[];
}

export interface FirewallRuleState {
  exists: boolean;
  profile?: string;
  protocol?: string;
  localPort?: string;
  remoteAddresses?: string[];
}

export function checkNodeVersion(version: string, minimumMajor = 22): DoctorResult {
  const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major >= minimumMajor
    ? { ok: true, message: `Node.js ${version} 可用。` }
    : { ok: false, message: `需要 Node.js ${minimumMajor} 或更高版本，当前为 ${version}。` };
}

export function checkPackageVersions(packageJson: PackageMetadata, lockJson: LockMetadata): DoctorResult {
  const packageVersion = packageJson.version;
  const lockVersion = lockJson.packages?.[""]?.version;
  return packageVersion && packageVersion === lockVersion
    ? { ok: true, message: `项目版本 ${packageVersion} 与锁文件一致。` }
    : { ok: false, message: `package.json (${packageVersion ?? "缺失"}) 与 package-lock.json (${lockVersion ?? "缺失"}) 版本不一致。` };
}

export function validateRuntimeAssets(entries: readonly AssetEntry[], existingPaths: ReadonlySet<string>): DoctorResult {
  const errors: string[] = [];
  for (const entry of entries) {
    for (const output of entry.outputFiles ?? []) {
      const normalized = output.replaceAll("\\", "/");
      if (!/^\/assets\/v[34]\//.test(normalized) || normalized.includes("..") || /^[A-Za-z]:\//.test(normalized)) {
        errors.push(`素材路径不在仓库运行目录内: ${output}`);
        continue;
      }
      const repositoryPath = `public${normalized}`;
      if (!existingPaths.has(repositoryPath)) errors.push(`缺少素材: ${repositoryPath}`);
    }
  }
  return errors.length === 0
    ? { ok: true, message: "运行时素材清单完整。" }
    : { ok: false, message: errors.join("\n") };
}

export function checkNetworkSnapshot(snapshot: NetworkSnapshot): DoctorResult {
  return snapshot.primaryUrl && snapshot.status !== "unavailable"
    ? { ok: true, message: `局域网加入地址: ${snapshot.primaryUrl}` }
    : {
        ok: false,
        message: "没有检测到可用的同一局域网地址。请连接真实 Wi-Fi/有线网络，并确认路由器未启用访客网络、AP 隔离或客户端隔离。",
      };
}

export function checkFirewallRule(platform: NodeJS.Platform, rule: FirewallRuleState): DoctorResult {
  if (platform !== "win32") return { ok: true, message: "当前系统不需要 Windows 防火墙规则。" };
  const valid = rule.exists &&
    rule.profile === "Any" &&
    rule.protocol === "TCP" &&
    rule.localPort === "3000-3010" &&
    rule.remoteAddresses?.length === 1 &&
    rule.remoteAddresses[0] === "LocalSubnet";
  return valid
    ? { ok: true, message: "Windows 局域网防火墙规则为 Any / TCP 3000-3010 / LocalSubnet。" }
    : {
        ok: false,
        message: "Windows 局域网防火墙规则缺失或参数过期。请以管理员身份运行 scripts/setup-lan-firewall.ps1。",
      };
}

async function runDoctor(): Promise<number> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageJson = await readJson<PackageMetadata>(path.join(root, "package.json"));
  const lockJson = await readJson<LockMetadata>(path.join(root, "package-lock.json"));
  const manifests = await Promise.all([
    readJson<{ entries: AssetEntry[] }>(path.join(root, "public/assets/v3/manifest.json")),
    readJson<{ entries: AssetEntry[] }>(path.join(root, "public/assets/v4/manifest.json")),
  ]);
  const entries = manifests.flatMap((manifest) => manifest.entries);
  const existingPaths = new Set<string>();
  for (const entry of entries) {
    for (const output of entry.outputFiles ?? []) {
      const repositoryPath = `public${output.replaceAll("\\", "/")}`;
      if (existsSync(path.join(root, repositoryPath))) existingPaths.add(repositoryPath);
    }
  }

  const network = await discoverNetworkSnapshot({ port: 3000 });
  const results = [
    checkNodeVersion(process.version),
    checkPackageVersions(packageJson, lockJson),
    validateRuntimeAssets(entries, existingPaths),
    checkNetworkSnapshot(network),
    checkFirewallRule(process.platform, readWindowsFirewallRule()),
  ];

  for (const result of results) console.log(`${result.ok ? "[OK]" : "[FAIL]"} ${result.message}`);
  return results.every((result) => result.ok) ? 0 : 1;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

function readWindowsFirewallRule(): FirewallRuleState {
  if (process.platform !== "win32") return { exists: true };
  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "$rule=Get-NetFirewallRule -DisplayName 'Energy Brawl LAN Server 3000-3010' -ErrorAction SilentlyContinue; if(-not $rule){'{\"exists\":false}'; exit}; $port=$rule|Get-NetFirewallPortFilter; $address=$rule|Get-NetFirewallAddressFilter; [pscustomobject]@{exists=$true;profile=[string]$rule.Profile;protocol=[string]$port.Protocol;localPort=[string]$port.LocalPort;remoteAddresses=@($address.RemoteAddress)}|ConvertTo-Json -Compress",
    ], { encoding: "utf8", windowsHide: true });
    return JSON.parse(output.trim()) as FirewallRuleState;
  } catch {
    return { exists: false };
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryPoint) process.exitCode = await runDoctor();

import {
  DIAGNOSTIC_SCHEMA_VERSION,
  sanitizeDiagnosticReport,
  type DiagnosticReport,
  type DiagnosticReportEnvelope,
} from "../shared/diagnostics";

const STORAGE_KEY = "energy-brawl.diagnostics-reports.v1";
const MAX_REPORTS = 10;

export interface DiagnosticsDownloadDependencies {
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  clickDownload(url: string, filename: string): void;
}

export class DiagnosticsReportStore {
  constructor(
    private readonly storage: Storage,
    private readonly downloads: DiagnosticsDownloadDependencies = browserDownloads(),
  ) {}

  save(report: DiagnosticReport): { persisted: boolean; reports: DiagnosticReport[] } {
    const sanitized = sanitizeReport(report);
    if (!sanitized) return { persisted: false, reports: this.list() };
    const current = this.list().filter((entry) => entry.matchId !== sanitized.matchId);
    let reports = [sanitized, ...current].sort((left, right) => right.finishedAt - left.finishedAt).slice(0, MAX_REPORTS);
    while (reports.length > 0) {
      try {
        this.persist(reports);
        return { persisted: true, reports };
      } catch {
        if (reports.length === 1) break;
        reports = reports.slice(0, -1);
      }
    }
    return { persisted: false, reports: current };
  }

  list(): DiagnosticReport[] {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const value = JSON.parse(raw) as unknown;
      if (!Array.isArray(value)) return [];
      return value.map(sanitizeReport).filter((report): report is DiagnosticReport => report !== null)
        .sort((left, right) => right.finishedAt - left.finishedAt).slice(0, MAX_REPORTS);
    } catch {
      return [];
    }
  }

  remove(matchId: string): void {
    this.persist(this.list().filter((report) => report.matchId !== matchId));
  }

  clear(): void {
    this.storage.removeItem(STORAGE_KEY);
  }

  serialize(matchIds?: readonly string[]): string {
    const selected = matchIds ? new Set(matchIds) : null;
    return serializeDiagnosticReports(this.list().filter((report) => !selected || selected.has(report.matchId)));
  }

  download(matchIds?: readonly string[]): void {
    const blob = new Blob([this.serialize(matchIds)], { type: "application/json;charset=utf-8" });
    const url = this.downloads.createObjectUrl(blob);
    try {
      this.downloads.clickDownload(url, `energy-brawl-diagnostics-${Date.now()}.json`);
    } finally {
      this.downloads.revokeObjectUrl(url);
    }
  }

  private persist(reports: readonly DiagnosticReport[]): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(reports.map(sanitizeReport).filter(Boolean)));
  }
}

export function serializeDiagnosticReports(reports: readonly DiagnosticReport[], exportedAt = Date.now()): string {
  const envelope: DiagnosticReportEnvelope = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    exportedAt,
    reports: reports.map(sanitizeReport).filter((report): report is DiagnosticReport => report !== null),
  };
  return JSON.stringify(envelope, null, 2);
}

function sanitizeReport(value: DiagnosticReport): DiagnosticReport | null {
  return sanitizeDiagnosticReport(value);
}

function browserDownloads(): DiagnosticsDownloadDependencies {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    clickDownload: (url, filename) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    },
  };
}

import type { ServerInfo } from "../shared/protocol";

export interface ServerInfoRefreshState {
  info: ServerInfo | null;
  stale: boolean;
  error: string | null;
  lastSuccessfulAt: number | null;
  networkChanged: boolean;
}

export interface ServerInfoRefreshOptions {
  fetchInfo?: (signal: AbortSignal) => Promise<ServerInfo>;
  intervalMs?: number;
  now?: () => number;
  windowTarget?: EventTarget | null;
  documentTarget?: EventTarget | null;
  isDocumentVisible?: () => boolean;
}

type Listener = (state: ServerInfoRefreshState) => void;

export class ServerInfoRefreshController {
  private readonly fetchInfo: (signal: AbortSignal) => Promise<ServerInfo>;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly windowTarget: EventTarget | null;
  private readonly documentTarget: EventTarget | null;
  private readonly isDocumentVisible: () => boolean;
  private readonly listeners = new Set<Listener>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private activeRequest: AbortController | null = null;
  private requestSequence = 0;
  private started = false;
  private currentState: ServerInfoRefreshState = {
    info: null,
    stale: false,
    error: null,
    lastSuccessfulAt: null,
    networkChanged: false,
  };

  constructor(options: ServerInfoRefreshOptions = {}) {
    this.fetchInfo = options.fetchInfo ?? fetchServerInfo;
    this.intervalMs = options.intervalMs ?? 3_000;
    this.now = options.now ?? Date.now;
    this.windowTarget = options.windowTarget ?? (typeof window === "undefined" ? null : window);
    this.documentTarget = options.documentTarget ?? (typeof document === "undefined" ? null : document);
    this.isDocumentVisible = options.isDocumentVisible ?? (() => typeof document === "undefined" || document.visibilityState === "visible");
  }

  get state(): ServerInfoRefreshState {
    return this.currentState;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.windowTarget?.addEventListener("online", this.handleImmediateRefresh);
    this.windowTarget?.addEventListener("focus", this.handleImmediateRefresh);
    this.documentTarget?.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.interval = setInterval(() => void this.refresh(), this.intervalMs);
    void this.refresh();
  }

  stop(): void {
    if (!this.started && !this.activeRequest) return;
    this.started = false;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.windowTarget?.removeEventListener("online", this.handleImmediateRefresh);
    this.windowTarget?.removeEventListener("focus", this.handleImmediateRefresh);
    this.documentTarget?.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.activeRequest?.abort();
    this.activeRequest = null;
    this.requestSequence += 1;
  }

  async refresh(): Promise<void> {
    const sequence = ++this.requestSequence;
    this.activeRequest?.abort();
    const request = new AbortController();
    this.activeRequest = request;

    try {
      const info = await this.fetchInfo(request.signal);
      if (sequence !== this.requestSequence) return;
      const previousRevision = this.currentState.info?.network.revision;
      this.currentState = {
        info,
        stale: false,
        error: null,
        lastSuccessfulAt: this.now(),
        networkChanged: previousRevision !== info.network.revision,
      };
      this.publish();
    } catch (error) {
      if (sequence !== this.requestSequence || request.signal.aborted) return;
      this.currentState = {
        ...this.currentState,
        stale: true,
        error: error instanceof Error ? error.message : "无法读取服务器信息",
        networkChanged: false,
      };
      this.publish();
    } finally {
      if (sequence === this.requestSequence) this.activeRequest = null;
    }
  }

  private readonly handleImmediateRefresh = (): void => {
    void this.refresh();
  };

  private readonly handleVisibilityChange = (): void => {
    if (this.isDocumentVisible()) void this.refresh();
  };

  private publish(): void {
    for (const listener of this.listeners) listener(this.currentState);
  }
}

async function fetchServerInfo(signal: AbortSignal): Promise<ServerInfo> {
  const response = await fetch("/api/info", { cache: "no-store", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json() as ServerInfo;
}

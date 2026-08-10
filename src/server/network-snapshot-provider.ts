import type { NetworkSnapshot } from "../shared/network";

export type NetworkSnapshotReader = () => Promise<NetworkSnapshot>;

export class NetworkSnapshotProvider {
  private cached: { snapshot: NetworkSnapshot; expiresAt: number } | null = null;
  private inFlight: Promise<NetworkSnapshot> | null = null;

  constructor(
    private readonly read: NetworkSnapshotReader,
    private readonly now: () => number = Date.now,
    private readonly cacheMs = 1_500,
  ) {}

  get(): Promise<NetworkSnapshot> {
    const currentTime = this.now();
    if (this.cached && currentTime < this.cached.expiresAt) return Promise.resolve(this.cached.snapshot);
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.read().then((snapshot) => {
      this.cached = { snapshot, expiresAt: this.now() + this.cacheMs };
      return snapshot;
    }).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}

export interface ViewportState {
  width: number;
  height: number;
  landscape: boolean;
  fullscreen: boolean;
}

interface VisualViewportLike extends EventTarget {
  width: number;
  height: number;
}

interface WindowLike extends EventTarget {
  innerWidth: number;
  innerHeight: number;
  visualViewport: VisualViewportLike | null;
}

interface DocumentLike extends EventTarget {
  fullscreenElement: object | null;
  hidden: boolean;
  documentElement: {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  };
}

interface ScreenLike {
  orientation?: {
    lock?: (orientation: string) => Promise<void>;
  };
}

export interface MobileViewportDependencies {
  window: WindowLike;
  document: DocumentLike;
  screen: ScreenLike;
}

export function readViewport(
  visualViewport: Pick<VisualViewportLike, "width" | "height"> | null,
  fallbackWidth: number,
  fallbackHeight: number,
  fullscreen: boolean,
): ViewportState {
  const width = visualViewport?.width ?? fallbackWidth;
  const height = visualViewport?.height ?? fallbackHeight;
  return {
    width,
    height,
    landscape: width >= height,
    fullscreen,
  };
}

export class MobileViewport {
  private readonly listeners = new Set<(state: ViewportState) => void>();
  private started = false;

  constructor(
    private readonly resetInput: () => void,
    private readonly dependencies: MobileViewportDependencies = {
      window,
      document,
      screen: screen as unknown as ScreenLike,
    },
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.dependencies.window.addEventListener("resize", this.onResize);
    this.dependencies.window.addEventListener("orientationchange", this.onDisruptiveChange);
    this.dependencies.window.addEventListener("blur", this.onDisruptiveChange);
    this.dependencies.window.visualViewport?.addEventListener("resize", this.onResize);
    this.dependencies.document.addEventListener("visibilitychange", this.onDisruptiveChange);
    this.dependencies.document.addEventListener("fullscreenchange", this.onDisruptiveChange);
    this.publish();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.dependencies.window.removeEventListener("resize", this.onResize);
    this.dependencies.window.removeEventListener("orientationchange", this.onDisruptiveChange);
    this.dependencies.window.removeEventListener("blur", this.onDisruptiveChange);
    this.dependencies.window.visualViewport?.removeEventListener("resize", this.onResize);
    this.dependencies.document.removeEventListener("visibilitychange", this.onDisruptiveChange);
    this.dependencies.document.removeEventListener("fullscreenchange", this.onDisruptiveChange);
  }

  subscribe(listener: (state: ViewportState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state());
    return () => this.listeners.delete(listener);
  }

  async requestFullscreen(): Promise<boolean> {
    const request = this.dependencies.document.documentElement.requestFullscreen;
    if (!request) return false;
    try {
      await request.call(this.dependencies.document.documentElement, { navigationUI: "hide" });
      const lock = this.dependencies.screen.orientation?.lock;
      if (lock) await lock.call(this.dependencies.screen.orientation, "landscape").catch(() => undefined);
      this.publish();
      return this.dependencies.document.fullscreenElement !== null;
    } catch {
      this.publish();
      return false;
    }
  }

  private state(): ViewportState {
    const { window: windowTarget, document: documentTarget } = this.dependencies;
    return readViewport(
      windowTarget.visualViewport,
      windowTarget.innerWidth,
      windowTarget.innerHeight,
      documentTarget.fullscreenElement !== null,
    );
  }

  private publish(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }

  private readonly onResize = (): void => {
    this.publish();
  };

  private readonly onDisruptiveChange = (): void => {
    this.resetInput();
    this.publish();
  };
}

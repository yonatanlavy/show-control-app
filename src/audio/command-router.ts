import type { AudioEngine, EngineCommand, EngineCommandWithoutId } from './contracts';

const bounceWindowMs = 120;
const priority: Record<EngineCommand['type'], number> = {
  PANIC_FADE: 100,
  STOP_ALL: 100,
  STOP: 90,
  PAUSE: 70,
  RESUME: 70,
  FADE: 60,
  TRIGGER_CUE: 50,
  TRIGGER_GROUP: 50,
  TRIGGER_HIT: 50,
  SEEK_REHEARSAL: 10,
  GO: 50,
  PLAY: 50,
  PREVIOUS: 80,
  SKIP: 80,
  REPLAY: 50,
  SELECT: 80,
  START_SELECTED: 50,
  SCHEDULE: 40,
};

export class SerializedCommandRouter {
  private nextId = 1;
  private queue: EngineCommand[] = [];
  private draining = false;
  private inFlight: EngineCommand | null = null;
  private generation = 0;
  private readonly reportedPreemptions = new Set<number>();
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly engine: AudioEngine,
    private readonly now = () => Date.now(),
    private readonly onDispatchError: (command: EngineCommand, error: unknown) => void = () => undefined,
    private readonly onCommandsCancelled: (commands: readonly EngineCommand[]) => void = () => undefined,
  ) {}

  /** Reattachment never resets native duplicate protection or reuses an ID. */
  advanceCommandId(watermark: number): void {
    if (!Number.isSafeInteger(watermark) || watermark < 0 || watermark >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid native command watermark');
    this.nextId = Math.max(this.nextId, watermark + 1);
  }

  /** Replace the command session without replaying work from its old snapshot. */
  invalidatePendingCommands(): void {
    const cancelled = [...(this.inFlight ? [this.inFlight] : []), ...this.queue];
    this.generation += 1;
    this.queue = [];
    this.inFlight = null;
    this.draining = false;
    this.reportedPreemptions.clear();
    this.seen.clear();
    if (cancelled.length > 0) this.onCommandsCancelled(Object.freeze(cancelled));
  }

  enqueue(command: EngineCommandWithoutId, inputFingerprint?: string): number | null {
    const stamp = this.now();
    if (inputFingerprint) {
      const previous = this.seen.get(inputFingerprint);
      if (previous !== undefined && stamp - previous < bounceWindowMs) return null;
      this.seen.set(inputFingerprint, stamp);
    }
    const full = { ...command, id: this.nextId++ } as EngineCommand;
    const cancelled: EngineCommand[] = [];
    if (priority[full.type] >= 90) {
      if (this.inFlight && priority[this.inFlight.type] < priority[full.type] && !this.reportedPreemptions.has(this.inFlight.id)) {
        cancelled.push(this.inFlight);
        this.reportedPreemptions.add(this.inFlight.id);
      }
      const kept: EngineCommand[] = [];
      for (const queued of this.queue) {
        if (priority[queued.type] >= priority[full.type]) kept.push(queued);
        else cancelled.push(queued);
      }
      this.queue = kept;
      // Safety crosses the bridge immediately. It must not wait for the promise
      // returned by an ordinary dispatch that may be slow or wedged.
      void this.dispatchSafety(full);
      if (cancelled.length > 0) {
        try { this.onCommandsCancelled(Object.freeze(cancelled)); } catch { /* Safety dispatch is already underway. */ }
      }
      return full.id;
    }
    this.queue.push(full);
    this.queue.sort((a, b) => priority[b.type] - priority[a.type] || a.id - b.id);
    void this.drain();
    return full.id;
  }

  private async dispatchSafety(command: EngineCommand): Promise<void> {
    const generation = this.generation;
    try {
      if (this.engine.dispatchUrgent) await this.engine.dispatchUrgent(command);
      else await this.engine.dispatch(command);
    } catch (error) {
      if (generation === this.generation) this.onDispatchError(command, error);
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    const generation = this.generation;
    this.draining = true;
    try {
      while (generation === this.generation && this.queue.length) {
        const command = this.queue.shift();
        if (command) {
          this.inFlight = command;
          try {
            await this.engine.dispatch(command);
          } catch (error) {
            if (generation === this.generation) this.onDispatchError(command, error);
          } finally {
            if (generation === this.generation) {
              if (this.inFlight?.id === command.id) this.inFlight = null;
              this.reportedPreemptions.delete(command.id);
            }
          }
        }
      }
    } finally {
      if (generation === this.generation) this.draining = false;
    }
  }
}

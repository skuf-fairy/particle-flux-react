import type { ITicker } from 'particle-flux';

/** One owned RAF for both simulation and drawing, with stale-callback protection. */
export class RenderTicker implements ITicker {
  started = false;
  deltaMS = 0;
  elapsedDelta = 0;
  private previous: number | null = null;
  private frame: number | undefined;
  private generation = 0;
  private callback: (elapsedDelta: number, deltaMS: number) => void = () => {};

  constructor(private readonly owner: Window, private readonly draw: () => void) {}
  get FPS(): number { return this.deltaMS > 0 ? 1000 / this.deltaMS : 0; }
  setCallback(callback: (elapsedDelta: number, deltaMS: number) => void): void { this.callback = callback; }
  start(): void {
    if (this.started) return;
    this.started = true;
    const generation = ++this.generation;
    const tick = (time: number) => {
      if (!this.started || generation !== this.generation) return;
      this.deltaMS = this.previous === null ? 0 : Math.max(0, time - this.previous);
      this.previous = time;
      this.elapsedDelta = this.deltaMS / (1000 / 60);
      try {
        if (this.deltaMS > 0) this.callback(this.elapsedDelta, this.deltaMS);
        this.draw();
      } catch (error) {
        this.stop();
        throw error;
      }
      if (this.started && generation === this.generation) this.frame = this.owner.requestAnimationFrame(tick);
    };
    this.frame = this.owner.requestAnimationFrame(tick);
  }
  stop(): void {
    this.started = false;
    this.generation++;
    if (this.frame !== undefined) this.owner.cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.previous = null;
    this.deltaMS = this.elapsedDelta = 0;
  }
}

export interface FrameStats {
  fps: number;
  averageMS: number;
  p95MS: number;
  slowFramesPercent: number;
  frames: number;
  elapsedMS: number;
}

/** RAF cadence for the whole page, not CPU/GPU draw duration. */
export function summarizeFrames(intervals: readonly number[]): FrameStats | null {
  const valid = intervals.filter((value) => Number.isFinite(value) && value > 0);
  if (!valid.length) return null;
  const elapsedMS = valid.reduce((total, value) => total + value, 0);
  const ordered = [...valid].sort((a, b) => a - b);
  return {
    fps: valid.length * 1000 / elapsedMS,
    averageMS: elapsedMS / valid.length,
    p95MS: ordered[Math.ceil(ordered.length * 0.95) - 1],
    slowFramesPercent: valid.filter((value) => value > 1000 / 30).length * 100 / valid.length,
    frames: valid.length,
    elapsedMS,
  };
}

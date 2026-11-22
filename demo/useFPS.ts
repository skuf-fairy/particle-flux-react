import { useEffect, useState } from 'react';
import { summarizeFrames } from './performance';
import type { FrameStats } from './performance';

export function useFPS(enabled: boolean, resetKey: string): FrameStats | null {
  const [stats, setStats] = useState<FrameStats | null>(null);
  useEffect(() => {
    let frame = 0;
    let alive = true;
    let previous: number | null = null;
    let intervals: number[] = [];
    let elapsed = 0;
    setStats(null);
    if (!enabled) return;
    const tick = (time: number) => {
      if (!alive) return;
      if (!document.hidden) {
        if (previous !== null && time > previous) {
          const delta = time - previous;
          intervals.push(delta); elapsed += delta;
          if (elapsed >= 500) {
            setStats(summarizeFrames(intervals));
            intervals = []; elapsed = 0;
          }
        }
        previous = time;
      }
      frame = window.requestAnimationFrame(tick);
    };
    const reset = () => { previous = null; intervals = []; elapsed = 0; setStats(null); };
    document.addEventListener('visibilitychange', reset);
    frame = window.requestAnimationFrame(tick);
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', reset);
    };
  }, [enabled, resetKey]);
  return enabled ? stats : null;
}

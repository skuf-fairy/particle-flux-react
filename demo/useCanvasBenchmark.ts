import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ParticleEmitterConfig } from 'particle-flux';
import type { ParticleEmitterHandle } from '../src';
import { summarizeFrames } from './performance';
import type { FrameStats } from './performance';

export interface BenchmarkRun {
  id: number;
  count: number;
  width: number;
  height: number;
  pixelRatio: number;
  warmupMS: number;
  durationMS: number;
}
export interface BenchmarkResult extends FrameStats {
  id: number; width: number; height: number; pixelRatio: number;
  particles: number;
  nodes: number;
}
export interface BenchmarkSettings {
  count: number;
  width: number;
  height: number;
  pixelRatio: number;
  warmupMS?: number;
  durationMS?: number;
}

/** Fixed population, fixed Canvas scene; no particles die during a run. */
export function benchmarkConfig(run: BenchmarkRun): ParticleEmitterConfig {
  return {
    emitterConfig: { spawnInterval: 1e9, spawnParticlesPerWave: run.count, maxParticles: run.count },
    particleConfig: {
      lifeTime: { value: Infinity },
      spawnPosition: { x: run.width * 0.3, y: run.height * 0.3 },
      spawnShape: { shape: { type: 'Rectangle', x: 0, y: 0, width: run.width * 0.4, height: run.height * 0.4 } },
      direction: { minAngle: 0, maxAngle: 360 },
      speed: { timelapses: [{ time: 0, value: 0.2 }] },
    },
  };
}

export function useCanvasBenchmark(
  controller: RefObject<ParticleEmitterHandle | null>, host: HTMLElement | null,
) {
  const sequence = useRef(0);
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'warmup' | 'measuring'>('idle');
  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState<FrameStats | null>(null);
  const [message, setMessage] = useState('');
  const [population, setPopulation] = useState({ active: 0, nodes: 0 });
  const cancel = useCallback((reason = 'Замер остановлен. Завершённые результаты сохранены.') => {
    sequence.current++;
    setRun(null); setPhase('idle'); setProgress(0); setLive(null); setMessage(reason); setPopulation({ active: 0, nodes: 0 });
  }, []);
  const start = useCallback((settings: BenchmarkSettings) => {
    if (!host || document.hidden) return;
    host.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    const id = ++sequence.current;
    setMessage(''); setProgress(0); setLive(null); setPhase('loading');
    setPopulation({ active: 0, nodes: 0 });
    setRun({ ...settings, id, warmupMS: settings.warmupMS ?? 1000, durationMS: settings.durationMS ?? 5000 });
  }, [host]);

  useEffect(() => {
    if (!run || !host) return;
    let alive = true;
    let frame = 0;
    let warmupStart: number | null = null;
    let previous: number | null = null;
    let measuringStart: number | null = null;
    let lastPublish = 0;
    const intervals: number[] = [];
    const isCurrent = () => alive && sequence.current === run.id;
    const tick = (time: number) => {
      if (!isCurrent()) return;
      const emitter = controller.current;
      if (emitter?.isEmitActive() && emitter.getParticlesCount() === run.count) {
        if (warmupStart === null) {
          warmupStart = time; setPhase('warmup');
          setPopulation({ active: emitter.getParticlesCount(), nodes: host.querySelectorAll('*').length });
        }
        if (time - warmupStart >= run.warmupMS) {
          if (measuringStart === null) {
            measuringStart = previous = time;
            setPhase('measuring');
          } else if (previous !== null && time > previous) {
            intervals.push(time - previous); previous = time;
            if (time - lastPublish >= 500) {
              setLive(summarizeFrames(intervals));
              setProgress(Math.min(1, (time - measuringStart) / run.durationMS));
              lastPublish = time;
            }
            if (time - measuringStart >= run.durationMS) {
              const stats = summarizeFrames(intervals)!;
              setResults((current) => [...current, {
                ...stats, id: run.id, width: run.width, height: run.height, pixelRatio: run.pixelRatio, particles: emitter.getParticlesCount(), nodes: host.querySelectorAll('*').length,
              }].slice(-8));
              setLive(null); setProgress(0); setPopulation({ active: 0, nodes: 0 });
              setRun(null); setPhase('idle'); setMessage('Замер завершён. Настройки обычного режима восстановлены.');
              return;
            }
          }
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    const onVisibility = () => { if (document.hidden) cancel('Измерение прервано: вкладка была скрыта. Запустите заново в активной вкладке.'); };
    const onResize = () => cancel('Измерение прервано: размер окна изменился. Запустите заново для одинаковой площади сцены.');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      if ((!entry.isIntersecting || entry.intersectionRatio < 0.9) && isCurrent()) {
        cancel('Измерение прервано: сцена видна не полностью. Держите сцену в области просмотра или увеличьте окно.');
      }
    }, { threshold: 0.9 });
    observer?.observe(host);
    frame = window.requestAnimationFrame(tick);
    return () => {
      alive = false; window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [run, host, controller, cancel]);

  return { run, results, phase, progress, live, message, population, start, cancel, clearResults: () => setResults([]) };
}

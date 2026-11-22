import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizeFrames } from '../demo/performance';
import { useFPS } from '../demo/useFPS';
import { benchmarkConfig, useCanvasBenchmark } from '../demo/useCanvasBenchmark';
import type { ParticleEmitterHandle } from '../src';

let frames: Map<number, FrameRequestCallback>;
let time: number;
function frame(delta: number) {
  act(() => {
    time += delta;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach((callback) => callback(time));
  });
}
beforeEach(() => {
  time = 0; frames = new Map(); let id = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++id, callback); return id; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => { frames.delete(key); });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});

describe('frame metrics', () => {
  it('uses elapsed time for FPS rather than averaging instantaneous FPS', () => {
    const result = summarizeFrames([10, 10, 40, 40])!;
    expect(result.fps).toBe(40);
    expect(result.averageMS).toBe(25);
    expect(result.p95MS).toBe(40);
    expect(result.slowFramesPercent).toBe(50);
    expect(result.frames).toBe(4);
    expect(result.elapsedMS).toBe(100);
  });
  it('ignores invalid intervals and handles an empty window', () => {
    expect(summarizeFrames([0, -1, NaN, Infinity])).toBeNull();
    expect(summarizeFrames([NaN, 20])!.fps).toBe(50);
    expect(summarizeFrames([100, ...Array<number>(19).fill(10)])!.p95MS).toBe(10);
  });
  it('measures cadence, resets on pause/mode changes, and balances StrictMode RAF cleanup', () => {
    const { result, rerender, unmount } = renderHook(({ enabled, mode }) => useFPS(enabled, mode), {
      initialProps: { enabled: true, mode: 'scene1' }, wrapper: StrictMode,
    });
    expect(frames.size).toBe(1);
    frame(1); for (let n = 0; n < 30; n++) frame(20);
    expect(result.current!.fps).toBe(50);
    rerender({ enabled: true, mode: 'scene2' });
    expect(result.current).toBeNull();
    expect(frames.size).toBe(1);
    rerender({ enabled: false, mode: 'scene2' });
    expect(frames.size).toBe(0);
    expect(result.current).toBeNull();
    unmount(); expect(frames.size).toBe(0);
  });
  it('discards hidden-tab gaps rather than reporting them as slow frames', () => {
    const { result } = renderHook(() => useFPS(true, 'scene1'));
    frame(1); frame(20);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    frame(5000);
    expect(result.current).toBeNull();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    frame(1);
    for (let n = 0; n < 25; n++) frame(20);
    expect(result.current!.fps).toBe(50);
    expect(result.current!.p95MS).toBe(20);
  });
});

function comparisonFixture() {
  const controller = { current: {
    isEmitActive: vi.fn(() => true), getParticlesCount: vi.fn(() => 1000),
  } as unknown as ParticleEmitterHandle };
  const host = document.createElement('div'); host.append(document.createElement('canvas'));
  const hook = renderHook(() => useCanvasBenchmark(controller, host), { wrapper: StrictMode });
  const start = () => act(() => hook.result.current.start({ count: 1000, width: 800, height: 500, pixelRatio: 2, warmupMS: 100, durationMS: 100 }));
  return { ...hook, start, controller };
}

describe('Canvas load benchmark', () => {
  it('measures a fixed population, excluding initialization and warmup intervals', () => {
    const f = comparisonFixture(); f.start();
    {
      const config = benchmarkConfig(f.result.current.run!);
      expect(config.emitterConfig.maxParticles).toBe(1000);
      expect(config.emitterConfig.spawnParticlesPerWave).toBe(1000);
      expect(config.particleConfig.lifeTime).toEqual({ value: Infinity });
      frame(2000); // initialization is excluded
      expect(f.result.current.phase).toBe('warmup');
      frame(100); // warmup is excluded
      expect(f.result.current.phase).toBe('measuring');
      for (let n = 0; n < 5; n++) frame(20);
    }
    expect(f.result.current.run).toBeNull();
    expect(frames.size).toBe(0);
    expect(f.result.current.results).toHaveLength(1);
    for (const result of f.result.current.results) {
      expect(result.fps).toBe(50); expect(result.elapsedMS).toBe(100);
      expect(result.frames).toBe(5); expect(result.particles).toBe(1000); expect(result.nodes).toBe(1);
    }
  });
  it('waits for the exact target population before warming up', () => {
    const f = comparisonFixture();
    vi.mocked(f.controller.current.getParticlesCount).mockReturnValue(500);
    f.start(); frame(5000);
    expect(f.result.current.phase).toBe('loading');
    expect(f.result.current.results).toHaveLength(0);
    vi.mocked(f.controller.current.getParticlesCount).mockReturnValue(1000);
    frame(20);
    expect(f.result.current.phase).toBe('warmup');
  });
  it('cancels stale callbacks, preserves completed results and clears history explicitly', () => {
    const f = comparisonFixture(); f.start();
    frame(1); frame(100); frame(100);
    expect(f.result.current.results).toHaveLength(1);
    f.start();
    const queued = [...frames.values()][0];
    act(() => f.result.current.cancel());
    expect(frames.size).toBe(0);
    queued(time + 1000);
    expect(f.result.current.results).toHaveLength(1);
    expect(frames.size).toBe(0);
    f.start();
    expect(f.result.current.results).toHaveLength(1);
    act(() => f.result.current.clearResults());
    expect(f.result.current.results).toHaveLength(0);
    f.unmount(); expect(frames.size).toBe(0);
  });
  it.each(['resize', 'visibilitychange'])('cancels on %s to avoid comparing different conditions', (event) => {
    const f = comparisonFixture(); f.start();
    if (event === 'visibilitychange') vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => (event === 'resize' ? window : document).dispatchEvent(new Event(event)));
    expect(f.result.current.run).toBeNull();
    expect(frames.size).toBe(0);
    expect(f.result.current.message).toContain('прервано');
  });

  it('cancels when the scene is clipped and disconnects its observer', () => {
    let visibility: IntersectionObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { visibility = callback; }
      observe() {}
      disconnect = disconnect;
    });
    try {
      const f = comparisonFixture(); f.start();
      act(() => visibility([{ isIntersecting: true, intersectionRatio: 0.5 } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(f.result.current.run).toBeNull();
      expect(frames.size).toBe(0);
      expect(disconnect).toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

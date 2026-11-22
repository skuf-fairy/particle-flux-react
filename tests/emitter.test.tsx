import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticleEmitter as CoreEmitter } from 'particle-flux';
import type { ViewParticle } from 'particle-flux';
import { useParticleEmitter } from '../src';
import type { UseParticleEmitterOptions as ParticleEmitterProps } from '../src';

interface TestView extends ViewParticle { label: string }

function fixture(overrides: Partial<ParticleEmitterProps<TestView>> = {}) {
  const attached = new Set<TestView>();
  const viewContainer = {
    addChild: vi.fn((view: TestView) => { attached.add(view); }),
    removeChild: vi.fn((view: TestView) => { attached.delete(view); view.destroyed = true; }),
  };
  const viewFactory = vi.fn((): TestView => ({
    x: 0, y: 0, scale: { x: 1, y: 1 }, alpha: 1, tint: '#ffffff',
    angle: 0, destroyed: false, visible: false, width: 1, height: 1, label: 'old',
  }));
  const props: ParticleEmitterProps<TestView> = {
    viewContainer, viewFactory, seed: 10,
    config: { emitterConfig: { spawnInterval: 100 }, particleConfig: { lifeTime: { value: 1000 } } },
    ...overrides,
  };
  return { attached, viewContainer, viewFactory, props };
}

// Real core ticker; only browser scheduling and time are controlled.
let now: number;
let nextId: number;
let frames: Map<number, FrameRequestCallback>;
function frame(delta: number) {
  act(() => {
    now += delta;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  });
}

beforeEach(() => {
  now = 0;
  nextId = 0;
  frames = new Map();
  vi.spyOn(window.performance, 'now').mockImplementation(() => now);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.set(++nextId, cb);
    return nextId;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('useParticleEmitter', () => {
  it('starts, advances and releases active and pooled views on unmount', () => {
    const f = fixture();
    const { result, unmount } = renderHook(() => useParticleEmitter(f.props));
    expect(result.current.getParticlesCount()).toBe(1);
    frame(1); // ticker establishes its initial timestamp
    frame(100);
    expect(result.current.getParticlesCount()).toBe(2);
    act(() => result.current.clean());
    expect(result.current.getParticlesCount()).toBe(0);
    expect(f.attached.size).toBe(2); // hidden pooled views are still attached
    act(() => result.current.emitOnce());
    const saved = result.current;
    const queuedFrame = [...frames.values()][0];
    unmount();
    expect(f.attached.size).toBe(0);
    expect(f.viewContainer.removeChild).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(0);
    queuedFrame(now + 100); // A stale callback cannot resurrect a destroyed ticker.
    expect(frames.size).toBe(0);
    expect(() => {
      saved.start(); saved.pause(); saved.resume(); saved.stop(); saved.restart();
      saved.emitOnce(); saved.emitWave(); saved.clean();
    }).not.toThrow();
    expect(saved.getParticlesCount()).toBe(0);
    expect(saved.isEmitActive()).toBe(false);
  });

  it('updates future particles without replacing live ones or shifting the schedule', () => {
    const f = fixture();
    const destroy = vi.spyOn(CoreEmitter.prototype, 'destroy');
    const { result, rerender } = renderHook(useParticleEmitter<TestView>, { initialProps: f.props });
    const handle = result.current;
    const first = [...f.attached][0];
    frame(1);
    frame(50);
    rerender({ ...f.props, config: {
      emitterConfig: { spawnInterval: 100 },
      particleConfig: { lifeTime: { value: 1000 }, alpha: { timelapses: [{ time: 0, value: 0.25 }] } },
    } });
    frame(50);
    expect(result.current).toBe(handle);
    expect(destroy).not.toHaveBeenCalled();
    expect(result.current.getParticlesCount()).toBe(2);
    expect([...f.attached][0]).toBe(first);
    expect(first.alpha).toBe(1);
    expect([...f.attached][1].alpha).toBe(0.25);
  });

  it('reschedules interval changes and removes omitted particle parameters', () => {
    const f = fixture({ config: {
      emitterConfig: { spawnInterval: 100 },
      particleConfig: { alpha: { timelapses: [{ time: 0, value: 0.2 }] } },
    } });
    const { result, rerender } = renderHook(useParticleEmitter<TestView>, { initialProps: f.props });
    frame(1); frame(50);
    rerender({ ...f.props, config: { emitterConfig: { spawnInterval: 20 }, particleConfig: {} } });
    frame(19);
    expect(result.current.getParticlesCount()).toBe(1);
    frame(1);
    expect(result.current.getParticlesCount()).toBe(2);
    expect([...f.attached][1].alpha).toBe(1);
    rerender({ ...f.props, config: { emitterConfig: {}, particleConfig: {} } });
    frame(200);
    expect(result.current.getParticlesCount()).toBe(2);
  });

  it('does not restart or clear the pool for equivalent inline configs and factory arrays', () => {
    const f = fixture();
    const initial = { ...f.props, viewFactory: [f.viewFactory] };
    const { result, rerender } = renderHook(useParticleEmitter<TestView>, { initialProps: initial });
    frame(1); frame(50);
    rerender({ ...initial, viewFactory: [f.viewFactory], config: {
      emitterConfig: { spawnInterval: 100 }, particleConfig: { lifeTime: { value: 1000 } },
    } });
    frame(50);
    expect(result.current.getParticlesCount()).toBe(2);
    act(() => result.current.clean());
    rerender({ ...initial, viewFactory: [f.viewFactory] });
    expect(f.viewContainer.removeChild).not.toHaveBeenCalled();
    act(() => result.current.emitOnce());
    expect(f.viewFactory).toHaveBeenCalledTimes(2);
  });

  it('replaces the factory, discards its pool, and keeps old live views until death', () => {
    const f = fixture({ config: { emitterConfig: { autoStart: false }, particleConfig: { lifeTime: { value: 10 } } } });
    const { result, rerender } = renderHook(useParticleEmitter<TestView>, { initialProps: f.props });
    act(() => { result.current.emitOnce(2); result.current.clean(); result.current.emitOnce(); });
    const oldActive = [...f.attached].find((view) => view.visible)!;
    const nextFactory = () => ({ ...f.viewFactory(), label: 'new' });
    rerender({ ...f.props, viewFactory: nextFactory });
    expect(f.attached.size).toBe(1);
    expect(f.attached.has(oldActive)).toBe(true);
    act(() => result.current.emitOnce());
    expect([...f.attached].some((view) => view.label === 'new')).toBe(true);
    frame(1); frame(10);
    expect(f.attached.has(oldActive)).toBe(false);
  });

  it('uses committed callbacks without restarting and observes pause transitions', () => {
    const f = fixture();
    const oldStart = vi.fn();
    const nextStart = vi.fn();
    const nextStop = vi.fn();
    const { result, rerender } = renderHook(useParticleEmitter<TestView>, {
      initialProps: { ...f.props, onStartEmit: oldStart },
    });
    expect(oldStart).toHaveBeenCalledTimes(1);
    rerender({ ...f.props, onStartEmit: nextStart, onStopEmit: nextStop, paused: true });
    expect(frames.size).toBe(0);
    expect(result.current.getParticlesCount()).toBe(1);
    rerender({ ...f.props, onStartEmit: nextStart, onStopEmit: nextStop, paused: false });
    expect(frames.size).toBe(1);
    expect(nextStart).not.toHaveBeenCalled(); // resume does not start a new run
    act(() => result.current.restart());
    expect(nextStop).toHaveBeenCalledTimes(1);
    expect(nextStart).toHaveBeenCalledTimes(1);
    expect(oldStart).toHaveBeenCalledTimes(1);
  });

  it('supports manual emission, stop, restart, clean and initial pause', () => {
    const f = fixture({ paused: true, config: {
      emitterConfig: { autoStart: false, spawnParticlesPerWave: 3 }, particleConfig: {},
    } });
    const { result } = renderHook(() => useParticleEmitter(f.props));
    expect(frames.size).toBe(0);
    act(() => result.current.emitWave());
    expect(result.current.getParticlesCount()).toBe(3);
    act(() => result.current.pause());
    expect(frames.size).toBe(0);
    act(() => result.current.resume());
    expect(frames.size).toBe(1);
    act(() => result.current.stop());
    expect(result.current.getParticlesCount()).toBe(0);
    expect(frames.size).toBe(0);
    act(() => result.current.start());
    expect(result.current.isEmitActive()).toBe(true);
    act(() => result.current.emitOnce(2));
    expect(result.current.getParticlesCount()).toBe(2);
    act(() => result.current.clean());
    expect(result.current.isEmitActive()).toBe(true);
    expect(result.current.getParticlesCount()).toBe(0);
  });

  it.each(['seed', 'random', 'maxCatchUpWaves', 'viewContainer'] as const)(
    'recreates on %s changes and preserves controller identity', (key) => {
      const f = fixture({ seed: undefined });
      const replacement = fixture();
      const destroy = vi.spyOn(CoreEmitter.prototype, 'destroy');
      const { result, rerender, unmount } = renderHook(useParticleEmitter<TestView>, { initialProps: f.props });
      const handle = result.current;
      const values = { seed: 20, random: () => 0.5, maxCatchUpWaves: 2, viewContainer: replacement.viewContainer };
      const first = [...f.attached][0];
      rerender({ ...f.props, [key]: values[key] });
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(first.destroyed).toBe(true);
      expect(result.current).toBe(handle);
      expect(result.current.getParticlesCount()).toBe(1);
      expect(frames.size).toBe(1);
      unmount();
      expect(f.attached.size).toBe(0);
      expect(replacement.attached.size).toBe(0);
      expect(frames.size).toBe(0);
    },
  );

  it('cleans a partially started emitter if a callback throws', () => {
    const f = fixture({ onStartEmit: () => { throw new Error('start failed'); } });
    const destroy = vi.spyOn(CoreEmitter.prototype, 'destroy');
    expect(() => renderHook(() => useParticleEmitter(f.props))).toThrow('start failed');
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(f.attached.size).toBe(0);
  });

  it('releases views already created when a later factory call fails during startup', () => {
    const f = fixture({ config: {
      emitterConfig: { spawnInterval: 100, spawnParticlesPerWave: 2 }, particleConfig: {},
    } });
    f.viewFactory.mockImplementationOnce(() => ({
      x: 0, y: 0, scale: { x: 1, y: 1 }, alpha: 1, tint: '#ffffff',
      angle: 0, destroyed: false, visible: false, width: 1, height: 1, label: 'partial',
    })).mockImplementationOnce(() => { throw new Error('factory failed'); });
    expect(() => renderHook(() => useParticleEmitter(f.props))).toThrow('factory failed');
    expect(f.viewContainer.addChild).toHaveBeenCalledTimes(1);
    expect(f.viewContainer.removeChild).toHaveBeenCalledTimes(1);
    expect(f.attached.size).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('initializes a paused run and does not treat autoStart updates as commands', () => {
    const f = fixture({ paused: true });
    const { result, rerender } = renderHook(useParticleEmitter<TestView>, { initialProps: f.props });
    expect(result.current.getParticlesCount()).toBe(1);
    expect(result.current.isEmitActive()).toBe(false);
    expect(frames.size).toBe(0);
    act(() => result.current.stop());
    rerender({ ...f.props, config: { emitterConfig: { autoStart: false }, particleConfig: {} } });
    rerender(f.props);
    expect(result.current.getParticlesCount()).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('calls the latest completion callback and stops scheduling after particle death', () => {
    const oldStop = vi.fn();
    const newStop = vi.fn();
    const f = fixture({
      onStopEmit: oldStop,
      config: { emitterConfig: { autoStart: false }, particleConfig: { lifeTime: { value: 10 } } },
    });
    const { result, rerender } = renderHook(useParticleEmitter<TestView>, { initialProps: f.props });
    act(() => result.current.emitOnce());
    rerender({ ...f.props, onStopEmit: newStop });
    frame(1); frame(10);
    expect(oldStop).not.toHaveBeenCalled();
    expect(newStop).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });
});


describe('custom adapter StrictMode lifecycle', () => {
  it('releases custom active and pooled views and keeps one live ticker', () => {
    const f = fixture();
    const { result, unmount } = renderHook(() => useParticleEmitter(f.props), { wrapper: StrictMode });
    expect(f.viewContainer.addChild).toHaveBeenCalledTimes(2);
    expect(f.viewContainer.removeChild).toHaveBeenCalledTimes(1);
    expect(f.attached.size).toBe(1);
    expect(frames.size).toBe(1);
    frame(1); frame(100);
    expect(result.current.getParticlesCount()).toBe(2);
    act(() => result.current.clean());
    expect(f.attached.size).toBe(2);
    const saved = result.current;
    unmount();
    expect(f.attached.size).toBe(0);
    expect(frames.size).toBe(0);
    saved.start(); saved.emitOnce();
    expect(saved.getParticlesCount()).toBe(0);
  });
});

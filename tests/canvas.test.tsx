import { createRef, StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticleEmitter as CoreEmitter } from 'particle-flux';
import { ParticleEmitter } from '../src';
import type { ParticleEmitterHandle, ParticleEmitterProps } from '../src';

let time: number;
let frames: Map<number, FrameRequestCallback>;
let context: ReturnType<typeof mockContext>;
function mockContext() {
  return {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
    beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn(), globalAlpha: 1, fillStyle: '',
  };
}
function frame(delta: number) {
  act(() => {
    time += delta;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach((callback) => callback(time));
  });
}
beforeEach(() => {
  time = 0;
  frames = new Map();
  let id = 0;
  vi.spyOn(window.performance, 'now').mockImplementation(() => time);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++id, callback); return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => { frames.delete(key); });
  context = mockContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});

const options: ParticleEmitterProps = {
  width: 300, height: 200,
  particle: { shape: 'circle' },
  config: {
    emitterConfig: { spawnInterval: 100 },
    particleConfig: {
      lifeTime: { value: 1000 }, spawnPosition: { x: 40, y: 80 }, direction: { angle: 0 },
      speed: { timelapses: [{ time: 0, value: 2 }] },
      color: { timelapses: [{ time: 0, value: '#ff0080' }] },
    },
  },
};

describe('Canvas component', () => {
  it('runs Canvas in StrictMode with one RAF and cleans up on unmount', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const { container, unmount } = render(<StrictMode><ParticleEmitter {...options} ref={ref} /></StrictMode>);
    expect(ref.current!.getParticlesCount()).toBe(1);
    expect(frames.size).toBe(1);
    expect(container.querySelectorAll(`[data-particle-renderer="canvas"]`)).toHaveLength(1);
    frame(1); frame(100);
    expect(ref.current!.getParticlesCount()).toBe(2);
    expect(frames.size).toBe(1);
    const saved = ref.current!;
    const queued = [...frames.values()][0];
    unmount();
    expect(frames.size).toBe(0);
    expect(container.childElementCount).toBe(0);
    queued(time + 50);
    expect(frames.size).toBe(0);
    saved.start(); saved.emitOnce();
    expect(saved.getParticlesCount()).toBe(0);
    expect(ref.current).toBeNull();
  });

  it('renders only a Canvas surface without per-particle elements', () => {
    const { container } = render(<ParticleEmitter {...options} />);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(container.querySelectorAll('svg, span')).toHaveLength(0);
    expect(container.querySelector('[data-particle-renderer]')!.childElementCount).toBe(1);
  });

  it('draws Canvas in CSS coordinates at high DPI and clears immediately while paused', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const { container } = render(<ParticleEmitter {...options} pixelRatio={2} ref={ref} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(600); expect(canvas.height).toBe(400);
    expect(canvas.style.width).toBe('100%');
    expect(canvas.parentElement!.style.width).toBe('300px');
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.translate).toHaveBeenCalledWith(40, 80);
    expect(context.ellipse).toHaveBeenCalledWith(0, 0, 4, 4, 0, 0, Math.PI * 2);
    expect(context.fillStyle).toBe('#ff0080');
    frame(1); frame(1000 / 60);
    expect(context.translate).toHaveBeenCalledWith(42, 80);
    act(() => ref.current!.pause());
    expect(frames.size).toBe(0);
    context.fill.mockClear(); context.clearRect.mockClear();
    act(() => ref.current!.clean());
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 600, 400);
    expect(context.fill).not.toHaveBeenCalled();
    act(() => ref.current!.emitOnce());
    expect(context.fill).toHaveBeenCalled();
    expect(frames.size).toBe(1);
  });

  it('resizes Canvas without losing particles or restarting the simulation', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const destroy = vi.spyOn(CoreEmitter.prototype, 'destroy');
    const { container, rerender } = render(<ParticleEmitter {...options} pixelRatio={1} ref={ref} />);
    const saved = ref.current;
    frame(1); frame(50);
    rerender(<ParticleEmitter {...options} width={500} height={250} pixelRatio={2} ref={ref} />);
    expect(ref.current).toBe(saved);
    expect(destroy).not.toHaveBeenCalled();
    expect(ref.current!.getParticlesCount()).toBe(1);
    expect(container.querySelector('canvas')!.width).toBe(1000);
    expect(container.querySelector('canvas')!.height).toBe(500);
    frame(50);
    expect(ref.current!.getParticlesCount()).toBe(2);
  });

  it('draws square particles with transform, alpha and numeric tint', () => {
    const config = { emitterConfig: { spawnInterval: 100 }, particleConfig: {
      alpha: { timelapses: [{ time: 0, value: 0.3 }] },
      rotation: { timelapses: [{ time: 0, value: 90 }] },
      scale: { timelapses: [{ time: 0, value: 2 }] },
    } };
    render(<ParticleEmitter config={config} particle={{ shape: 'square', width: 12, height: 6, tint: 0x00ff80 }} />);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.fillRect).toHaveBeenCalledWith(-6, -3, 12, 6);
    expect(context.globalAlpha).toBe(0.3);
    expect(context.fillStyle).toBe('#00ff80');
  });

  it('recreates for a new seed with a stable ref and no stale animation', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const { container, rerender } = render(<ParticleEmitter {...options} seed={1} ref={ref} />);
    const handle = ref.current!;
    const queued = [...frames.values()][0];
    rerender(<ParticleEmitter {...options} seed={2} ref={ref} />);
    expect(ref.current).toBe(handle);
    expect(handle.getParticlesCount()).toBe(1);
    expect(frames.size).toBe(1);
    queued(time + 10);
    expect(frames.size).toBe(1);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('fails clearly when a Canvas context is unavailable without scheduling animation', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(() => render(<ParticleEmitter {...options} />)).toThrow('Canvas 2D rendering is unavailable');
    expect(frames.size).toBe(0);
  });

  it('cleans a Canvas emitter when a startup callback throws', () => {
    expect(() => render(<ParticleEmitter {...options}
      onStartEmit={() => { throw new Error('startup failed'); }} />)).toThrow('startup failed');
    expect(frames.size).toBe(0);
    expect(context.clearRect).toHaveBeenCalled();
  });

  it('updates Canvas config without dropping existing particles', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const { rerender } = render(<ParticleEmitter {...options} ref={ref} />);
    const destroy = vi.spyOn(CoreEmitter.prototype, 'destroy');
    rerender(<ParticleEmitter {...options} ref={ref} config={{
      ...options.config, emitterConfig: { spawnInterval: 10, maxParticles: 2 },
    }} />);
    expect(destroy).not.toHaveBeenCalled();
    expect(ref.current!.getParticlesCount()).toBe(1);
    frame(1); frame(10);
    expect(ref.current!.getParticlesCount()).toBe(2);
  });
});

import { createRef, StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticleEmitter as CoreEmitter } from 'particle-flux';
import { ParticleEmitter } from '../src';
import type { ParticleEmitterHandle } from '../src';

class TestObserver {
  targets = new Set<Element>();
  disconnected = false;
  constructor(public callback: ResizeObserverCallback) { observers.push(this); }
  observe(target: Element) { this.targets.add(target); }
  disconnect() { this.disconnected = true; }
}
let observers: TestObserver[];
let usedSizes: WeakMap<Element, { width: number; height: number }>;
let context: { setTransform: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn>; [key: string]: unknown };
function resize(target: Element, width: number, height: number) {
  usedSizes.set(target, { width, height });
  act(() => {
    for (const observer of observers) {
      if (!observer.disconnected && observer.targets.has(target)) {
        observer.callback([{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver);
      }
    }
  });
}
beforeEach(() => {
  observers = []; usedSizes = new WeakMap();
  vi.stubGlobal('ResizeObserver', TestObserver);
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  context = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
    beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn(), drawImage: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    const size = usedSizes.get(element);
    if (!size) return style;
    return new Proxy(style, { get(target, key) {
      if (key === 'width' || key === 'height') return `${size[key]}px`;
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
const config = { emitterConfig: { spawnInterval: 100 }, particleConfig: {} };
const particle = { shape: 'circle' as const };

describe('CSS emitter dimensions', () => {
  it.each(['100%', '30vh', '20rem', 'calc(100% - 2rem)', 'min(100%, 30rem)', 'clamp(10rem, 50vw, 40rem)', 'auto', 'inherit'])('passes width=%s to CSS and uses observed pixels for Canvas', (width) => {
    const { container } = render(<ParticleEmitter config={config} particle={particle} width={width} height="50%" pixelRatio={2} />);
    const host = container.querySelector('[data-particle-renderer]') as HTMLElement;
    const canvas = container.querySelector('canvas')!;
    expect(host.style.width).toBe(width);
    expect(host.style.height).toBe('50%');
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.position).toBe('absolute');
    resize(canvas, 420, 240);
    expect(canvas.width).toBe(840); expect(canvas.height).toBe(480);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('resizes Canvas from its parent without losing particles, refs or pause state', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const destroy = vi.spyOn(CoreEmitter.prototype, 'destroy');
    const { container } = render(<ParticleEmitter config={config} particle={particle} width="100%" height="100%" pixelRatio={1.5} paused ref={ref} />);
    const host = container.querySelector('[data-particle-renderer]')!;
    const surface = container.querySelector('canvas')!;
    expect(observers.some((observer) => observer.targets.has(host) && observer.targets.has(surface))).toBe(true);
    const handle = ref.current!;
    resize(surface, 320.25, 180.75);
    if (surface instanceof HTMLCanvasElement) {
      expect(surface.width).toBe(480); expect(surface.height).toBe(271);
    }
    resize(surface, 600, 300);
    expect(ref.current).toBe(handle);
    expect(handle.getParticlesCount()).toBe(1);
    expect(handle.isEmitActive()).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
    if (surface instanceof HTMLCanvasElement) {
      expect(surface.width).toBe(900); expect(surface.height).toBe(450);
    }
  });

  it('keeps zero/hidden sizes safe and restores the same Canvas emitter when visible', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const { container } = render(<ParticleEmitter config={config} particle={particle} width="100%" height="100%" paused ref={ref} />);
    const canvas = container.querySelector('canvas')!;
    const handle = ref.current!;
    resize(canvas, 0, 0);
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
    expect(handle.getParticlesCount()).toBe(1);
    resize(canvas, 500, 250);
    expect(canvas.width).toBe(500); expect(canvas.height).toBe(250);
    expect(ref.current).toBe(handle);
    expect(handle.getParticlesCount()).toBe(1);
  });

  it('does not clear Canvas again for identical ResizeObserver notifications', () => {
    const { container } = render(<ParticleEmitter config={config} particle={particle} width="100%" height="100%" paused />);
    const canvas = container.querySelector('canvas')!;
    resize(canvas, 500, 250);
    context.clearRect.mockClear();
    resize(canvas, 500, 250);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it('updates CSS props and pixelRatio without recreating the emitter', () => {
    const destroy = vi.spyOn(CoreEmitter.prototype, 'destroy');
    const { container, rerender } = render(<ParticleEmitter config={config} particle={particle} width="100%" height="40vh" pixelRatio={1} />);
    const canvas = container.querySelector('canvas')!;
    resize(canvas, 500, 250);
    rerender(<ParticleEmitter config={config} particle={particle} width="calc(100% - 2rem)" height="20rem" pixelRatio={2} />);
    const host = canvas.parentElement!;
    expect(host.style.width).toBe('calc(100% - 2rem)');
    expect(host.style.height).toBe('20rem');
    expect(canvas.width).toBe(1000); expect(canvas.height).toBe(500);
    resize(canvas, 460, 320);
    expect(canvas.width).toBe(920); expect(canvas.height).toBe(640);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('updates default DPR on window resize', () => {
    const ratio = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1);
    const { container } = render(<ParticleEmitter config={config} particle={particle} width="100%" height="40vh" />);
    const canvas = container.querySelector('canvas')!;
    resize(canvas, 400, 200);
    ratio.mockReturnValue(2);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(canvas.width).toBe(800); expect(canvas.height).toBe(400);
  });

  it('remeasures the drawing surface after a container-only notification', () => {
    const { container } = render(<ParticleEmitter config={config} particle={particle} width="calc(100% - 2rem)" height="25vh" />);
    const host = container.querySelector('[data-particle-renderer]')!;
    const canvas = container.querySelector('canvas')!;
    usedSizes.set(canvas, { width: 468, height: 250 });
    const observer = observers.find((item) => !item.disconnected)!;
    act(() => observer.callback([{ target: host, contentRect: { width: 500, height: 300 } } as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver));
    expect(canvas.width).toBe(468); expect(canvas.height).toBe(250);
  });

  it('balances Canvas observers in StrictMode and ignores notifications after unmount', () => {
    const { container, unmount } = render(<StrictMode><ParticleEmitter config={config} particle={particle} width="100%" height="30vh" /></StrictMode>);
    const target = container.querySelector('canvas')!;
    expect(observers.filter((observer) => !observer.disconnected)).toHaveLength(1);
    const observer = observers.find((item) => !item.disconnected)!;
    unmount();
    expect(observers.every((item) => item.disconnected)).toBe(true);
    context.clearRect.mockClear();
    act(() => observer.callback([{ target, contentRect: { width: 999, height: 999 } } as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver));
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it('uses content-box measurements instead of scaled bounding rectangles', () => {
    const { container } = render(<ParticleEmitter config={config} particle={particle} width="100%" height="100%" style={{ transform: 'scale(2)' }} />);
    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ width: 800, height: 400 } as DOMRect);
    resize(canvas, 400, 200);
    expect(canvas.width).toBe(400); expect(canvas.height).toBe(200);
  });

  it('keeps numeric sizes as pixels and permits an explicit zero size', () => {
    const { container } = render(<ParticleEmitter config={config} particle={particle} width={0} height={200} />);
    expect(container.querySelector('[data-particle-renderer]')!.getAttribute('style')).toContain('width: 0px');
    expect(container.querySelector('canvas')!.width).toBe(0);
  });
});

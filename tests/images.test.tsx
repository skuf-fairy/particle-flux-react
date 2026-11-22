import { createRef, StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARTICLE_IMAGE, ParticleEmitter } from '../src';
import type { ParticleEmitterHandle } from '../src';
import { ParticleEmitter as CoreEmitter } from 'particle-flux';

function context() {
  return {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
    beginPath: vi.fn(), ellipse: vi.fn(), fill: vi.fn(), drawImage: vi.fn(),
    globalAlpha: 1, fillStyle: '', globalCompositeOperation: 'source-over',
  };
}
let images: HTMLImageElement[];
let canvases: Map<HTMLCanvasElement, ReturnType<typeof context>>;
let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  images = []; canvases = new Map(); frames = new Map(); let id = 0;
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((name, options) => {
    const node = create(name, options);
    if (name === 'img') images.push(node as HTMLImageElement);
    return node;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
    let result = canvases.get(this);
    if (!result) { result = context(); canvases.set(this, result); }
    return result as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++id, callback); return id; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => { frames.delete(key); });
});

function load(image: HTMLImageElement, width = 64, height = 64) {
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height },
  });
  act(() => image.dispatchEvent(new Event('load')));
}
const config = { emitterConfig: { spawnInterval: 100, spawnParticlesPerWave: 3 }, particleConfig: {} };

describe('particle images', () => {
  function visibleSources(container: HTMLElement, ref: { current: ParticleEmitterHandle | null }) {
    for (const image of images) if (image.onload !== null) load(image);
    const main = canvases.get(container.querySelector('canvas')!)!;
    main.drawImage.mockClear();
    act(() => ref.current!.pause());
    return main.drawImage.mock.calls.map((call) => (call[0] as HTMLImageElement).getAttribute('src')!);
  }

  it('samples a seeded Canvas image sequence and replays it on restart', () => {
    const sources = Object.freeze(['/a.png', '/b.png', '/c.png']);
    let reference: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ref = createRef<ParticleEmitterHandle>();
      const many = { emitterConfig: { spawnInterval: 1000, spawnParticlesPerWave: 60, maxParticles: 60 }, particleConfig: {} };
      const { container, unmount } = render(<ParticleEmitter config={many} paused seed={42} ref={ref} particle={{ image: sources }} />);
      const sequence = visibleSources(container, ref);
      expect(sequence).toHaveLength(60);
      expect(new Set(sequence)).toEqual(new Set(sources));
      if (reference) expect(sequence).toEqual(reference);
      else reference = sequence;
      // Pool attachment order can differ from birth order after reuse; compare counts.
      act(() => ref.current!.restart());
      const replay = visibleSources(container, ref);
      expect([...replay].sort()).toEqual([...sequence].sort());
      expect(sources).toEqual(['/a.png', '/b.png', '/c.png']);
      unmount();
    }
  });

  it('resamples the image on every pooled Canvas birth instead of locking onto the first view', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const manual = { emitterConfig: { autoStart: false, maxParticles: 1 }, particleConfig: {} };
    const { container, unmount } = render(<ParticleEmitter config={manual} seed={42} ref={ref} particle={{ image: ['/a.png', '/b.png'] }} />);
    const selected = new Set<string>();
    for (let birth = 0; birth < 16; birth++) {
      act(() => ref.current!.emitOnce());
      const urls = visibleSources(container, ref);
      expect(urls).toHaveLength(1); selected.add(urls[0]);
      act(() => ref.current!.clean());
    }
    expect(selected).toEqual(new Set(['/a.png', '/b.png']));
    expect(images.filter((image) => image.onload !== null)).toHaveLength(2);
    unmount();
    expect(images.every((image) => image.onload === null && image.onerror === null)).toBe(true);
  });

  it('keeps the Canvas pool for equivalent inline URL arrays and releases removed sources', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const many = { emitterConfig: { spawnInterval: 1000, spawnParticlesPerWave: 60 }, particleConfig: {} };
    const props = { config: many, paused: true, seed: 42, ref };
    const { container, rerender, unmount } = render(<ParticleEmitter {...props} particle={{ image: ['/a.png', '/b.png'] }} />);
    const destroy = vi.spyOn(CoreEmitter.prototype, 'destroy');
    const old = images.filter((image) => image.onload !== null);
    expect(old).toHaveLength(2);
    act(() => ref.current!.clean());
    rerender(<ParticleEmitter {...props} particle={{ image: [' /a.png ', '/b.png'] }} />);
    expect(old.every((image) => image.onload !== null)).toBe(true);
    act(() => ref.current!.emitOnce());
    expect(images.filter((image) => image.onload !== null)).toHaveLength(2);
    rerender(<ParticleEmitter {...props} particle={{ image: ['/c.png'] }} />);
    act(() => ref.current!.emitOnce());
    const current = images.find((image) => image.getAttribute('src') === '/c.png')!;
    expect(current).toBeDefined();
    expect(destroy).not.toHaveBeenCalled();
    act(() => ref.current!.clean());
    expect(old.every((image) => image.onload === null)).toBe(true);
    expect(current.onload).not.toBeNull();
    unmount(); expect(current.onload).toBeNull();
  });

  it('isolates a failed image from the rest of the Canvas set', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const many = { emitterConfig: { spawnInterval: 1000, spawnParticlesPerWave: 40 }, particleConfig: {} };
    const { container } = render(<ParticleEmitter config={many} paused seed={42} ref={ref} particle={{ image: ['/good.png', '/bad.png'] }} />);
    const bad = images.find((image) => image.getAttribute('src') === '/bad.png')!;
    const good = images.find((image) => image.getAttribute('src') === '/good.png')!;
    act(() => bad.dispatchEvent(new Event('error')));
    expect(bad.getAttribute('src')).toBe(DEFAULT_PARTICLE_IMAGE);
    expect(good.getAttribute('src')).toBe('/good.png');
    const selected = visibleSources(container, ref);
    expect(selected.some((url) => url.includes('/good.png'))).toBe(true);
    expect(selected.some((url) => url.includes(DEFAULT_PARTICLE_IMAGE))).toBe(true);
  });

  it.each([{ image: [] }, { image: [' ', ''] }])('uses the default circle for an empty URL set %j', ({ image }) => {
    render(<ParticleEmitter config={config} particle={{ image }} />);
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(DEFAULT_PARTICLE_IMAGE);
  });

  it('cleans every URL in a Canvas array under StrictMode', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const many = { emitterConfig: { spawnInterval: 1000, spawnParticlesPerWave: 30 }, particleConfig: {} };
    const { unmount } = render(<StrictMode><ParticleEmitter config={many} seed={42} ref={ref}
      particle={{ image: ['/a.png', '/b.png', '/c.png'] }} /></StrictMode>);
    expect(ref.current!.getParticlesCount()).toBe(30);
    expect(images.filter((image) => image.onload !== null)).toHaveLength(3);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(images.every((image) => image.onload === null && image.onerror === null)).toBe(true);
  });

  it('changes the sequence when the emitter seed changes', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const many = { emitterConfig: { spawnInterval: 1000, spawnParticlesPerWave: 60 }, particleConfig: {} };
    const props = { config: many, paused: true, ref, particle: { image: ['/a.png', '/b.png', '/c.png'] } };
    const { container, rerender } = render(<ParticleEmitter {...props} seed={1} />);
    const first = visibleSources(container, ref);
    rerender(<ParticleEmitter {...props} seed={2} />);
    expect(visibleSources(container, ref)).not.toEqual(first);
  });

  it('shares one image for many Canvas particles and releases it on unmount', () => {
    const { unmount } = render(<ParticleEmitter config={config} particle={{ image: '/same.png' }} />);
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe('/same.png');
    unmount();
    expect(images[0].onload).toBeNull(); expect(images[0].onerror).toBeNull();
    expect(images[0].hasAttribute('src')).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('shares image decoding across Canvas components without releasing a source still in use', () => {
    const first = render(<ParticleEmitter config={config} particle={{ image: '/shared.png' }} />);
    const second = render(<ParticleEmitter config={config} particle={{ image: '/shared.png' }} />);
    const canvas = render(<ParticleEmitter config={config} particle={{ image: '/shared.png' }} />);
    expect(images).toHaveLength(1);
    first.unmount(); second.unmount();
    expect(images[0].onload).not.toBeNull();
    canvas.unmount(); expect(images[0].onload).toBeNull();
  });

  it('waits for Canvas image loading and paints on completion even while paused, without another RAF', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const { container } = render(<ParticleEmitter config={config} paused ref={ref}
      particle={{ image: '/photo.png', width: 24, height: 24 }} />);
    const main = canvases.get(container.querySelector('canvas')!)!;
    expect(main.drawImage).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    load(images[0], 80, 40);
    expect(main.drawImage).toHaveBeenCalledWith(images[0], -12, -6, 24, 12);
    expect(frames.size).toBe(0);
    main.drawImage.mockClear();
    act(() => ref.current!.clean());
    expect(main.drawImage).not.toHaveBeenCalled();
  });

  it('colors the default image via cached Canvas alpha-mask stamps', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const { container } = render(<ParticleEmitter config={config} paused ref={ref}
      pixelRatio={2} particle={{ width: 8, height: 8, tint: '#ff0080' }} />);
    expect(images[0].getAttribute('src')).toBe(DEFAULT_PARTICLE_IMAGE);
    load(images[0]);
    const canvas = container.querySelector('canvas')!;
    const main = canvases.get(canvas)!;
    const [stamp, ink] = [...canvases].find(([node]) => node !== canvas)!;
    expect(stamp.width).toBe(16); expect(stamp.height).toBe(16);
    expect(ink.globalCompositeOperation).toBe('source-in');
    expect(ink.fillStyle).toBe('#ff0080');
    expect(main.drawImage).toHaveBeenCalledWith(stamp, -4, -4, 8, 8);
    const size = canvases.size;
    act(() => ref.current!.pause());
    expect(canvases.size).toBe(size); // Same source/color/size reuses the stamp.
  });

  it('falls back to the default circle after a failed Canvas image', () => {
    const { container } = render(<ParticleEmitter config={config} particle={{ image: '/missing.png' }} />);
    act(() => images[0].dispatchEvent(new Event('error')));
    expect(images[0].getAttribute('src')).toBe(DEFAULT_PARTICLE_IMAGE);
    load(images[0]);
    expect(canvases.get(container.querySelector('canvas')!)!.drawImage).toHaveBeenCalled();
    // A failure of the fallback itself must not start a retry loop.
    act(() => images[0].dispatchEvent(new Event('error')));
    expect(images[0].getAttribute('src')).toBe(DEFAULT_PARTICLE_IMAGE);
  });

  it('keeps old Canvas images alive until their particles are cleaned', () => {
    const ref = createRef<ParticleEmitterHandle>();
    const { rerender, unmount } = render(<ParticleEmitter config={config} paused ref={ref} particle={{ image: '/old.png' }} />);
    const old = images[0];
    rerender(<ParticleEmitter config={config} paused ref={ref} particle={{ image: '/new.png' }} />);
    act(() => ref.current!.emitOnce());
    const next = images.find((image) => image.getAttribute('src') === '/new.png')!;
    expect(old.onload).not.toBeNull();
    act(() => ref.current!.clean());
    expect(old.onload).toBeNull(); // Old active views were marked for permanent removal.
    expect(next.onload).not.toBeNull(); // New views remain in the pool.
    unmount(); expect(next.onload).toBeNull();
  });

  it('ignores late load notifications after StrictMode cleanup and final unmount', () => {
    const { container, unmount } = render(<StrictMode><ParticleEmitter config={config} particle={{ image: '/slow.png' }} /></StrictMode>);
    const source = [...images].reverse().find((image) => image.onload !== null)!;
    const lateLoad = source.onload!;
    const main = canvases.get(container.querySelector('canvas')!)!;
    unmount(); main.drawImage.mockClear();
    act(() => lateLoad.call(source, new Event('load')));
    expect(main.drawImage).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(images.every((image) => image.onload === null && image.onerror === null)).toBe(true);
  });
});

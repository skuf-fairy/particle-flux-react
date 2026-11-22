import type { ViewContainer, ViewParticle } from 'particle-flux';
import { RenderTicker } from './renderTicker';
import type { EmitterRenderer } from './useParticleEmitter';
import { acquireParticleImage, cssColor, DEFAULT_PARTICLE_IMAGE, resolveParticleImage } from './particleImage';
import type { ParticleImageLease, SingleParticleAppearance } from './particleImage';

export interface CanvasRenderer {
  viewContainer: ViewContainer<ViewParticle>;
  createView(options: SingleParticleAppearance): ViewParticle;
  animation: EmitterRenderer;
  resize(width: number, height: number, pixelRatio: number): void;
  destroy(): void;
}

export function createCanvasRenderer(canvas: HTMLCanvasElement, width: number, height: number, ratio: number): CanvasRenderer {
  const available = canvas.getContext('2d');
  if (!available) throw new Error('Canvas 2D rendering is unavailable');
  const context: CanvasRenderingContext2D = available;
  const owner = canvas.ownerDocument.defaultView!;
  const views = new Map<ViewParticle, { options: SingleParticleAppearance; lease?: ParticleImageLease; source?: string; mode?: string }>();
  const tickers = new Set<RenderTicker>();
  const sources = new Map<string, { lease: ParticleImageLease; refs: number }>();
  const stamps = new Map<string, HTMLCanvasElement>();
  let alive = true;
  function updateImageSize(view: ViewParticle, options: SingleParticleAppearance, lease?: ParticleImageLease) {
    if (!lease?.ready) return;
    const custom = lease.url !== DEFAULT_PARTICLE_IMAGE;
    const width = custom ? lease.image.naturalWidth || 8 : 8;
    const height = custom ? lease.image.naturalHeight || 8 : 8;
    view.width = options.width ?? (options.height === undefined ? width : options.height * width / height);
    view.height = options.height ?? (options.width === undefined ? height : options.width * height / width);
  }
  const clear = () => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  };
  function draw() {
    if (!alive) return;
    clear();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const [view, { options, lease, mode }] of views) {
      if (!view.visible || view.destroyed) continue;
      context.save();
      context.translate(view.x, view.y); context.rotate(view.angle * Math.PI / 180);
      context.scale(view.scale.x, view.scale.y); context.globalAlpha = view.alpha;
      const color = cssColor(options.tint ?? view.tint);
      const w = view.width, h = view.height;
      if (lease?.ready) {
        const scale = Math.min(w / (lease.image.naturalWidth || 1), h / (lease.image.naturalHeight || 1));
        const dw = (lease.image.naturalWidth || 1) * scale, dh = (lease.image.naturalHeight || 1) * scale;
        if (mode === 'mask') {
          const key = JSON.stringify([lease.url, color, w, h, ratio]);
          let stamp = stamps.get(key);
          if (!stamp) {
            stamp = canvas.ownerDocument.createElement('canvas');
            stamp.width = Math.max(1, Math.round(w * ratio)); stamp.height = Math.max(1, Math.round(h * ratio));
            const ink = stamp.getContext('2d');
            if (ink) {
              ink.drawImage(lease.image, (w - dw) * ratio / 2, (h - dh) * ratio / 2, dw * ratio, dh * ratio);
              ink.globalCompositeOperation = 'source-in'; ink.fillStyle = color;
              ink.fillRect(0, 0, stamp.width, stamp.height);
            }
            if (stamps.size >= 64) stamps.delete(stamps.keys().next().value!);
            stamps.set(key, stamp);
          }
          context.drawImage(stamp, -w / 2, -h / 2, w, h);
        } else context.drawImage(lease.image, -dw / 2, -dh / 2, dw, dh);
      } else if (!lease) {
        context.fillStyle = color;
        if (options.shape === 'square') context.fillRect(-w / 2, -h / 2, w, h);
        else { context.beginPath(); context.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); context.fill(); }
      }
      context.restore();
    }
  }
  function resize(w: number, h: number, pixelRatio: number) {
    width = w; height = h; ratio = pixelRatio;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    stamps.clear(); draw();
  }
  resize(width, height, ratio);
  return {
    viewContainer: {
      addChild() {},
      removeChild(view) {
        const entry = views.get(view);
        const key = entry?.source;
        if (key) {
          const source = sources.get(key);
          if (source && --source.refs === 0) { source.lease.release(); sources.delete(key); stamps.clear(); }
        }
        views.delete(view);
      },
    },
    createView(options) {
      const view: ViewParticle = { x: 0, y: 0, scale: { x: 1, y: 1 }, alpha: 1, tint: 0xffffff,
        angle: 0, destroyed: false, visible: true, width: options.width ?? 8, height: options.height ?? 8 };
      const image = resolveParticleImage(options);
      let source = image ? sources.get(image.src) : undefined;
      if (image) {
        if (!source) {
          source = { refs: 0, lease: acquireParticleImage(canvas.ownerDocument, image.src, () => {
            for (const [view, entry] of views) updateImageSize(view, entry.options, entry.lease);
            stamps.clear(); draw();
          }) };
          sources.set(image.src, source);
        }
        source.refs++;
      }
      views.set(view, { options, mode: image?.mode, source: image?.src,
        lease: source?.lease });
      updateImageSize(view, options, source?.lease);
      return view;
    },
    animation: { render: draw, createTicker() {
      const ticker = new RenderTicker(owner, draw);
      const start = ticker.start.bind(ticker), stop = ticker.stop.bind(ticker);
      ticker.start = () => { tickers.add(ticker); start(); };
      ticker.stop = () => { stop(); tickers.delete(ticker); };
      return ticker;
    } },
    resize,
    destroy() {
      if (!alive) return;
      alive = false; tickers.forEach((ticker) => ticker.stop()); tickers.clear();
      sources.forEach(({ lease }) => lease.release()); sources.clear(); views.clear(); stamps.clear(); clear();
    },
  };
}

import type { ParticleAppearance } from './types';

/** Self-contained image: no CDN, asset copying or network request is required. */
export const DEFAULT_PARTICLE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="white"/></svg>',
)}`;

export type ParticleImageMode = 'image' | 'mask';
export const cssColor = (value: string | number): string => typeof value === 'number'
  ? `#${(value & 0xffffff).toString(16).padStart(6, '0')}` : value;

export type SingleParticleAppearance = Omit<ParticleAppearance, 'image'> & { image?: string };

export function particleImageSources(image: ParticleAppearance['image']): string[] {
  if (image === undefined) return [];
  const sources = typeof image === 'string' ? [image] : image;
  return sources.map((source) => source.trim()).filter(Boolean);
}

export function resolveParticleImage(options: Pick<SingleParticleAppearance, 'image' | 'imageMode' | 'shape'>) {
  const custom = options.image?.trim();
  if (!custom && options.shape) return null; // Preserve explicit geometric shapes.
  return { src: custom || DEFAULT_PARTICLE_IMAGE, mode: options.imageMode ?? (custom ? 'image' : 'mask') };
}

export interface ParticleImageLease {
  readonly image: HTMLImageElement;
  readonly url: string;
  readonly ready: boolean;
  release(): void;
}

interface ImageRecord {
  image: HTMLImageElement;
  url: string;
  ready: boolean;
  alive: boolean;
  refs: number;
  listeners: Set<() => void>;
}

// Share one decoded source per URL/document, including between overlapping factories.
// Records are released when the last active or pooled view stops using the source.
const images = new WeakMap<Document, Map<string, ImageRecord>>();

export function acquireParticleImage(document: Document, src: string, onChange: () => void): ParticleImageLease {
  let cache = images.get(document);
  if (!cache) { cache = new Map(); images.set(document, cache); }
  let record = cache.get(src);
  if (!record) {
    const image = document.createElement('img');
    record = { image, url: src, ready: false, alive: true, refs: 0, listeners: new Set() };
    const current = record;
    image.onload = () => {
      if (!current.alive) return;
      current.ready = true;
      current.listeners.forEach((listener) => listener());
    };
    image.onerror = () => {
      if (!current.alive) return;
      current.ready = false;
      if (current.url !== DEFAULT_PARTICLE_IMAGE) {
        current.url = DEFAULT_PARTICLE_IMAGE;
        image.src = DEFAULT_PARTICLE_IMAGE;
      }
      current.listeners.forEach((listener) => listener());
    };
    cache.set(src, record);
    image.src = src;
  }
  const current = record;
  current.refs++;
  current.listeners.add(onChange);
  let released = false;
  return {
    image: current.image,
    get url() { return current.url; },
    get ready() { return current.ready; },
    release() {
      if (released) return;
      released = true;
      current.listeners.delete(onChange);
      if (--current.refs === 0) {
        current.alive = false;
        current.image.onload = current.image.onerror = null;
        current.image.removeAttribute('src');
        current.listeners.clear();
        cache.delete(src);
      }
    },
  };
}

import type { ExtraOptions, ParticleEmitterConfig, ViewContainer, ViewFactory, ViewParticle } from 'particle-flux';
import type { CSSProperties } from 'react';
import type { ParticleImageMode } from './particleImage';

export interface EmitterOptions {
  config: ParticleEmitterConfig;
  /** Applied on mount and on transitions; imperative commands can override it. */
  paused?: boolean;
  seed?: ExtraOptions['seed'];
  random?: ExtraOptions['random'];
  maxCatchUpWaves?: number;
  onStartEmit?: () => void;
  onStopEmit?: () => void;
}

export interface UseParticleEmitterOptions<View extends ViewParticle = ViewParticle> extends EmitterOptions {
  viewContainer: ViewContainer<View>;
  viewFactory: ViewFactory<View>;
}

export interface ParticleAppearance {
  /** One URL or a list sampled on every birth (including pooled reuse), using the emitter seed. */
  image?: string | readonly string[];
  /** Custom images retain their colors; 'mask' applies tint/color to their alpha. */
  imageMode?: ParticleImageMode;
  /** Optional size in CSS pixels. Images default to their intrinsic dimensions;
   * a single dimension preserves the aspect ratio. Built-in shapes default to 8 × 8. */
  width?: number;
  height?: number;
  tint?: string | number;
  /** Legacy geometric mode, used only when image is absent. */
  shape?: 'circle' | 'square';
}

export interface ParticleEmitterProps extends EmitterOptions {
  /** Numbers are CSS pixels; strings are resolved by browser layout (%, vh, rem, calc(), etc.). */
  width?: number | string;
  height?: number | string;
  /** Canvas backing resolution. Defaults to the owning window's devicePixelRatio. */
  pixelRatio?: number;
  particle?: ParticleAppearance;
  className?: string;
  style?: CSSProperties;
  viewContainer?: never;
  viewFactory?: never;
}

/** Stable controller. Commands are harmless before setup and after cleanup. */
export interface ParticleEmitterHandle {
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  restart(): void;
  emitOnce(count?: number): void;
  emitWave(): void;
  clean(): void;
  getParticlesCount(): number;
  isEmitActive(): boolean;
}

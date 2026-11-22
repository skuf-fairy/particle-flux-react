import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import { useParticleEmitterController } from './useParticleEmitter';
import type { EmitterRenderer } from './useParticleEmitter';
import { createCanvasRenderer } from './canvasRenderer';
import type { CanvasRenderer } from './canvasRenderer';
import { particleImageSources } from './particleImage';
import { readSurfaceSize, watchSurfaceSize } from './surfaceSize';
import type { ParticleEmitterHandle, ParticleEmitterProps, UseParticleEmitterOptions } from './types';

const Driver = forwardRef(function Driver({ options, renderer }: {
  options: UseParticleEmitterOptions; renderer?: EmitterRenderer;
}, ref: Ref<ParticleEmitterHandle>) {
  const handle = useParticleEmitterController(options, renderer);
  useImperativeHandle(ref, () => handle, [handle]);
  return null;
});

export const ParticleEmitter = forwardRef(function ParticleEmitter(
  props: ParticleEmitterProps, ref: Ref<ParticleEmitterHandle>,
) {
  const { width = 600, height = 400, pixelRatio, particle = {}, className, style } = props;
  for (const dimension of [width, height]) {
    if (typeof dimension === 'number' ? !Number.isFinite(dimension) || dimension < 0 : !dimension.trim()) {
      throw new RangeError('width and height must be finite nonnegative numbers or nonempty CSS strings');
    }
  }
  if (pixelRatio !== undefined && (!Number.isFinite(pixelRatio) || pixelRatio <= 0)) {
    throw new RangeError('pixelRatio must be a finite positive number');
  }
  for (const size of [particle.width, particle.height]) {
    if (size !== undefined && (!Number.isFinite(size) || size < 0)) {
      throw new RangeError('Particle width and height must be finite nonnegative numbers');
    }
  }
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [drawingSurface, setDrawingSurface] = useState<HTMLCanvasElement | null>(null);
  const surface = drawingSurface;
  const [adapter, setAdapter] = useState<CanvasRenderer | null>(null);
  const sizeWatcher = useRef<ReturnType<typeof watchSurfaceSize> | null>(null);
  const committed = useRef({ width, height, pixelRatio });
  useEffect(() => { committed.current = { width, height, pixelRatio }; });
  useEffect(() => {
    if (!surface || !container) return;
    let previous = readSurfaceSize(surface, committed.current);
    const renderer = createCanvasRenderer(surface, previous.width, previous.height, previous.pixelRatio);
    const watcher = watchSurfaceSize(container, surface, () => committed.current, (next) => {
      if (next.width === previous.width && next.height === previous.height && next.pixelRatio === previous.pixelRatio) return;
      previous = next;
      renderer.resize(next.width, next.height, next.pixelRatio);
    });
    sizeWatcher.current = watcher;
    setAdapter(renderer);
    return () => {
      watcher.disconnect();
      if (sizeWatcher.current === watcher) sizeWatcher.current = null;
      renderer.destroy();
    };
  }, [surface, container]);
  useEffect(() => {
    sizeWatcher.current?.measure();
  }, [adapter, width, height, pixelRatio]);
  const { image, imageMode, width: particleWidth, height: particleHeight, tint, shape } = particle;
  // Compare URLs by value: inline equivalent arrays must not discard pooled views.
  const imageKey = JSON.stringify(particleImageSources(image));
  const factory = useMemo(() => {
    if (!adapter) return null;
    const sources: string[] = JSON.parse(imageKey);
    const create = (url?: string) => () => adapter.createView({
      image: url, imageMode, width: particleWidth, height: particleHeight, tint, shape,
    });
    // The core samples its factory array on every birth and pools by factory identity.
    // This keeps image selection seeded, including when existing views are reused.
    return sources.length > 1 ? sources.map(create) : create(sources[0]);
  }, [adapter, imageKey, imageMode, particleWidth, particleHeight, tint, shape]);
  const containerStyle = { position: 'relative' as const, display: 'block', overflow: 'hidden', ...style, width, height };
  const drawingStyle = { position: 'absolute' as const, inset: 0, display: 'block', width: '100%', height: '100%' };
  return <>
    <div ref={setContainer} className={className} style={containerStyle} aria-hidden="true" data-particle-renderer="canvas">
      <canvas ref={setDrawingSurface} style={drawingStyle} />
    </div>
    {adapter && factory && <Driver ref={ref} options={{ ...props, viewContainer: adapter.viewContainer, viewFactory: factory }} renderer={adapter.animation} />}
  </>;
});

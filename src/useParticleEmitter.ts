import { useEffect, useMemo, useRef } from 'react';
import { ParticleEmitter as CoreEmitter } from 'particle-flux';
import type { ITicker, ParticleEmitterConfig, ViewParticle } from 'particle-flux';
import { equal, snapshot } from './configSnapshot';
import type { ParticleEmitterHandle, UseParticleEmitterOptions } from './types';

export interface EmitterRenderer {
  createTicker(): ITicker;
  render(): void;
}

export function useParticleEmitter<View extends ViewParticle>(
  props: UseParticleEmitterOptions<View>,
): ParticleEmitterHandle {
  return useParticleEmitterController(props);
}

/** Internal bridge for renderers which must draw after the core's simulation step. */
export function useParticleEmitterController<View extends ViewParticle>(
  props: UseParticleEmitterOptions<View>, renderer?: EmitterRenderer,
): ParticleEmitterHandle {
  const emitter = useRef<CoreEmitter<View> | null>(null);
  const draw = useRef<(() => void) | undefined>(undefined);
  const committed = useRef(props);
  const applied = useRef<{
    config: ParticleEmitterConfig;
    factory: UseParticleEmitterOptions<View>['viewFactory'];
    paused: boolean;
  } | null>(null);

  // An abandoned render must not change callbacks on the live instance.
  useEffect(() => { committed.current = props; });

  const handle = useMemo<ParticleEmitterHandle>(() => {
    const command = (fn: (instance: CoreEmitter<View>) => void) => {
      if (!emitter.current) return;
      try { fn(emitter.current); } finally { draw.current?.(); }
    };
    return {
      start: () => command((e) => e.startEmit()),
      pause: () => command((e) => e.pauseEmit()),
      resume: () => command((e) => e.resumeEmit()),
      stop: () => command((e) => e.stopEmit()),
      restart: () => command((e) => e.restart()),
      emitOnce: (count) => command((e) => e.emitOnce(count)),
      emitWave: () => command((e) => e.emitWave()),
      clean: () => command((e) => e.clean()),
      getParticlesCount: () => emitter.current?.getParticlesCount() ?? 0,
      isEmitActive: () => emitter.current?.isEmitActive() ?? false,
    };
  }, []);

  const { viewContainer, seed, random, maxCatchUpWaves } = props;
  useEffect(() => {
    const initial = committed.current;
    const config = snapshot(initial.config);
    const ticker = renderer?.createTicker();
    let instance: CoreEmitter<View>;
    try {
      instance = new CoreEmitter(
        viewContainer,
        initial.viewFactory,
        { ...config, emitterConfig: { ...config.emitterConfig, autoStart: false } },
        {
          seed, random, maxCatchUpWaves, ticker,
          onStartEmit: () => committed.current.onStartEmit?.(),
          onStopEmit: () => committed.current.onStopEmit?.(),
        },
      );
    } catch (error) {
      ticker?.stop();
      throw error;
    }
    emitter.current = instance;
    draw.current = renderer ? () => renderer.render() : undefined;
    applied.current = {
      config, factory: snapshot(initial.viewFactory), paused: initial.paused ?? false,
    };
    const cleanup = () => {
      if (emitter.current === instance) {
        emitter.current = null;
        applied.current = null;
        draw.current = undefined;
      }
      instance.destroy();
      renderer?.render();
    };
    try {
      if (config.emitterConfig.autoStart !== false) instance.startEmit();
      if (initial.paused) instance.pauseEmit();
      renderer?.render();
    } catch (error) {
      cleanup();
      throw error;
    }
    return cleanup;
  }, [viewContainer, seed, random, maxCatchUpWaves, renderer]);

  useEffect(() => {
    const instance = emitter.current;
    const previous = applied.current;
    if (!instance || !previous) return;
    if (!equal(previous.config.emitterConfig, props.config.emitterConfig)) {
      instance.config.emitterConfig = props.config.emitterConfig;
      previous.config.emitterConfig = snapshot(props.config.emitterConfig);
    }
    if (!equal(previous.config.particleConfig, props.config.particleConfig)) {
      instance.config.particleConfig = props.config.particleConfig;
      previous.config.particleConfig = snapshot(props.config.particleConfig);
    }
    if (!equal(previous.factory, props.viewFactory)) {
      instance.config.view = props.viewFactory;
      previous.factory = snapshot(props.viewFactory);
    }
    const paused = props.paused ?? false;
    if (previous.paused !== paused) {
      if (paused) instance.pauseEmit();
      else instance.resumeEmit();
      previous.paused = paused;
    }
    draw.current?.();
  });

  return handle;
}

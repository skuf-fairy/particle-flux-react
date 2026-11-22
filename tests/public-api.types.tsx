// Checked by tsc; intentionally not executed by Vitest.
import type { ViewParticle } from 'particle-flux';
import { ParticleEmitter, useParticleEmitter } from '../src';
import type { UseParticleEmitterOptions } from '../src';

interface CustomView extends ViewParticle { custom: string }

export function APITypeChecks(props: UseParticleEmitterOptions<CustomView>) {
  useParticleEmitter(props);
  // @ts-expect-error Custom adapters belong to the hook.
  const custom = <ParticleEmitter {...props} />;
  const canvas = <ParticleEmitter config={props.config} pixelRatio={2} />;
  const masked = <ParticleEmitter config={props.config} particle={{ image: '/spark.png', imageMode: 'mask' }} />;
  const mixedImages = <ParticleEmitter config={props.config} particle={{ image: ['/a.png', '/b.png'] as const }} />;
  const responsive = <ParticleEmitter config={props.config} width="calc(100% - 2rem)" height="50vh" />;
  // @ts-expect-error Particle dimensions remain numeric simulation pixels.
  const invalidParticleSize = <ParticleEmitter config={props.config} particle={{ width: '2rem' }} />;
  // @ts-expect-error Custom adapters cannot be combined with a built-in renderer.
  const mixed = <ParticleEmitter {...props} render="canvas" />;
  // @ts-expect-error The render prop has been removed.
  const invalidMode = <ParticleEmitter config={props.config} render="canvas" />;
  // @ts-expect-error The universal hook requires an explicit rendering adapter.
  useParticleEmitter({ config: props.config });
  return <>{custom}{canvas}{masked}{mixedImages}{responsive}{invalidParticleSize}{mixed}{invalidMode}</>;
}

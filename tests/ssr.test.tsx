// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ParticleEmitter, useParticleEmitter } from '../src';
import type { UseParticleEmitterOptions as ParticleEmitterProps } from '../src';

it('imports and renders both APIs without browser globals or emitter initialization', () => {
  expect(typeof window).toBe('undefined');
  const props: ParticleEmitterProps = {
    viewFactory: vi.fn(() => { throw new Error('must not initialize on the server'); }),
    viewContainer: { addChild: vi.fn(), removeChild: vi.fn() },
    config: { emitterConfig: {}, particleConfig: {} },
  };
  function HookConsumer() {
    const handle = useParticleEmitter(props);
    expect(handle.getParticlesCount()).toBe(0);
    return null;
  }
  expect(renderToString(<HookConsumer />)).toBe('');
  expect(props.viewFactory).not.toHaveBeenCalled();
  expect(props.viewContainer.addChild).not.toHaveBeenCalled();
});

it('renders empty built-in surfaces on the server without accessing Canvas or browser globals', () => {
  const config = { emitterConfig: {}, particleConfig: {} };
  for (const mode of ['canvas'] as const) {
    const html = renderToString(<ParticleEmitter config={config} width={300} height={200} />);
    expect(html).toContain(`data-particle-renderer="${mode}"`);
    expect(html).not.toContain('<ellipse');
    expect(html).not.toContain('<span');
  }
});

it('preserves CSS dimension strings in SSR without requiring ResizeObserver', () => {
  for (const mode of ['canvas'] as const) {
    const html = renderToString(<ParticleEmitter width="100%" height="calc(50vh - 2rem)"
      config={{ emitterConfig: {}, particleConfig: {} }} />);
    expect(html).toContain('width:100%');
    expect(html).toContain('height:calc(50vh - 2rem)');
    expect(html).not.toContain('viewBox="0 0 100%');
    expect(html).not.toContain('<ellipse');
  }
});

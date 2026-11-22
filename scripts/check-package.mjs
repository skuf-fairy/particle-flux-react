import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const npmCLI = process.env.npm_execpath;
assert(npmCLI, 'Run this check through npm run test:package');
const artifacts = join(root, '.artifacts');
mkdirSync(artifacts, { recursive: true });
const fixture = mkdtempSync(join(artifacts, 'package-check-'));
const npm = (args, cwd = fixture) => execFileSync(process.execPath, [npmCLI, ...args], {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
});
let passed = false;

try {
  // Ignore lifecycle scripts here: prepack itself invokes this check.
  const [archive] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', fixture], root));
  const expected = [
    'README.md', 'package.json', 'dist/index.js', 'dist/index.cjs',
    'dist/index.d.ts', 'dist/index.d.cts', 'dist/index.js.map', 'dist/index.cjs.map',
  ].sort();
  assert.deepEqual(archive.files.map(({ path }) => path).sort(), expected,
    'The archive must contain only the public builds, source maps, README and manifest');
  assert.equal(manifest.main, './dist/index.cjs');
  assert.equal(manifest.module, './dist/index.js');
  assert.equal(manifest.types, './dist/index.d.ts');
  assert.deepEqual(manifest.exports, {
    '.': {
      import: { types: './dist/index.d.ts', default: './dist/index.js' },
      require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
    },
    './package.json': './package.json',
  });
  for (const version of Object.values(manifest.dependencies)) {
    assert(!/^(file:|link:|workspace:)/.test(version), 'Published dependencies must resolve outside the workspace');
  }
  console.log(`Archive: ${archive.files.length} files, ${(archive.size / 1024).toFixed(1)} KiB compressed`);

  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'particle-flux-react-package-check', version: '0.0.0', private: true }));
  const consumer = `
import { createElement, createRef } from 'react';
import { DEFAULT_PARTICLE_IMAGE, ParticleEmitter, useParticleEmitter } from 'particle-flux-react';
import type { ParticleEmitterProps, ParticleEmitterHandle, ParticleAppearance, ParticleImageMode, UseParticleEmitterOptions } from 'particle-flux-react';
import type { ViewParticle } from 'particle-flux';
interface View extends ViewParticle { custom: string }
const config = { emitterConfig: {}, particleConfig: {} };
const imageMode: ParticleImageMode = 'image';
const particle: ParticleAppearance = { image: [DEFAULT_PARTICLE_IMAGE, '/star.png'], imageMode };
const props: ParticleEmitterProps = { config, width: '100%', height: '20rem', particle };
createElement(ParticleEmitter, { ...props, ref: createRef<ParticleEmitterHandle>() });
export function CustomAdapter(options: UseParticleEmitterOptions<View>) {
  const handle: ParticleEmitterHandle = useParticleEmitter(options);
  handle.pause(); handle.resume(); handle.clean();
  return null;
}
// @ts-expect-error The render prop has been removed.
const invalid: ParticleEmitterProps = { config, render: 'canvas' };
`;
  writeFileSync(join(fixture, 'consumer.mts'), consumer);
  writeFileSync(join(fixture, 'consumer.cts'), consumer);
  writeFileSync(join(fixture, 'runtime.mjs'), `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import * as esm from 'particle-flux-react';
const require = createRequire(import.meta.url);
const cjs = require('particle-flux-react');
const metadata = require('particle-flux-react/package.json');
assert.equal(metadata.version, ${JSON.stringify(manifest.version)});
assert.equal(typeof window, 'undefined');
for (const api of [esm, cjs]) {
  assert.deepEqual(Object.keys(api).sort(), ['DEFAULT_PARTICLE_IMAGE', 'ParticleEmitter', 'useParticleEmitter'].sort());
  assert.equal(typeof api.useParticleEmitter, 'function');
  assert.ok(api.DEFAULT_PARTICLE_IMAGE.startsWith('data:image/svg+xml,'));
  const html = renderToString(createElement(api.ParticleEmitter, {
    config: { emitterConfig: {}, particleConfig: {} }, width: '100%', height: '20rem',
  }));
  assert.ok(html.includes('<canvas'));
  assert.ok(html.includes('height:20rem'));
  function HookConsumer() {
    const controller = api.useParticleEmitter({
      config: { emitterConfig: {}, particleConfig: {} },
      viewContainer: { addChild() { throw new Error('SSR must not attach views'); }, removeChild() {} },
      viewFactory() { throw new Error('SSR must not initialize the emitter'); },
    });
    assert.equal(controller.getParticlesCount(), 0);
    return null;
  }
  assert.equal(renderToString(createElement(HookConsumer)), '');
}
`);
  for (const react of ['18', '19']) {
    console.log(`Installing isolated tarball consumer with React ${react}...`);
    npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
      join(fixture, archive.filename), `react@${react}`, `react-dom@${react}`,
      `@types/react@${react}`, `@types/react-dom@${react}`, `typescript@${manifest.devDependencies.typescript}`]);
    execFileSync(process.execPath, ['runtime.mjs'], { cwd: fixture, stdio: 'inherit' });
    const base = ['--noEmit', '--strict', '--target', 'ES2020', '--lib', 'ES2020,DOM,DOM.Iterable', '--esModuleInterop'];
    const tsc = join(fixture, 'node_modules/typescript/lib/tsc.js');
    execFileSync(process.execPath, [tsc, ...base, '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts', 'consumer.cts'], { cwd: fixture, stdio: 'inherit' });
    execFileSync(process.execPath, [tsc, ...base, '--module', 'ESNext', '--moduleResolution', 'Bundler', 'consumer.mts'], { cwd: fixture, stdio: 'inherit' });
    console.log(`React ${react}: ESM/CJS imports, SSR and NodeNext/Bundler types passed`);
  }
  passed = true;
} finally {
  if (passed) {
    const target = resolve(fixture);
    assert(target.startsWith(resolve(artifacts) + sep), 'Cleanup must stay inside .artifacts');
    rmSync(target, { recursive: true, force: true });
  } else console.error(`Package check failed; fixture retained at ${fixture}`);
}

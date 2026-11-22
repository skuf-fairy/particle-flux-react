import { useEffect, useState } from 'react';
import { ParticleEmitter } from '../src';

export function ResponsiveExample({ enabled }: { enabled: boolean }) {
  const [width, setWidth] = useState('100%');
  const [height, setHeight] = useState('100%');
  const [draftWidth, setDraftWidth] = useState(width);
  const [draftHeight, setDraftHeight] = useState(height);
  const [parentWidth, setParentWidth] = useState(100);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const surface = host?.firstElementChild;
    if (!surface || !enabled) return;
    let alive = true;
    const observer = new ResizeObserver(([entry]) => {
      if (alive) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(surface);
    return () => { alive = false; observer.disconnect(); };
  }, [host, enabled]);
  const apply = (w: string, h: string) => {
    setError('');
    setWidth(w); setHeight(h); setDraftWidth(w); setDraftHeight(h);
  };

  return <section className="responsive-example" aria-label="Пример CSS-размеров">
    <div className="performance-heading"><div><div className="eyebrow">RESPONSIVE SURFACE</div>
      <h2>Размеры, которые задаёт CSS.</h2><p>Изменяйте ширину контейнера: Canvas подстраивается без перезапуска частиц.</p></div>
      <span className="badge">Canvas 2D</span></div>
    <form className="responsive-controls" onSubmit={(event) => {
      event.preventDefault();
      if (!CSS.supports('width', draftWidth) || !CSS.supports('height', draftHeight)) {
        setError('Укажите допустимые CSS-значения ширины и высоты.'); return;
      }
      apply(draftWidth, draftHeight);
    }}>
      <label>width<input aria-label="CSS ширина эмиттера" value={draftWidth} disabled={!enabled} onChange={(event) => setDraftWidth(event.target.value)} /></label>
      <label>height<input aria-label="CSS высота эмиттера" value={draftHeight} disabled={!enabled} onChange={(event) => setDraftHeight(event.target.value)} /></label>
      <button type="submit" disabled={!enabled}>Применить размеры</button>
    </form>
    {error && <p role="alert" className="benchmark-note">{error}</p>}
    <div className="responsive-presets">{[
      ['100% × 100%', '100%', '100%'], ['rem / vh', 'min(100%, 38rem)', '25vh'],
      ['calc()', 'calc(100% - 3rem)', 'calc(100% - 2rem)'], ['clamp()', 'clamp(12rem, 80%, 50rem)', 'clamp(8rem, 25vh, 18rem)'],
    ].map(([label, w, h]) => <button key={label} disabled={!enabled} onClick={() => apply(w, h)}>{label}</button>)}</div>
    <div className="responsive-width-control"><label htmlFor="responsive-parent">Ширина контейнера <output>{parentWidth}%</output></label>
      <input id="responsive-parent" type="range" min={40} max={100} value={parentWidth} disabled={!enabled} onChange={(event) => setParentWidth(Number(event.target.value))} /></div>
    <div className="responsive-parent-track"><div ref={setHost} className="responsive-parent" style={{ width: `${parentWidth}%` }}>
      {enabled && <ParticleEmitter width={width} height={height} paused={paused} seed={42}
        particle={{ image: ['./particles/star.svg', './particles/heart.svg', './particles/diamond.svg'], width: 18, height: 18 }}
        config={{
          emitterConfig: { spawnInterval: 60, spawnParticlesPerWave: 2, maxParticles: 80 },
          particleConfig: {
            lifeTime: { value: 2400 }, spawnPosition: { x: size.width / 2, y: size.height * 0.7 },
            direction: { minAngle: -150, maxAngle: -30 }, speed: { timelapses: [{ time: 0, value: 1.2 }] },
            alpha: { timelapses: [{ time: 0, value: 1 }, { time: 100, value: 0 }] },
          },
        }} />}
    </div></div>
    <div className="responsive-caption"><code>{`<ParticleEmitter width="${width}" height="${height}" />`}</code>
      <span data-testid="responsive-size">{enabled ? `${size.width.toFixed(1)} × ${size.height.toFixed(1)} CSS px` : 'Пример отключён на время замера'}</span>
      <button disabled={!enabled} onClick={() => setPaused(!paused)}>{paused ? 'Продолжить пример' : 'Приостановить пример'}</button></div>
    <p className="benchmark-note">Контейнер примера имеет высоту 20rem. Для процентной высоты родителю нужен определённый размер. Числовые width и height по-прежнему означают пиксели.</p>
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import type { ParticleEmitterConfig } from 'particle-flux';
import { DEFAULT_PARTICLE_IMAGE, ParticleEmitter } from '../src';
import type { ParticleEmitterHandle, ParticleImageMode } from '../src';
import { useFPS } from './useFPS';
import { benchmarkConfig, useCanvasBenchmark } from './useCanvasBenchmark';
import { PerformancePanel } from './PerformancePanel';
import { ResponsiveExample } from './ResponsiveExample';

const defaults = { interval: 40, wave: 3, max: 600, life: 1800, speed: 2.4, spread: 100, gravity: 0.06 };
type Settings = typeof defaults;
type Phase = 'Работает' | 'Пауза' | 'Остановлен' | 'Отключён';

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange(value: number): void;
}) {
  return <label className="slider"><span>{label}<output>{value}{unit}</output></span>
    <input type="range" aria-label={label} value={value} min={min} max={max} step={step}
      onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function App() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [settings, setSettings] = useState(defaults);
  const [color, setColor] = useState('#9effcb');
  const [imageURLs, setImageURLs] = useState<string[]>([]);
  const [draftImageURL, setDraftImageURL] = useState('');
  const [imageMode, setImageMode] = useState<ParticleImageMode>('image');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(true);
  const [phase, setPhase] = useState<Phase>('Работает');
  const [counts, setCounts] = useState({ active: 0, nodes: 0 });
  const [bounds, setBounds] = useState({ width: 800, height: 560 });
  const [origin, setOrigin] = useState({ x: 0.5, y: 0.64 });
  const emitter = useRef<ParticleEmitterHandle>(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const benchmark = useCanvasBenchmark(emitter, host);
  const busy = benchmark.run !== null;
  const fps = useFPS(mounted && phase === 'Работает' && !busy, String(sceneRevision));
  const frameStats = busy ? benchmark.live : fps;
  const visibleCounts = busy ? benchmark.population : counts;
  const canTint = imageURLs.length === 0 || imageMode === 'mask';
  const imageSource = imageURLs.length > 1 ? imageURLs : imageURLs[0];
  const previewImages = imageURLs.length ? imageURLs : [DEFAULT_PARTICLE_IMAGE];

  useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  useEffect(() => {
    if (busy) return;
    const poll = () => setCounts({ active: emitter.current?.getParticlesCount() ?? 0, nodes: host?.querySelectorAll('*').length ?? 0 });
    poll();
    const timer = window.setInterval(poll, 500);
    return () => window.clearInterval(timer);
  }, [host, mounted, busy]);

  const config: ParticleEmitterConfig = {
    emitterConfig: { spawnInterval: settings.interval, spawnParticlesPerWave: settings.wave, maxParticles: settings.max },
    particleConfig: {
      lifeTime: { value: settings.life },
      spawnPosition: { x: origin.x * bounds.width, y: origin.y * bounds.height },
      direction: { minAngle: -90 - settings.spread / 2, maxAngle: -90 + settings.spread / 2 },
      speed: { timelapses: [{ time: 0, value: settings.speed }], randomRange: { min: 0.6, max: 1.3 } },
      gravity: { timelapses: [{ time: 0, value: settings.gravity }] },
      alpha: { timelapses: [{ time: 0, value: 1 }, { time: 65, value: 0.8 }, { time: 100, value: 0 }] },
      scale: { timelapses: [{ time: 0, value: 1 }, { time: 100, value: 0.15 }] },
      rotation: { timelapses: [{ time: 0, value: 0 }, { time: 100, value: 160 }] },
      ...(canTint ? { color: { timelapses: [{ time: 0, value: color }, { time: 100, value: '#769dff' }] } } : {}),
    },
  };

  function change(key: keyof Settings, value: number) { setSettings((current) => ({ ...current, [key]: value })); }
  function chooseImage(value: string | readonly string[]) {
    const sources = (typeof value === 'string' ? value.split(/\r?\n/) : value).map((url) => url.trim()).filter(Boolean);
    setImageURLs(sources); setDraftImageURL(sources.join('\n')); setFailedImages({});
  }
  function command(action: keyof Pick<ParticleEmitterHandle, 'start' | 'pause' | 'resume' | 'stop' | 'restart' | 'clean' | 'emitWave'>, next?: Phase) {
    emitter.current?.[action]();
    if (next) setPhase(next);
  }

  return <div className="app">
    <header className="header"><a className="brand" href="#"><span className="brand-icon">✳</span> particle<span>flux</span><small> / react</small></a>
      <span className="header-note"><i /> Canvas renderer <span className="version">v0.1.0</span></span></header>
    <main>
      <div className="intro"><div><div className="eyebrow">INTERACTIVE PLAYGROUND</div><h1>Немного управляемого хаоса<span>.</span></h1>
        <p>Поток частиц на Canvas. Изображения, движение и управление в реальном времени.</p></div>
        <span className="badge">React StrictMode <span>ON</span></span></div>
      <div className="workspace">
        <section className="preview" aria-label="Предпросмотр частиц">
          <div className="stage-header"><span><i className={busy || phase === 'Работает' ? 'live' : 'idle'} />{busy ? 'Замер Canvas' : phase}</span><span>Canvas / LIVE PREVIEW</span></div>
          <div className="stage-area" onPointerDown={(event) => {
            if (busy) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setOrigin({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
          }}>
            <div ref={setHost} className="particle-layer" data-testid="particle-layer">
              {(mounted || busy) && <ParticleEmitter key={benchmark.run?.id ?? `scene-${sceneRevision}`}
                width={benchmark.run?.width ?? Math.max(1, bounds.width)} height={benchmark.run?.height ?? Math.max(1, bounds.height)}
                pixelRatio={benchmark.run?.pixelRatio}
                particle={busy ? { tint: '#9effcb' }
                  : { image: imageSource, imageMode: imageURLs.length ? imageMode : undefined }}
                config={benchmark.run ? benchmarkConfig(benchmark.run) : config} ref={emitter} seed={42}
                onStartEmit={() => { if (!busy) setPhase('Работает'); }} onStopEmit={() => { if (!busy) setPhase('Остановлен'); }} />}
            </div>
            {!busy && <div className="origin" style={{ left: `${origin.x * 100}%`, top: `${origin.y * 100}%` }}><span /><small>ИСТОЧНИК</small></div>}
            <div className="stage-hint">{busy ? 'Одинаковая сцена · seed 42 · фиксированная популяция' : '↖ Нажмите, чтобы переместить источник'}</div>
          </div>
          <div className="stats"><div><span>АКТИВНЫХ</span><strong data-testid="active-count">{visibleCounts.active}<small> / {benchmark.run?.count ?? settings.max}</small></strong></div>
            <div><span>DOM-УЗЛОВ</span><strong data-testid="node-count">{visibleCounts.nodes}</strong></div>
            <div><span>FPS</span><strong className="fps-value" data-testid="fps-count">{frameStats?.fps.toFixed(1) ?? '—'}</strong></div>
            <div><span>КАДР, МС</span><strong data-testid="frame-ms">{frameStats?.averageMS.toFixed(2) ?? '—'}</strong></div></div>
          <div className="transport"><div className="primary-controls">
            <button className="primary" disabled={!mounted || busy} onClick={() => command(phase === 'Пауза' ? 'resume' : 'start', 'Работает')}>{phase === 'Пауза' ? '▶ Продолжить' : '▶ Запустить'}</button>
            <button disabled={!mounted || busy || phase !== 'Работает'} onClick={() => command('pause', 'Пауза')}>Ⅱ Пауза</button>
            <button disabled={!mounted || busy} onClick={() => command('stop', 'Остановлен')}>■ Стоп</button>
          </div><button disabled={!mounted || busy} onClick={() => command('restart', 'Работает')}>↻ Заново</button></div>
        </section>
        <aside className="settings"><fieldset disabled={busy}><div className="panel-heading"><h2>Параметры</h2><button className="text-button" onClick={() => { setSettings(defaults); setColor('#9effcb'); chooseImage(''); setImageMode('image'); setOrigin({ x: 0.5, y: 0.64 }); }}>Сбросить</button></div>
          <section className="control-group"><h3><span>01</span> Эмиссия</h3>
            <Slider label="Интервал" value={settings.interval} min={10} max={200} step={5} unit=" мс" onChange={(v) => change('interval', v)} />
            <Slider label="Частиц в волне" value={settings.wave} min={1} max={1000} onChange={(v) => change('wave', v)} />
            <Slider label="Лимит частиц" value={settings.max} min={50} max={20000} step={50} onChange={(v) => change('max', v)} />
          </section>
          <section className="control-group"><h3><span>02</span> Движение</h3>
            <Slider label="Время жизни" value={settings.life} min={200} max={5000} step={100} unit=" мс" onChange={(v) => change('life', v)} />
            <Slider label="Скорость" value={settings.speed} min={0} max={8} step={0.1} onChange={(v) => change('speed', v)} />
            <Slider label="Разброс" value={settings.spread} min={0} max={360} step={5} unit="°" onChange={(v) => change('spread', v)} />
            <Slider label="Гравитация" value={settings.gravity} min={0} max={1} step={0.01} onChange={(v) => change('gravity', v)} />
          </section>
          <section className="control-group appearance"><h3><span>03</span> Внешний вид</h3>
            <form className="particle-image-controls" onSubmit={(event) => { event.preventDefault(); chooseImage(draftImageURL); }}>
              <label htmlFor="particle-image">Изображения частиц</label>
              <div className="image-input-row"><textarea id="particle-image" rows={3} aria-describedby="particle-images-help" value={draftImageURL} placeholder={'/particles/star.svg\n/particles/heart.svg'} onChange={(event) => setDraftImageURL(event.target.value)} /><button type="submit">Применить</button></div>
              <p id="particle-images-help" className="image-help">Один URL на строку. Для каждой новой частицы выбирается случайная картинка в её исходных размерах.</p>
              <div className="image-presets"><button type="button" onClick={() => chooseImage('')}>Круг</button>
                <button type="button" onClick={() => { chooseImage('./particles/star.svg'); setImageMode('image'); }}>Звезда</button>
                <button type="button" onClick={() => { chooseImage('./particles/glow.svg'); setImageMode('mask'); }}>Свечение</button>
                <button type="button" onClick={() => { chooseImage(['./particles/star.svg', './particles/heart.svg', './particles/diamond.svg']); setImageMode('image'); }}>Смешанный набор</button></div>
            </form>
            <div className="image-preview"><div className="image-preview-list">{previewImages.map((url, index) => <img key={`${index}:${url}`} src={failedImages[url] ? DEFAULT_PARTICLE_IMAGE : url}
              alt={`Образец частицы ${index + 1}`} onError={() => setFailedImages((current) => ({ ...current, [url]: true }))} />)}</div>
              <span>{Object.values(failedImages).some(Boolean) ? 'Недоступные картинки заменены белым кругом.'
                : imageURLs.length > 1 ? `Случайный набор · ${imageURLs.length} URL · seed 42` : imageURLs.length ? 'Своя картинка' : 'Белый круг по умолчанию'}</span></div>
            {imageURLs.length > 0 && <label className="image-tint-toggle"><input type="checkbox" checked={imageMode === 'mask'} onChange={(event) => setImageMode(event.target.checked ? 'mask' : 'image')} />Окрашивать силуэт картинки</label>}
            <div className="appearance-row"><label className="color-label">Цвет <input aria-label="Цвет" type="color" disabled={!canTint} value={color} onChange={(e) => setColor(e.target.value)} /><code>{color}</code></label></div>
          </section>
          <p className="settings-note">{busy ? 'На время замера настройки зафиксированы.' : 'Новые параметры применяются к новым частицам. Уже выпущенные завершают свой путь.'}</p></fieldset>
        </aside>
      </div>
      <PerformancePanel benchmark={benchmark} width={bounds.width} height={bounds.height} onPreset={(count) => {
        setSettings({ ...defaults, max: count, wave: Math.ceil(count / 20), interval: 50, life: 2000, speed: 0.6, spread: 360, gravity: 0 });
        setMounted(true); setSceneRevision((revision) => revision + 1);
      }} />
      <section className="lifecycle"><div><div className="eyebrow">LIFECYCLE CHECK</div><h2>Проверка очистки</h2><p>Очистка убирает активные частицы. Отключение удаляет поверхность и останавливает анимацию.</p></div>
        <div className="lifecycle-buttons"><button disabled={!mounted || busy} onClick={() => command('emitWave', 'Работает')}>+ Волна</button>
          <button disabled={!mounted || busy} onClick={() => command('clean')}>Очистить частицы</button>
          <button disabled={busy} className={mounted ? 'danger' : 'primary'} onClick={() => { setMounted(!mounted); setPhase(mounted ? 'Отключён' : 'Работает'); }}>{mounted ? 'Отключить эмиттер' : 'Подключить эмиттер'}</button></div>
      </section>
      <ResponsiveExample enabled={!busy} />
    </main><footer><span>particle-flux-react</span><span>Движение — в деталях.</span></footer>
  </div>;
}

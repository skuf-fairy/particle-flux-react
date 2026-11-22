import { useState } from 'react';
import type { useCanvasBenchmark } from './useCanvasBenchmark';

export function PerformancePanel({ benchmark, width, height, onPreset }: {
  benchmark: ReturnType<typeof useCanvasBenchmark>; width: number; height: number; onPreset(count: number): void;
}) {
  const [count, setCount] = useState(5000);
  const [duration, setDuration] = useState(5000);
  const busy = benchmark.run !== null;
  const names = { loading: 'Создание частиц', warmup: 'Прогрев', measuring: 'Измерение', idle: '' };
  return <section className="performance-panel" aria-label="Производительность Canvas">
    <div className="performance-heading"><div><div className="eyebrow">CANVAS BENCHMARK</div><h2>Canvas под нагрузкой.</h2>
      <p>От 1 000 до 20 000 движущихся частиц. Сравнивайте результаты при разной нагрузке.</p></div>
      <span className="badge">1 сек прогрев <span>+ {duration / 1000} сек замер</span></span></div>
    <div className="benchmark-controls"><label>Частиц в тесте<select aria-label="Частиц в тесте" disabled={busy} value={count} onChange={(e) => setCount(Number(e.target.value))}>
      {[1000, 5000, 10000, 20000].map((n) => <option key={n} value={n}>{n.toLocaleString('ru-RU')}</option>)}</select></label>
      <label>Длительность измерения<select aria-label="Длительность измерения" disabled={busy} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
        {[3000, 5000, 10000].map((ms) => <option key={ms} value={ms}>{ms / 1000} секунд</option>)}</select></label>
      <button className={busy ? 'danger' : 'primary'} onClick={() => busy ? benchmark.cancel() : benchmark.start({
        count, width: Math.max(1, width), height: Math.max(1, height), pixelRatio: window.devicePixelRatio || 1, durationMS: duration,
      })}>{busy ? 'Остановить замер' : 'Запустить замер'}</button>
      <button disabled={busy || !benchmark.results.length} onClick={benchmark.clearResults}>Очистить результаты</button>
    </div>
    <div className="benchmark-status" role="status">{busy ? 'Canvas · ' + names[benchmark.phase] : benchmark.message || 'Выберите число частиц и запустите замер. Сохраняются последние 8 результатов.'}</div>
    {busy && <progress className="benchmark-progress" aria-label="Прогресс замера" max={1} value={benchmark.progress} />}
    <div className="benchmark-table-wrap"><table className="benchmark-table"><caption>История замеров Canvas</caption><thead><tr>
      <th>Частиц</th><th>Сцена / DPR</th><th>FPS ↑</th><th>Кадр, мс ↓</th><th>p95, мс ↓</th><th>Кадров &gt;33,3 мс</th><th>Замеров</th><th>DOM-узлов</th>
    </tr></thead><tbody>{benchmark.results.map((result) => <tr key={result.id}>
      <th scope="row">{result.particles.toLocaleString('ru-RU')}</th><td>{Math.round(result.width)} × {Math.round(result.height)} / {Number(result.pixelRatio.toFixed(2))}</td>
      <td className="fps-result">{result.fps.toFixed(1)}</td><td>{result.averageMS.toFixed(2)}</td><td>{result.p95MS.toFixed(2)}</td>
      <td>{result.slowFramesPercent.toFixed(1)}%</td><td>{result.frames}</td><td>{result.nodes}</td>
    </tr>)}</tbody></table></div>
    <p className="benchmark-note">Частица 4 px · seed 42. FPS измеряется через requestAnimationFrame для всей страницы и ограничен частотой экрана. Прогрев и создание частиц исключены из замера. Скрытие сцены, вкладки или изменение окна прерывает тест. Для сравнения сохраняйте одинаковый размер сцены и DPR. Используйте production-сборку: npm run demo:build → npm run demo:preview.</p>
    <div className="load-presets"><span>Нагрузка в обычном режиме</span>{[1000, 5000, 10000, 20000].map((n) =>
      <button disabled={busy} key={n} onClick={() => onPreset(n)}>{n.toLocaleString('ru-RU')}</button>)}</div>
  </section>;
}

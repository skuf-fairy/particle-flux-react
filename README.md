# particle-flux-react

React-библиотека для эмиттера частиц [particle-flux](https://www.npmjs.com/package/particle-flux). Встроенный компонент рисует через Canvas 2D. Универсальный `useParticleEmitter` управляет эмиттером с вашим адаптером отображения.

## Компонент

```tsx
import { useRef } from 'react';
import { ParticleEmitter } from 'particle-flux-react';
import type { ParticleEmitterHandle } from 'particle-flux-react';

export function Effect() {
  const emitter = useRef<ParticleEmitterHandle>(null);
  return <>
    <ParticleEmitter
      ref={emitter}
      width="100%"
      height="24rem"
      seed={42}
      particle={{ image: ['/star.png', '/heart.png'], width: 20, height: 20 }}
      config={{
        emitterConfig: { spawnInterval: 40, spawnParticlesPerWave: 3, maxParticles: 600 },
        particleConfig: {
          lifeTime: { value: 1800 },
          spawnPosition: { x: 200, y: 250 },
          direction: { minAngle: -120, maxAngle: -60 },
          speed: { timelapses: [{ time: 0, value: 2 }] },
        },
      }}
    />
    <button onClick={() => emitter.current?.pause()}>Пауза</button>
    <button onClick={() => emitter.current?.resume()}>Продолжить</button>
    <button onClick={() => emitter.current?.clean()}>Очистить</button>
  </>;
}
```

Компонент создаёт контейнер `div` и один `canvas`. Отдельных элементов для частиц нет. Фон прозрачный, поверхность декоративная (`aria-hidden`). Координаты частиц задают их центр в CSS-пикселях.

| Prop | Значение |
| --- | --- |
| `config` | Обязательная конфигурация `ParticleEmitterConfig` из `particle-flux` |
| `width`, `height` | Число в CSS-пикселях или CSS-строка. По умолчанию 600 × 400 |
| `pixelRatio` | Положительное число; по умолчанию DPR окна поверхности |
| `particle` | Изображение, размеры и окраска частицы |
| `paused` | Приостанавливает эмиттер при монтировании и при изменении значения |
| `seed`, `random`, `maxCatchUpWaves` | Параметры ядра |
| `onStartEmit`, `onStopEmit` | Актуальные callbacks запуска и остановки |
| `className`, `style` | CSS-класс и стили внешнего контейнера |

### Изображения

Без `particle.image` используется встроенная картинка белого круга `DEFAULT_PARTICLE_IMAGE` — data URL, без внешнего запроса. По умолчанию круг окрашивается через `particle.tint` или цвет из конфигурации ядра.

`particle.image` принимает один URL или `readonly string[]`. Из массива изображение выбирается при каждом рождении частицы, в том числе при повторном использовании объектов из пула. Выбор учитывает `seed`; одинаковый seed воспроизводит последовательность. Пустые и пробельные URL игнорируются, пустой список возвращает круг по умолчанию. Одинаковые URL в массиве увеличивают вероятность их выбора.

Пользовательские картинки сохраняют исходные цвета. `imageMode: 'mask'` окрашивает их силуэт; `imageMode: 'image'` сохраняет цвета. Пропорции сохраняются внутри прямоугольника `particle.width × particle.height` (по умолчанию 8 × 8). Размеры частиц остаются числовыми.

```tsx
<ParticleEmitter config={config} particle={{
  image: '/spark.png', imageMode: 'mask', tint: '#9effcb', width: 24, height: 24,
}} />
```

PNG, WebP, SVG и другие форматы изображений поддерживаются, если браузер умеет их декодировать. SVG-файл здесь используется как картинка на Canvas. Ошибка загрузки заменяет источник кругом; остальные источники продолжают работать. Завершение загрузки перерисовывает даже приостановленную сцену, не запуская дополнительный RAF. Декодированные изображения разделяются между компонентами и освобождаются после удаления последнего использующего их объекта, включая пул.

Сохранён геометрический режим `shape: 'circle' | 'square'` при отсутствии `image`.

### CSS-размеры

```tsx
<div style={{ width: '100%', height: '24rem' }}>
  <ParticleEmitter config={config} width="calc(100% - 2rem)" height="100%" />
</div>
```

Можно задавать `%`, `vh`, `rem`, `calc()`, `min()`, `clamp()`, CSS-переменные и другие допустимые CSS-размеры. Для процентной высоты родителю нужен определённый размер. `auto` следует правилам CSS: без высоты родителя или содержимого высота контейнера может быть нулевой, поскольку Canvas позиционируется абсолютно.

`ResizeObserver` отслеживает фактическую область отображения. Буфер Canvas равен округлённому размеру области, умноженному на DPR. Изменения размеров, нулевые размеры и повторное появление поверхности сохраняют частицы, ref и состояние паузы. Масштабирование через CSS-transform не изменяет координатную систему симуляции. В окружениях без `ResizeObserver` доступны начальное измерение и повторное измерение при изменении props и размера окна; для отслеживания изменений родителя нужен polyfill.

### Управление и обновления

Стабильный `ParticleEmitterHandle` доступен через ref компонента или как результат хука:

| Метод | Действие |
| --- | --- |
| `start()` | Запустить эмиссию |
| `pause()`, `resume()` | Приостановить и продолжить симуляцию |
| `stop()` | Остановить эмиттер по правилам ядра |
| `restart()` | Перезапустить эмиттер и последовательность seed |
| `emitOnce(count?)`, `emitWave()` | Выпустить частицы вручную |
| `clean()` | Убрать активные частицы, сохранив пул для повторного использования |
| `getParticlesCount()` | Число активных частиц |
| `isEmitActive()` | Активна ли эмиссия |

Изменения конфигурации и внешнего вида применяются без пересоздания эмиттера. Уже выпущенные частицы завершают свой жизненный цикл с прежними параметрами; новые получают актуальные настройки. Эквивалентные inline-массивы URL сохраняют пул. Изменение `seed`, `random`, `maxCatchUpWaves` пересоздаёт симуляцию; handle остаётся стабильным.

`paused` применяется при инициализации и изменении значения; императивные команды могут его переопределять до следующего изменения prop. `config.emitterConfig.autoStart: false` отключает первоначальный запуск. Изменение `autoStart` после монтирования не является командой запуска.

При размонтировании останавливается RAF, отключаются observers и listeners, уничтожаются активные и pooled views, освобождаются изображения и очищается Canvas. В StrictMode повторный setup/cleanup не оставляет лишних циклов. Сохранённый handle безопасен после размонтирования. При SSR создаётся пустая разметка контейнера и Canvas; ядро и браузерные ресурсы инициализируются только в effect.

## Свой адаптер: useParticleEmitter

Хук сохраняет универсальный контракт `ViewContainer<View>` и `ViewFactory<View>` из ядра и не зависит от Canvas. Ваши views могут реализовывать DOM, SVG, WebGL или другой движок. Встроенный компонент не принимает `viewContainer` и `viewFactory`.

```tsx
import { useMemo } from 'react';
import type { ViewParticle } from 'particle-flux';
import { useParticleEmitter } from 'particle-flux-react';

// Адаптер хранит изменяемые views. Ваш движок читает их при отрисовке.
export function CustomEffect() {
  const adapter = useMemo(() => {
    const views = new Set<ViewParticle>();
    return {
      views,
      viewContainer: {
        addChild(view: ViewParticle) { views.add(view); },
        removeChild(view: ViewParticle) { views.delete(view); /* Освободите ресурсы view. */ },
      },
      viewFactory: (): ViewParticle => ({
        x: 0, y: 0, scale: { x: 1, y: 1 }, alpha: 1, tint: '#fff', angle: 0,
        destroyed: false, visible: false, width: 8, height: 8,
      }),
    };
  }, []);
  const emitter = useParticleEmitter({
    viewContainer: adapter.viewContainer,
    viewFactory: adapter.viewFactory,
    config: {
      emitterConfig: { spawnInterval: 100 },
      particleConfig: { lifeTime: { value: 1000 } },
    },
  });
  return <button onClick={() => emitter.emitOnce()}>Выпустить частицу</button>;
}
```

Этот пример показывает контракт хранения, а не готовый визуальный адаптер. Ядро изменяет свойства `ViewParticle` и использует собственный ticker. Ваш адаптер отображает эти значения через setters или цикл своего движка, учитывая `visible` и `destroyed`. При смерти частица может оставаться скрытой в пуле; `removeChild` вызывается при окончательном удалении. Хук уничтожает эмиттер; за собственные observers, циклы отрисовки и ресурсы вне views отвечает ваш адаптер. Сохраняйте ссылки на container/factory стабильными, чтобы не сбрасывать симуляцию и пул при каждом рендере. Смена container пересоздаёт эмиттер, смена factory обновляет фабрику без сброса живых частиц.

Типы: `ParticleEmitterProps`, `ParticleEmitterHandle`, `UseParticleEmitterOptions<View>`, `ParticleAppearance`, `ParticleImageMode`. Типы ядра импортируются из `particle-flux`.

## Демо и проверки

```sh
npm install
npm run demo
npm run check
npm run demo:build
npm run demo:preview
npm pack --dry-run
```

Демо показывает изображения и смешанный набор, редактирование параметров, запуск, паузу, очистку и размонтирование. Есть отдельный пример CSS-размеров и FPS-счётчик. Canvas benchmark запускает фиксированную популяцию 1 000–20 000 частиц с секундой прогрева и сохраняет последние 8 замеров. Можно сравнить разные нагрузки; таблица содержит размер сцены, DPR, FPS, средний интервал кадра, p95 и число DOM-узлов. FPS относится ко всей странице и ограничен экраном. При скрытии сцены/вкладки или изменении окна замер прерывается, завершённые результаты сохраняются. По завершении возвращаются обычные настройки. Для измерений используйте production preview.

`npm run check` проверяет TypeScript библиотеки, тестов и демо, затем запускает тесты и собирает ESM, CJS и объявления типов. Тесты покрывают универсальный хук, Canvas, обновления props, ref, StrictMode, SSR, изображения, CSS-размеры и benchmark. React 18 и 19 указаны как peer dependencies.

В рабочем проекте ядро подключено локально: `"particle-flux": "file:../particle-flux"`. Перед установкой соберите соседний проект, если его dist отсутствует. Перед публикацией замените локальную ссылку на опубликованную версию ядра и задайте лицензию (сейчас `UNLICENSED`). Пакет публикует только `dist` и стандартные файлы npm; демо и тесты в архив не входят. `prepack` запускает полный `check`.

## Переход с нескольких встроенных рендереров

Удалите `render` из JSX: `<ParticleEmitter config={config} />` всегда использует Canvas. Встроенные DOM/SVG-адаптеры, `DOMParticle`, `createDOMAdapter`, их типы, `ParticleRender` и `RenderedParticleEmitterProps` удалены. Для props компонента используйте `ParticleEmitterProps` без generic-параметра. Пользовательские адаптеры подключаются через `useParticleEmitter<View>` и `UseParticleEmitterOptions<View>`. `particle.className` удалён; `className` самого компонента применяется к контейнеру. URL SVG-изображений по-прежнему поддерживаются Canvas.

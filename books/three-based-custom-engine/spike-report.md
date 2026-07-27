# spike-report — технический эксперимент (этап 0)

> Отчёт по этапу 0 программы `custom-three-based-engine-book.md` (раздел 7).
> Задача этапа: проверить фактически, что схема верификации раздела 4 физически работает,
> **до** написания программы курса. Дата прогона — 2026-07-27.
>
> **Итог: схема работает. Пункты 1 и 2 этапа 0 выполняются, пересматривать раздел 4 не требуется.**
> Три слоя подтверждены измерением, и разделение между ними оказалось резче, чем предполагалось:
> счётчики воспроизводятся независимо от видеокарты, картинка — нет.

---

## 1. Что проверялось и что получилось

| # | Пункт этапа 0 | Результат |
|---|---|---|
| 1 | Headless-рендер: поднять Playwright + Chrome, отрендерить сцену, снять скриншот и `renderer.info` | ✅ работает, WebGL 2 через SwiftShader |
| 2 | Детерминированность: те же счётчики и та же картинка на двух прогонах и после перезапуска | ✅ кадр **побайтово** идентичен, счётчики совпадают точно |
| 3 | Ассеты в Node без GPU: разобрать модель из файла и снять ассерты | ✅ GLB разбирается без единой заглушки; текстуры — с заглушками (рецепт в §6) |
| 4 | Зафиксировать версии | ✅ §2 |
| 5 | Какие механизмы измерения памяти доступны и стабильны | ✅ §7; стабильны только счётчики объектов, байты — нет |

Три находки, меняющие план работ, — в §4, §5 и §8.

---

## 2. Окружение и зафиксированные версии

Машина владельца, Windows 10 Pro 19045.

| Компонент | Версия | Как получено |
|---|---|---|
| Node.js | 24.15.0 | `node --version` |
| npm | 11.12.1 | `npm --version` |
| Google Chrome (системный) | 150.0.7871.182 | `(Get-Item "C:\Program Files\Google\Chrome\Application\chrome.exe").VersionInfo.ProductVersion` |
| three | 0.185.1 | `npm ls --depth=0` |
| @types/three | 0.185.1 | `npm ls --depth=0` |
| TypeScript | 7.0.2 | `npx tsc --version` |
| esbuild | 0.28.1 | `npm ls --depth=0` |
| Playwright | 1.62.0 | `npm ls --depth=0` |
| pngjs | 7.0.0 | `npm ls --depth=0` |
| pixelmatch | 7.2.0 | `npm ls --depth=0` |

Браузер запускался **системный** (`channel: 'chrome'`), собственный chromium Playwright не скачивался.
`browser.version()` в прогоне вернул `150.0.7871.182` — совпадает с системным Chrome.

Параметры контура WebGL, снятые из страницы:

```
WebGL 2.0 (OpenGL ES 3.0 Chromium)
WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)
UNMASKED_VENDOR_WEBGL   : Google Inc. (Google)
UNMASKED_RENDERER_WEBGL : ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
MAX_TEXTURE_SIZE        : 8192
MAX_SAMPLES             : 4
MAX_TEXTURE_IMAGE_UNITS : 32
```

Ограничение `MAX_TEXTURE_SIZE = 8192` — свойство программного растеризатора, а не платформы;
в заданиях книги нельзя опираться на текстуры большего размера, иначе стенд не прогонит их сам.

---

## 3. Контур и команды

Стенд собирался в одноразовом каталоге вне репозитория. Состав:

```
spike/
  package.json          зависимости (см. §2)
  tsconfig.json         strict, noEmit, lib ES2022+DOM
  src/scene.ts          детерминированная сцена (листинг §10.1)
  web/index.html        страница
  web/bundle.js         сборка esbuild (1.2 МБ, без минификации)
  driver.mjs            водитель: сервер + Chrome + съём (листинг §10.2)
  compare.mjs           сверка кадров (листинг §10.3)
  asset-node.mjs        GLB round-trip в Node (листинг §10.4)
  asset-glb-texture.mjs GLB с текстурой в Node (листинг §10.5)
  out/                  результаты прогона
```

Команды прогона:

```bash
npm install three typescript esbuild playwright pngjs pixelmatch @types/three @types/pngjs
npx tsc --noEmit                                    # типы: 0 ошибок
npx esbuild src/scene.ts --bundle --format=iife --target=es2022 --outfile=web/bundle.js

node driver.mjs --label=A --runs=2                  # два прогона в одном запуске браузера
node driver.mjs --label=B --runs=1                  # отдельный процесс, новый браузер
node driver.mjs --label=C --runs=1 --no-gl-flags    # контрольный прогон без флагов (см. §5)
node compare.mjs A-1.png A-2.png A-1.png B-1.png

node asset-node.mjs                                 # 25 ассертов, GLB без текстур
node asset-glb-texture.mjs                          # 12 ассертов, GLB со встроенной текстурой
```

Сцена: пол, куб с текстурой из данных, сфера, `InstancedMesh` на 100 экземпляров,
направленный свет с картой теней 512×512, окружающий свет. Холст 640×360, `setPixelRatio(1)`,
сглаживание выключено. Прокручивается 60 кадров.

**Кадр зависит только от своего номера.** Ни `performance.now()`, ни `Date`, ни `Math.random()`
в стенде нет: положения экземпляров даёт линейный конгруэнтный генератор с зерном `20260727`,
поворот куба — функция от номера кадра. Без этого правила слой 2 недоказуем, и это первое
требование к любому будущему сценарию в `harness/`.

---

## 4. Слой 1 — счётчики

Снято после 60 кадров (`renderer.info` сбрасывается перед каждым `render()`, поэтому блок
`render` описывает последний кадр):

| Величина | Значение |
|---|---|
| `render.calls` | 5 |
| `render.triangles` | 1578 |
| `render.points` / `render.lines` | 0 / 0 |
| `render.frame` | 60 |
| `memory.geometries` | 4 |
| `memory.textures` | 4 |
| `programs.length` | 5 |
| собственный счётчик: кадров | 60 |
| собственный счётчик: обходов графа | 60 |
| собственный счётчик: посещено узлов | 420 |

Числа сходятся с ручным расчётом, то есть счётчик измеряет то, что мы думаем:

- **Вызовы отрисовки — 5.** Основной проход: пол, куб, сфера, инстансированный меш = 4.
  Теневой проход: только куб, потому что `castShadow` у `InstancedMesh` по умолчанию `false`,
  а пол только принимает тень = 1. Итого 5.
- **Треугольники — 1578.** Пол 2 + куб 12 + сфера `16·12·2 − 16·2 = 352` + экземпляры `12·100 = 1200`
  = 1566 в основном проходе, плюс 12 в теневом. `renderer.info` суммирует **оба** прохода — это
  важно для формулировок в книге: «draw calls» без указания проходов неоднозначны.
- **Узлов посещено 420** = 60 обходов × 7 узлов (`Scene` + 4 меша + 2 источника света).

Счётчики **не зависят от видеокарты**: контрольный прогон на реальном GPU (§5) дал те же
`calls = 5` и `triangles = 1578`. Это подтверждает главное допущение раздела 4.1 — точные числа
из слоя 1 можно писать в текст книги как факт.

---

## 5. Слой 2 — детерминированность кадра

Все сравнения — на кадре 640×360; хеш SHA-256 файла PNG, первые 16 знаков.

| Пара | Файлы идентичны | Различающихся пикселей | Макс. отклонение канала |
|---|---|---|---|
| A-1 ↔ A-2 (два прогона, один запуск браузера) | да, `c83e65b2ed0f3ff1` | 0 | 0 |
| A-1 ↔ B-1 (после полного перезапуска процесса и браузера) | да, `c83e65b2ed0f3ff1` | 0 | 0 |
| `toDataURL` ↔ композитный скриншот Playwright | нет (`c83e65b2…` / `da0e314c…`) | **0** | 0 |
| A-1 ↔ C-1 (**без флагов SwiftShader**) | нет (`5f28d338…`) | **104** (0,0451 %) | **189** |

Три вывода.

**1. Детерминированность полная — вплоть до байтов файла.** Допуск в сравнении с эталоном
нужен не для этого контура, а как страховка при смене версий; сверять можно жёстко.

**2. Два способа снять кадр дают одинаковые пиксели, но разные файлы.** `canvas.toDataURL()`
и `page.locator('canvas').screenshot()` совпали попиксельно (0 расхождений), но PNG-кодировщики
разные, поэтому хеши файлов различаются. **Сверять кадры надо по пикселям, а не по хешу файла** —
иначе стенд будет ломаться от смены способа съёмки.

**3. Находка, меняющая план: контур рендера определяется флагами запуска, и по умолчанию
headless-Chrome идёт на настоящую видеокарту.** Контрольный прогон без
`--use-angle=swiftshader --enable-unsafe-swiftshader` вернул

```
ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)
```

и кадр разошёлся с эталонным на 104 пикселях с максимальным отклонением канала 189 —
то есть отдельные пиксели отличаются радикально (края, фильтрация), хотя доля их мала.
Счётчики при этом совпали полностью.

Практически это значит: **флаги контура — часть эталона, а не деталь запуска.** Если их не
закрепить, эталонные скриншоты станут зависеть от того, какая видеокарта стоит у того, кто их
снимал, и у читателя проверка развалится без всякой ошибки в его коде. Требование раздела 4.2
(«эталон снимается тем же контуром, которым потом сверяется») этим прогоном подтверждено
измерением, а не рассуждением.

Не проверялось: детерминированность прогона **на реальном GPU** (повторяемость кадра между
двумя прогонами с настоящей видеокартой). Для схемы это не нужно — эталонный контур программный, —
но как факт не установлено.

---

## 6. Ловушка: атрибуты контекста молча теряются

Найдена не рассуждением, а тем, что первый же снятый кадр оказался **полностью прозрачным**:
единственный цвет во всём изображении — `(0, 0, 0, 0)`.

Причина: холст сначала опрашивали на поддержку WebGL 2 «безобидным» вызовом

```ts
const gl2 = canvas.getContext('webgl2');   // пробник поддержки
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
```

Контекст создаётся у холста один раз; повторный `getContext` возвращает уже созданный
и **игнорирует новые атрибуты без единого предупреждения**. Замер прямо в странице:

```
запрошено: { antialias: false, preserveDrawingBuffer: true }
получено : { antialias: true,  preserveDrawingBuffer: false }
```

Два последствия сразу: `preserveDrawingBuffer: false` — кадр после композиции очищен, `toDataURL`
отдаёт пустоту; `antialias: true` — включается сглаживание, которое стенд намеренно выключал.
Второе видно по числу уникальных цветов кадра: **405 до исправления и 140 после**.

Лечение — опрашивать поддержку на отдельном холсте. Для книги это готовый сюжет: сообщение
об ошибке отсутствует, а «сломано» проявляется через две подсистемы сразу.

---

## 7. Слой 3 — ассеты в Node без GPU

### 7.1. GLB без текстур — работает начисто

Модель собирается и разбирается в одном процессе Node: скелет из двух костей, скиннованный меш
с весами, одна морф-цель, два материала, анимационный клип из двух дорожек. Экспорт → файл →
разбор из файла → 25 ассертов, все проходят. Размер файла 9120 байт, **побайтово воспроизводим**
между прогонами (SHA-256 `81A40E6556AD2972…`).

`GLTFLoader.parse()` для GLB **не требует ни одной заглушки** — двоичный кусок лежит внутри файла,
загрузчик никуда не ходит.

`GLTFExporter` в Node требует ровно один полифилл — браузерный `FileReader`, и только метод
`readAsArrayBuffer`:

```js
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => { this.result = b; if (this.onloadend) this.onloadend(); });
  }
};
```

Что проверено ассертами: число и имена мешей, признак скиннованного меша, число костей в графе,
число и имена материалов, тип материала, `metalness` `0.25`, `roughness` `0.75`, цвет `3366cc`,
число вершин `32` и треугольников `20`, наличие `skinIndex`/`skinWeight`, число морф-целей `1`
и её имя `Stretch`, число вершин второго меша `63`, число клипов `1`, имя `Wave`, длительность `2` с,
число дорожек `2`, число сцен `1`, габариты.

Два числа, которые интуиция даёт неверно (обе ошибки были допущены и исправлены пересчётом):

- **Вершин у `BoxGeometry(1, 2, 1, 1, 2, 1)` — 32, а не 24.** Грани не делят вершины: боковые
  грани `±x` и `±z` дают сетку 2×3 = 6 вершин, грани `±y` — 2×2 = 4. Итого `4·6 + 2·4 = 32`,
  треугольников `4·4 + 2·2 = 20`.
- **`computeBoundingBox()` расширяет объём морф-целями.** По атрибуту `position` габариты
  `−0.5 … 0.5` по X, а `computeBoundingBox()` даёт `−0.75 … 0.75`, потому что морф растягивает X
  в полтора раза. Для бюджета отсечения это существенно, и в книге это отдельный факт.

### 7.2. Текстуры в Node — работают, но по рецепту

Установлено ступенчатым опытом, **каждая ступень — отдельный процесс**. Это принципиально:
в одном процессе ступени отравляют друг друга, потому что `FileLoader` склеивает одинаковые
адреса в общую очередь ожидания, и после сорванной попытки следующая подписывается на колбэк,
который уже никогда не вызовется. Первая версия опыта дала три ложных «зависания» подряд.

Документ glTF с картинкой в `data:`-адресе:

| Ступень | Заглушки | Результат |
|---|---|---|
| 1 | нет | `ReferenceError: self is not defined` (в `GLTFParser.loadImageSource`) |
| 2 | `self = globalThis` | `ReferenceError: ProgressEvent is not defined` (в `FileLoader`, асинхронно) |
| 3 | + `createImageBitmap` через pngjs | та же ошибка `ProgressEvent` |
| 4 | + `ProgressEvent` | ✅ **разобрано**, картинка 4×4 декодирована |

`fetch` по `data:`-адресу в Node 24 работает штатно (`status 200`, тип `image/png`) — транспорт
ни при чём, всё упирается в браузерные глобальные объекты.

Для **GLB со встроенной текстурой** (основной путь книги) нужны ещё две вещи. Картинка лежит
в `bufferView`, загрузчик заворачивает её в `Blob`, берёт `blob:`-адрес и идёт за ним через
`fetch`. Node такой адрес **создать умеет, а скачать по нему — нет**. Плюс строгий PNG-декодер
спотыкается о выравнивание:

```
createImageBitmap: получено 416 байт, type="image/png"; отрезано 3 байт добивки
createImageBitmap: декодировано 64x64
```

`bufferView` в GLB выровнен до 4 байт, за концом PNG-потока идёт добивка, и pngjs отвечает
`unrecognised content at end of stream`. Режется по маркеру `IEND` + 4 байта CRC.

Полный достаточный набор для GLB с текстурой: `self`, `ProgressEvent`, `createImageBitmap`,
собственный реестр `blob:`-адресов с подменой `fetch`, обрезка добивки PNG. С ним проходят все
12 ассертов, включая **цвета конкретных пикселей** декодированной текстуры: светлая клетка
`(220, 200, 120)`, тёмная `(40, 60, 90)` — те самые, что задавались при генерации.
Минимальность набора не проверялась: `self` и `ProgressEvent` доказаны как необходимые
на пути `data:`-адреса, остальные три элемента вводились по факту ошибки.

**Вывод для программы курса:** подсистему ассетов можно проверять слоем 3 целиком, включая
содержимое текстур, без браузера и без GPU. Заглушки — разовый код стенда (~25 строк),
а не то, что читатель пишет в своём движке.

---

## 8. Механизмы измерения памяти

Прогоны: A-1 и A-2 — один запуск браузера, B-1 — после перезапуска, C-1 — контур реального GPU.

| Механизм | A-1 | A-2 | B-1 | C-1 | Разброс | Пригодность |
|---|---|---|---|---|---|---|
| `renderer.info.memory.geometries` | 4 | 4 | 4 | 4 | **0** | ✅ критерий приёмки |
| `renderer.info.memory.textures` | 4 | 4 | 4 | 4 | **0** | ✅ критерий приёмки |
| `performance.memory.usedJSHeapSize`, байт | 5 888 911 | 5 821 511 | 5 544 951 | 5 821 707 | ≈ 6,2 % | ⚠️ только относительные сравнения |
| `performance.memory.totalJSHeapSize`, байт | 10 555 687 | 10 555 687 | 10 293 543 | 10 293 535 | ≈ 2,5 % | ⚠️ то же |
| `performance.measureUserAgentSpecificMemory()`, байт | 9 047 570 | 9 048 738 | 9 056 940 | 9 054 600 | ≈ 0,1 % | ⚠️ то же, но заметно ровнее |
| время прогона, мс | 17 121 | 13 702 | 13 148 | 12 930 | ≈ 32 % | ⛔ никогда не критерий |

Замечания:

- `performance.memory` требует флага `--enable-precise-memory-info`, иначе значения округляются.
- `performance.measureUserAgentSpecificMemory()` требует **кросс-происхожденческой изоляции**:
  сервер стенда обязан отдавать `Cross-Origin-Opener-Policy: same-origin` и
  `Cross-Origin-Embedder-Policy: require-corp`. В прогоне `crossOriginIsolated === true`,
  API доступен и работает. Это ещё и самый ровный из байтовых показателей.
- Разброс времени прогона (12,9–17,1 с на одинаковой работе) — прямое подтверждение жёсткого
  правила раздела 4.1: абсолютные тайминги в критерии приёмки не входят. Теперь это измерено.
- Прямого способа измерить память **на стороне GPU** в этом контуре не найдено:
  `WEBGL_debug_renderer_info` даёт только строку описания устройства. Считать придётся
  по своим счётчикам движка (размеры буферов и текстур), а не спрашивать у браузера.

---

## 9. Что из этого следует для этапа 2

1. **Схема раздела 4 остаётся без изменений.** Пункты 1 и 2 этапа 0 выполнены, оснований
   пересматривать трёхслойную проверку нет.
2. **Разделение слоёв подтверждено измерением и оказалось резче ожидаемого**: счётчики
   не зависят от видеокарты (одинаковы на SwiftShader и на RTX 4070), кадр — зависит.
   Значит числа из слоя 1 идут в текст книги как факты, а картинки — только внутрь стенда
   с закреплённым контуром.
3. **Флаги запуска браузера входят в эталон.** Формулировка для `harness/`: контур эталона —
   системный Chrome с `--use-angle=swiftshader --enable-unsafe-swiftshader`; без них Chrome
   молча уходит на настоящий GPU.
4. **Требования к сценариям стенда**, вытекающие из прогона: кадр — функция номера кадра
   (ни времени, ни случайности); сверка кадров по пикселям, не по хешу файла; сервер стенда
   отдаёт COOP/COEP; `/favicon.ico` обслуживается (иначе критерий «ноль ошибок консоли»
   срабатывает ложно).
5. **Подсистема ассетов проверяема слоем 3 целиком**, включая содержимое текстур —
   контрольная точка по ресурсам может опираться на быстрые Node-тесты, а не на браузер.
6. **Инструментарий** этапа 0 (`esbuild` + собственный статический сервер) выбран как
   минимальный для эксперимента и **не является решением этапа 2**: книге понадобится
   ещё горячая перезагрузка (раздел 2), а её esbuild-сборкой в один файл не покрыть.
7. **Ограничение эталонного контура**: `MAX_TEXTURE_SIZE = 8192`, `MAX_SAMPLES = 4`.
   Задания не должны требовать большего, иначе стенд не сможет их прогнать.

Открытый вопрос к владельцу (не блокирует этап 1): стенд этапа 0 сейчас существует только
листингами этого отчёта. Решение 6.3 разрешает коммитить код стенда, но выбор инструментария —
предмет этапа 2, поэтому `package.json` в репозиторий пока не заводился.

---

## 10. Листинги стенда

Стенд восстановим из этого раздела целиком: `npm install` по §3, четыре файла ниже,
`tsconfig.json` со `strict: true`, `noEmit: true`, `lib: ["ES2022", "DOM"]`, и `web/index.html`
из одного тега `<script src="./bundle.js">` на чёрном фоне.

### 10.1. `src/scene.ts`

```ts
// Стенд этапа 0: детерминированная сцена на three.js.
// Никакого времени и никакой случайности в кадре — состояние определяется
// только номером кадра, иначе два прогона разойдутся и слой 2 недоказуем.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const WIDTH = 640;
const HEIGHT = 360;
const FRAMES = 60;
const INSTANCES = 100;

// Линейный конгруэнтный генератор с фиксированным зерном.
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Шахматная текстура из данных: без загрузки файлов и без декодера картинок,
// поэтому байты пикселей одинаковы в любом окружении.
function makeCheckerTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      data[i] = on ? 220 : 40;
      data[i + 1] = on ? 200 : 60;
      data[i + 2] = on ? 120 : 90;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

interface Counters {
  frames: number;
  traversals: number;
  objectsVisited: number;
}

async function main(): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  document.body.appendChild(canvas);

  // Проверка поддержки WebGL 2 — на ОТДЕЛЬНОМ холсте. Контекст создаётся один
  // раз на холст, и повторный getContext возвращает уже созданный, молча
  // игнорируя новые атрибуты: пробник на рабочем холсте отменил бы
  // preserveDrawingBuffer рендерера, и кадр снялся бы пустым.
  const probeCanvas = document.createElement('canvas');
  const hasWebGL2 = probeCanvas.getContext('webgl2') !== null;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // сглаживание — источник расхождений между растеризаторами
    preserveDrawingBuffer: true, // нужен, чтобы снять кадр через toDataURL
  });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x101820, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 100);
  camera.position.set(4, 3.2, 6);
  camera.lookAt(0, 0.5, 0);

  const texture = makeCheckerTexture();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.4, 1.4),
    new THREE.MeshStandardMaterial({ map: texture, metalness: 0.1, roughness: 0.6 })
  );
  box.position.set(0, 0.9, 0);
  box.castShadow = true;
  scene.add(box);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff8844 })
  );
  marker.position.set(-2.2, 0.9, 1.4);
  scene.add(marker);

  const rnd = makeRandom(20260727);
  const instanced = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.25, 0.25, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x88cc66, roughness: 0.8 }),
    INSTANCES
  );
  const m = new THREE.Matrix4();
  for (let i = 0; i < INSTANCES; i++) {
    m.makeTranslation((rnd() - 0.5) * 12, 0.15 + rnd() * 0.4, (rnd() - 0.5) * 12);
    instanced.setMatrixAt(i, m);
  }
  instanced.instanceMatrix.needsUpdate = true;
  scene.add(instanced);

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(5, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const counters: Counters = { frames: 0, traversals: 0, objectsVisited: 0 };
  const consoleErrors: string[] = [];
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', () => {
    contextLost = true;
  });

  // Собственный счётчик движка: обход графа сцены за кадр.
  const countTraversal = (): void => {
    counters.traversals++;
    scene.traverse(() => {
      counters.objectsVisited++;
    });
  };

  // Кадр зависит только от своего номера — ни performance.now, ни Date.
  const step = (frame: number): void => {
    const a = (frame / FRAMES) * Math.PI * 2;
    box.rotation.set(a * 0.5, a, 0);
    marker.position.y = 0.9 + Math.sin(a) * 0.3;
    countTraversal();
    renderer.render(scene, camera);
    counters.frames++;
  };

  await new Promise<void>((resolve) => {
    let frame = 0;
    const tick = (): void => {
      step(frame);
      frame++;
      if (frame >= FRAMES) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const glInfo: Record<string, unknown> = {
    hasWebGL2,
    isWebGL2: renderer.capabilities.isWebGL2 ?? true,
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    vendor: gl.getParameter(gl.VENDOR),
    rendererString: gl.getParameter(gl.RENDERER),
    unmaskedVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxSamples: gl.getParameter((gl as WebGL2RenderingContext).MAX_SAMPLES),
    maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    contextLost,
    glError: gl.getError(),
    contextAttributes: gl.getContextAttributes(),
    // Прямая демонстрация ловушки: на холст сначала берут контекст «просто так»,
    // и атрибуты, запрошенные рендерером, теряются без единого предупреждения.
    contextTrap: (() => {
      const c = document.createElement('canvas');
      c.getContext('webgl2'); // «безобидный» пробник поддержки
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: false, preserveDrawingBuffer: true });
      const got = r.getContext().getContextAttributes();
      r.dispose();
      return { requested: { antialias: false, preserveDrawingBuffer: true }, actual: got };
    })(),
  };

  const info = renderer.info;
  const infoSnapshot = {
    render: {
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      frame: info.render.frame,
    },
    memory: { geometries: info.memory.geometries, textures: info.memory.textures },
    programs: info.programs ? info.programs.length : -1,
  };

  // Механизмы измерения памяти: что вообще доступно в этом контуре.
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
  };
  const memory: Record<string, unknown> = {
    crossOriginIsolated: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated ?? false,
    hasPerformanceMemory: typeof perf.memory === 'object',
    performanceMemory: perf.memory
      ? {
          usedJSHeapSize: perf.memory.usedJSHeapSize,
          totalJSHeapSize: perf.memory.totalJSHeapSize,
          jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
        }
      : null,
    hasMeasureUserAgentSpecificMemory: typeof perf.measureUserAgentSpecificMemory === 'function',
    measureUserAgentSpecificMemory: null as unknown,
  };
  if (typeof perf.measureUserAgentSpecificMemory === 'function') {
    try {
      const r = await perf.measureUserAgentSpecificMemory();
      memory.measureUserAgentSpecificMemory = r.bytes;
    } catch (e) {
      memory.measureUserAgentSpecificMemory = 'error: ' + String(e);
    }
  }

  const png = canvas.toDataURL('image/png');

  // Побочная задача этапа 0: собрать GLB со ВСТРОЕННОЙ текстурой. В Node
  // экспортёр этого не может (кодирование картинки идёт через canvas), поэтому
  // ассет готовится здесь, а разбирается потом в чистом Node.
  let texturedGlb = '';
  try {
    const exportScene = new THREE.Scene();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'CheckerMaterial', map: makeCheckerTexture(), roughness: 0.5 })
    );
    plane.name = 'TexturedPlane';
    exportScene.add(plane);
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(exportScene, (r) => resolve(r as ArrayBuffer), reject, { binary: true });
    });
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    texturedGlb = btoa(bin);
  } catch (e) {
    texturedGlb = 'error: ' + String(e);
  }

  (window as unknown as Record<string, unknown>).__spike = {
    done: true,
    result: { ok: true, gl: glInfo, info: infoSnapshot, engine: counters, memory, consoleErrors, png, texturedGlb },
  };
}

(window as unknown as Record<string, unknown>).__spike = { done: false };
main().catch((e: unknown) => {
  (window as unknown as Record<string, unknown>).__spike = {
    done: true,
    result: { ok: false, error: String(e && (e as Error).stack ? (e as Error).stack : e) },
  };
});
```

### 10.2. `driver.mjs`

```js
// Водитель этапа 0: поднимает страницу стенда в headless-Chrome,
// крутит N кадров, снимает счётчики и кадр. Никакой прозы — только скрипт.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

const argOf = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const LABEL = argOf('label', 'run');
const RUNS = Number(argOf('runs', '1'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

// COOP/COEP — иначе performance.measureUserAgentSpecificMemory() недоступен.
const server = http.createServer((req, res) => {
  const rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  // Без этого Chrome сам просит /favicon.ico и получает 404 — а «ноль ошибок
  // в консоли» является критерием приёмки, ложное срабатывание недопустимо.
  if (rel === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;

// Флаги проверяются отдельным прогоном: неиспользуемый «магический» флаг в
// стенде книги хуже отсутствующего — его потом никто не решится убрать.
const GL_FLAGS = process.argv.includes('--no-gl-flags')
  ? []
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    ...GL_FLAGS,
    '--enable-precise-memory-info',
    '--force-color-profile=srgb',
    '--disable-lcd-text',
    '--hide-scrollbars',
  ],
});

const summary = { label: LABEL, url, browserVersion: browser.version(), runs: [] };

for (let i = 1; i <= RUNS; i++) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const t0 = process.hrtime.bigint();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__spike && window.__spike.done === true, null, { timeout: 60000 });
  const result = await page.evaluate(() => window.__spike.result);
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;

  if (result.ok) {
    const base64 = result.png.slice(result.png.indexOf(',') + 1);
    fs.writeFileSync(path.join(OUT, `${LABEL}-${i}.png`), Buffer.from(base64, 'base64'));
    // Второй способ снятия кадра — композитный скриншот Playwright, для сравнения подходов.
    await page.locator('canvas').screenshot({ path: path.join(OUT, `${LABEL}-${i}-shot.png`) });
    delete result.png;
    if (result.texturedGlb && !result.texturedGlb.startsWith('error:')) {
      fs.writeFileSync(path.join(OUT, 'textured.glb'), Buffer.from(result.texturedGlb, 'base64'));
      result.texturedGlbBytes = Buffer.from(result.texturedGlb, 'base64').length;
    }
    delete result.texturedGlb;
  }
  result.consoleErrors = consoleErrors;
  result.wallMs = Math.round(wallMs);
  summary.runs.push(result);
  fs.writeFileSync(path.join(OUT, `${LABEL}-${i}.json`), JSON.stringify(result, null, 2));
  await context.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(OUT, `${LABEL}-summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
```

### 10.3. `compare.mjs`

```js
// Сверка кадров: побайтовая и попиксельная, с допуском.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

function diff(aPath, bPath, outName) {
  const a = PNG.sync.read(fs.readFileSync(aPath));
  const b = PNG.sync.read(fs.readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { pair: `${path.basename(aPath)} ↔ ${path.basename(bPath)}`, sizeMismatch: true };
  }
  const out = new PNG({ width: a.width, height: a.height });
  const mismatched = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.1 });
  if (outName) fs.writeFileSync(path.join(OUT, outName), PNG.sync.write(out));
  // Максимальное отклонение канала — «сырая» метрика, без порога pixelmatch.
  let maxChannelDelta = 0;
  let differingBytes = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    if (d > 0) differingBytes++;
    if (d > maxChannelDelta) maxChannelDelta = d;
  }
  const total = a.width * a.height;
  return {
    pair: `${path.basename(aPath)} ↔ ${path.basename(bPath)}`,
    size: `${a.width}x${a.height}`,
    sha: [sha(aPath), sha(bPath)],
    identicalFile: sha(aPath) === sha(bPath),
    mismatchedPixels: mismatched,
    mismatchedPercent: +((mismatched / total) * 100).toFixed(4),
    differingBytes,
    maxChannelDelta,
  };
}

const pairs = process.argv.slice(2);
const report = [];
for (let i = 0; i < pairs.length; i += 2) {
  const a = path.join(OUT, pairs[i]);
  const b = path.join(OUT, pairs[i + 1]);
  if (!fs.existsSync(a) || !fs.existsSync(b)) {
    report.push({ pair: `${pairs[i]} ↔ ${pairs[i + 1]}`, missing: true });
    continue;
  }
  report.push(diff(a, b, `diff-${pairs[i].replace('.png', '')}-${pairs[i + 1]}`));
}
console.log(JSON.stringify(report, null, 2));
```

### 10.4. `asset-node.mjs`

```js
// Слой 3, фундамент подсистемы ассетов: собрать GLB и разобрать его обратно
// в чистом Node — без браузера, без GPU, без сети.
// Ассет генерируется здесь же, поэтому у него нет вопросов с лицензией.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// GLTFExporter в двоичном режиме собирает файл через Blob и читает его
// браузерным FileReader, которого в Node нет. Нужны ровно три члена класса.
// Загрузчику (GLTFLoader.parse) никаких полифиллов не требуется.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((b) => {
        this.result = b;
        if (this.onloadend) this.onloadend();
      });
    }
  };
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const GLB = path.join(OUT, 'model.glb');

const checks = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, expected, actual, ok });
};

// --- Сборка исходной модели ---------------------------------------------
function buildModel() {
  const root = new THREE.Group();
  root.name = 'Root';

  // Скелет из двух костей.
  const boneRoot = new THREE.Bone();
  boneRoot.name = 'BoneRoot';
  const boneTip = new THREE.Bone();
  boneTip.name = 'BoneTip';
  boneTip.position.y = 1;
  boneRoot.add(boneTip);
  const skeleton = new THREE.Skeleton([boneRoot, boneTip]);

  // Геометрия с весами скиннинга и одной морф-целью.
  const geometry = new THREE.BoxGeometry(1, 2, 1, 1, 2, 1);
  const count = geometry.attributes.position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const y = geometry.attributes.position.getY(i);
    const w = Math.min(Math.max((y + 1) / 2, 0), 1);
    skinIndex[i * 4] = 0;
    skinIndex[i * 4 + 1] = 1;
    skinWeight[i * 4] = 1 - w;
    skinWeight[i * 4 + 1] = w;
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

  const morph = geometry.attributes.position.clone();
  for (let i = 0; i < count; i++) morph.setX(i, morph.getX(i) * 1.5);
  geometry.morphAttributes.position = [morph];

  const material = new THREE.MeshStandardMaterial({
    name: 'BodyMaterial',
    color: 0x3366cc,
    metalness: 0.25,
    roughness: 0.75,
  });

  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'Body';
  mesh.morphTargetDictionary = { Stretch: 0 };
  mesh.morphTargetInfluences = [0];
  mesh.add(boneRoot);
  mesh.bind(skeleton);
  root.add(mesh);

  // Обычный меш со своим материалом — чтобы проверить счёт материалов.
  const prop = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 6),
    new THREE.MeshStandardMaterial({ name: 'PropMaterial', color: 0xcc3333, roughness: 1 })
  );
  prop.name = 'Prop';
  prop.position.set(1.5, 0, 0);
  root.add(prop);

  const clip = new THREE.AnimationClip('Wave', 2, [
    new THREE.VectorKeyframeTrack('BoneTip.position', [0, 1, 2], [0, 1, 0, 0.5, 1, 0, 0, 1, 0]),
    new THREE.NumberKeyframeTrack('Body.morphTargetInfluences[Stretch]', [0, 2], [0, 1]),
  ]);

  return { root, clip };
}

// --- Экспорт -------------------------------------------------------------
const { root, clip } = buildModel();
const exporter = new GLTFExporter();
const glb = await new Promise((resolve, reject) => {
  exporter.parse(root, resolve, reject, { binary: true, animations: [clip] });
});
fs.writeFileSync(GLB, Buffer.from(glb));
const glbBytes = fs.statSync(GLB).size;

// --- Разбор обратно из файла --------------------------------------------
const buf = fs.readFileSync(GLB);
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const loader = new GLTFLoader();
const gltf = await new Promise((resolve, reject) => {
  loader.parse(arrayBuffer, '', resolve, reject);
});

// --- Ассерты по разобранной модели --------------------------------------
const meshes = [];
const materials = new Map();
let bones = 0;
let objects = 0;
gltf.scene.traverse((o) => {
  objects++;
  if (o.isBone) bones++;
  if (o.isMesh) {
    meshes.push(o);
    if (o.material) materials.set(o.material.name || o.material.uuid, o.material);
  }
});
meshes.sort((a, b) => a.name.localeCompare(b.name));

const body = meshes.find((m) => m.name === 'Body');
const prop = meshes.find((m) => m.name === 'Prop');
const bodyGeo = body.geometry;

check('число мешей', meshes.length, 2);
check('имена мешей', meshes.map((m) => m.name), ['Body', 'Prop']);
check('Body — скиннованный меш', body.isSkinnedMesh === true, true);
check('число костей в графе', bones, 2);
check('число уникальных материалов', materials.size, 2);
check('имена материалов', [...materials.keys()].sort(), ['BodyMaterial', 'PropMaterial']);
check('тип материала Body', body.material.type, 'MeshStandardMaterial');
check('metalness материала Body', body.material.metalness, 0.25);
check('roughness материала Body', body.material.roughness, 0.75);
check('цвет материала Body (hex)', body.material.color.getHexString(), '3366cc');
// BoxGeometry(1,2,1, 1,2,1): вершины не общие между гранями, каждая грань —
// своя сетка (сегменты+1)². Боковые ±x и ±z: 2×3 = 6 вершин и 2 квада = 4
// треугольника каждая; ±y: 2×2 = 4 вершины и 1 квад = 2 треугольника.
// Итого 4·6 + 2·4 = 32 вершины и 4·4 + 2·2 = 20 треугольников.
check('вершин в Body', bodyGeo.attributes.position.count, 32);
check('индексов в Body', bodyGeo.index.count, 60);
check('треугольников в Body', bodyGeo.index.count / 3, 20);
check('атрибут skinIndex есть', bodyGeo.attributes.skinIndex !== undefined, true);
check('атрибут skinWeight есть', bodyGeo.attributes.skinWeight !== undefined, true);
check('морф-целей у Body', bodyGeo.morphAttributes.position.length, 1);
check('имя морф-цели', Object.keys(body.morphTargetDictionary ?? {}), ['Stretch']);
check('вершин в Prop', prop.geometry.attributes.position.count, 63);
check('анимационных клипов', gltf.animations.length, 1);
check('имя клипа', gltf.animations[0].name, 'Wave');
check('длительность клипа, с', gltf.animations[0].duration, 2);
check('дорожек в клипе', gltf.animations[0].tracks.length, 2);
check('сцен в файле', gltf.scenes.length, 1);

// Ограничивающий объём — механическая проверка «модель не пустая и не уехала».
// Считаем двумя способами, чтобы отделить базовую геометрию от морф-цели.
const pos = bodyGeo.attributes.position;
const manual = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < pos.count; i++) {
  const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
  for (let k = 0; k < 3; k++) {
    manual.min[k] = Math.min(manual.min[k], v[k]);
    manual.max[k] = Math.max(manual.max[k], v[k]);
  }
}
check('габариты Body по атрибуту position', [...manual.min, ...manual.max], [-0.5, -1, -0.5, 0.5, 1, 0.5]);

// computeBoundingBox() расширяет объём морф-целями: морф растягивает X в 1.5
// раза, поэтому 0.5 → 0.75. Для бюджета отсечения это существенно.
bodyGeo.computeBoundingBox();
const bb = bodyGeo.boundingBox;
check(
  'габариты Body по computeBoundingBox (с морф-целью)',
  [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z],
  [-0.75, -1, -0.5, 0.75, 1, 0.5]
);

const failed = checks.filter((c) => !c.ok);
console.log(
  JSON.stringify(
    {
      glbBytes,
      objectsInGraph: objects,
      checks: checks.length,
      failed: failed.length,
      failures: failed,
      nodeMemoryAfterMB: +(process.memoryUsage().heapUsed / 1048576).toFixed(1),
    },
    null,
    2
  )
);
if (failed.length > 0) process.exitCode = 1;
```

### 10.5. `asset-glb-texture.mjs`

```js
// Основной путь книги: GLB со встроенной текстурой, разбираемый в чистом Node.
// Заглушки установлены ступенчатым опытом (см. §7.2 отчёта).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.self = globalThis;
globalThis.ProgressEvent = class ProgressEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};
globalThis.createImageBitmap = async (blob) => {
  const raw = Buffer.from(await blob.arrayBuffer());
  // В GLB картинка лежит в bufferView, выровненном до 4 байт, поэтому за
  // концом PNG-потока может идти добивка. Строгий декодер на неё ругается:
  // «unrecognised content at end of stream». Режем по IEND + 4 байта CRC.
  const iend = raw.indexOf('IEND', 0, 'ascii');
  const bytes = iend >= 0 ? raw.subarray(0, iend + 8) : raw;
  const decoded = PNG.sync.read(bytes);
  return { width: decoded.width, height: decoded.height, data: decoded.data, close() {} };
};

// В GLB картинка заворачивается в Blob, загрузчик берёт blob:-адрес и идёт за
// ним через fetch. Node такой адрес создать умеет, а скачать по нему — нет.
const blobRegistry = new Map();
const realFetch = globalThis.fetch;
URL.createObjectURL = (blob) => {
  const url = `blob:spike/${blobRegistry.size}`;
  blobRegistry.set(url, blob);
  return url;
};
URL.revokeObjectURL = (url) => blobRegistry.delete(url);
globalThis.fetch = async (url, opts) => {
  const key = String(url);
  if (blobRegistry.has(key)) {
    const blob = blobRegistry.get(key);
    return new Response(await blob.arrayBuffer(), {
      status: 200,
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    });
  }
  return realFetch(url, opts);
};

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GLB = path.join(ROOT, 'out', 'textured.glb');
const buf = fs.readFileSync(GLB);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const loader = new GLTFLoader();
const gltf = await Promise.race([
  new Promise((res, rej) => loader.parse(ab, '', res, rej)),
  new Promise((_, rej) => setTimeout(() => rej(new Error('таймаут 10 с')), 10000)),
]);

const checks = [];
const check = (name, actual, expected) =>
  checks.push({ name, expected, actual, ok: JSON.stringify(actual) === JSON.stringify(expected) });

const mesh = gltf.scene.getObjectByName('TexturedPlane');
const map = mesh.material.map;

check('меш найден по имени', mesh !== undefined && mesh !== null, true);
check('вершин в плоскости', mesh.geometry.attributes.position.count, 4);
check('треугольников', mesh.geometry.index.count / 3, 2);
check('UV есть', mesh.geometry.attributes.uv !== undefined, true);
check('тип материала', mesh.material.type, 'MeshStandardMaterial');
check('имя материала', mesh.material.name, 'CheckerMaterial');
check('roughness', mesh.material.roughness, 0.5);
check('карта цвета присутствует', map !== null && map !== undefined, true);
check('размер картинки', map ? [map.image.width, map.image.height] : null, [64, 64]);
check('цветовое пространство карты', map ? map.colorSpace : null, 'srgb');

// Пиксель декодированной текстуры — уже не «картинка загрузилась», а проверка
// содержимого: шахматка задавалась цветами (220,200,120) и (40,60,90).
const d = map.image.data;
const at = (x, y) => [d[(y * 64 + x) * 4], d[(y * 64 + x) * 4 + 1], d[(y * 64 + x) * 4 + 2]];
check('пиксель (2,2) — светлая клетка', at(2, 2), [220, 200, 120]);
check('пиксель (10,2) — тёмная клетка', at(10, 2), [40, 60, 90]);

const failed = checks.filter((c) => !c.ok);
console.log(
  JSON.stringify({ glbBytes: buf.length, checks: checks.length, failed: failed.length, failures: failed }, null, 2)
);
process.exit(failed.length === 0 ? 0 : 1);
```

---

## 11. Открытые вопросы

- Детерминированность кадра **на реальном GPU** между прогонами не измерялась (эталонный контур
  программный, для схемы не требуется).
- Минимальность набора заглушек для GLB с текстурой не доказана: необходимость `self`
  и `ProgressEvent` измерена ступенчато, остальные три элемента вводились по факту ошибки.
- Способ измерения памяти **на стороне GPU** в этом контуре не найден — считать по своим счётчикам.
- Инструментарий сборки (esbuild против vite и т. п.) — решение этапа 2; здесь взят минимальный.
- Судьба стенда этапа 0: пока существует только листингами §10 (см. §9, последний абзац).

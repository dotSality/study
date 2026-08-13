// Сверочный скрипт главы. Проверяет структуру главы по Плану и — главное — два
// свойства её листингов:
//
//   ПОДЛИННОСТЬ: каждый листинг является дословным непрерывным фрагментом
//   реального файла проекта. Это скрипт умел с главы 1.
//
//   ДОСТАТОЧНОСТЬ: какая доля кода главы попала в текст и есть ли в каждом
//   параграфе с кодом хотя бы одна законченная единица — функция, класс,
//   интерфейс или объект целиком. Добавлено 2026-08-13 по долгу главы 7:
//   отчёт «0 проблем при N листингах» мерой качества не является, и именно
//   поэтому прежний скрипт не отличил главу 6 от главы 7.
//
//   ОПОРА: показанное опирается только на показанное. Каждое имя, на которое
//   листинг ссылается и которое объявлено верхним уровнем в файле проекта,
//   обязано быть показано объявлением в этой главе или в любой предыдущей;
//   всё остальное (стандартная библиотека, three, локальные имена) проверку
//   не касается. Добавлено 2026-08-13: две первые проверки вместе отчитались
//   «0 проблем» по главе 7, где непоказанными оставались readOne, AccessorView,
//   pad, fourCC, asArray и GENERATOR — то есть читатель не собрал бы модуль.
//
// Запуск: node harness/verify-chapter.mjs <номер главы> <файл главы> <корень проекта>
import fs from 'node:fs';
import path from 'node:path';

const CHAPTER_NO = Number(process.argv[2]);
const CHAPTER = process.argv[3];
const ROOT = process.argv[4];

const problems = [];
const note = (what) => problems.push(what);

/**
 * Главы с неподвижными листингами (решение владельца 2026-08-13). Код глав 1–4
 * жил в каталогах, отменённых решением 2026-08-02, а нынешний `code/` несёт
 * состояние после главы 7, где те же файлы переписаны: сверять их подлинность
 * можно было бы только развернув исторические состояния из коммитов 163d732,
 * fc623d7, 290dc18, 7c32c3f. Владелец решил этого не делать — листинги закрытых
 * глав признаны неподвижными. Молчать об этом нельзя (ровно такое молчание и
 * породило долг главы 7), поэтому скрипт печатает, сколько листингов он не
 * сверял, и не выдаёт это за успех.
 */
const FROZEN_CHAPTERS = new Set([1, 2, 3, 4]);
const FROZEN = FROZEN_CHAPTERS.has(CHAPTER_NO);
let unverified = 0;

const text = fs.readFileSync(CHAPTER, 'utf8').replace(/\r\n/g, '\n');
const lines = text.split('\n');

// ——— 1. Баланс ограждений и сбор листингов ———

const blocks = [];
let open = null;
for (let i = 0; i < lines.length; i += 1) {
  const match = /^```([A-Za-z0-9+-]*)\s*$/.exec(lines[i]);
  if (open === null) {
    if (match) open = { lang: match[1], start: i + 1, body: [] };
    continue;
  }
  if (/^```\s*$/.test(lines[i])) {
    blocks.push({ lang: open.lang, start: open.start, end: i + 1, body: open.body });
    open = null;
    continue;
  }
  open.body.push(lines[i]);
}
if (open !== null) note(`незакрытое ограждение со строки ${open.start}`);

// Главы 1 и 2 помечают код короткими именами `ts` и `js`, главы с третьей —
// полными. Прежний скрипт знал только полные и потому молча сверял в первых
// двух главах ноль листингов; найдено 2026-08-13 при работе над долгом главы 7.
const CODE_LANGS = new Set(['typescript', 'javascript', 'ts', 'js']);
const listings = blocks.filter((b) => CODE_LANGS.has(b.lang));

// ——— 2. Листинги как дословные фрагменты файлов ———

const SEARCH_DIRS = ['src', 'tests', 'harness', 'web'];
const EXTRA_DIRS = [
  path.join('node_modules', 'three', 'src'),
  path.join('node_modules', 'three', 'examples', 'jsm'),
];
const KEEP = /\.(ts|mjs|js|html|json|tex|mat|glsl)$/;
/**
 * Собранные страницей бандлы исходником книги не являются: внутрь них esbuild
 * складывает и весь three, поэтому совпадение листинга с бандлом не доказывает
 * ничего, а объявления three попадают в имена проекта. Они и в `.gitignore`.
 */
const BUILT = /[\\/]web[\\/][^\\/]*bundle[^\\/]*\.js$/;

function collect(dir, into) {
  if (!fs.existsSync(dir)) return into;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, into);
    else if (KEEP.test(entry.name)) into.push(full);
  }
  return into;
}

const ownFiles = [];
for (const dir of SEARCH_DIRS) collect(path.join(ROOT, dir), ownFiles);
ownFiles.splice(0, ownFiles.length, ...ownFiles.filter((file) => !BUILT.test(file)));
const foreignFiles = [];
for (const dir of EXTRA_DIRS) collect(path.join(ROOT, dir), foreignFiles);

// Рабочий проект в репозиторий не попадает (решение владельца 2026-08-13), и на
// чистом клоне его нет. Молча сверить листинги «ни с чем» нельзя: получился бы
// поток «листинг не найден», выглядящий дефектом книги. Отказ отдельным кодом
// возврата: 1 — у главы есть проблемы, 2 — проверять нечем.
if (ownFiles.length === 0) {
  console.log(`глава ${CHAPTER_NO}: ${CHAPTER}`);
  console.log(
    `рабочий проект не найден по пути «${ROOT}» — сверять листинги не с чем. ` +
      'Каталог `code/` в репозиторий не попадает; как его воссоздать — `code/README.md`.',
  );
  process.exit(2);
}

const contents = new Map();
for (const file of [...ownFiles, ...foreignFiles]) {
  try {
    contents.set(file, fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  } catch {
    /* нечитаемое пропускаем: листингом оно быть не может */
  }
}
const isOwn = new Set(ownFiles);

/** Строки файла, закрытые листингами: ключ — путь, значение — множество номеров. */
const coveredLines = new Map();

listings.forEach((listing, index) => {
  const fragment = listing.body.join('\n');
  const found = [...contents.entries()].filter(([, body]) => body.includes(fragment));
  if (found.length === 0) {
    if (FROZEN) {
      unverified += 1;
      return;
    }
    note(
      `листинг #${index + 1} (строки ${listing.start}-${listing.end}) ` +
        'не найден дословным непрерывным фрагментом ни в одном файле',
    );
    return;
  }
  // Листинг приписывается своему файлу; чужой код (three) в покрытие не идёт.
  const own = found.find(([file]) => isOwn.has(file));
  listing.file = own === undefined ? found[0][0] : own[0];
  listing.own = own !== undefined;
  if (own === undefined) return;

  const [file, body] = own;
  const at = body.indexOf(fragment);
  const firstLine = body.slice(0, at).split('\n').length;
  let set = coveredLines.get(file);
  if (set === undefined) {
    set = new Set();
    coveredLines.set(file, set);
  }
  // Пустые строки не считаются ни показанными, ни существующими: иначе доля
  // зависела бы от того, как густо в файле расставлены отбивки.
  for (let i = 0; i < listing.body.length; i += 1) {
    if (listing.body[i].trim() !== '') set.add(firstLine + i);
  }
});

// ——— 3. Структура: части, параграфы, обязательные элементы ———

const ELEMENTS = [
  '**Определения.**',
  '**Интуиция.**',
  '**Разобранные примеры.**',
  '**Связь с практикой.**',
  '**Типичные ошибки и подводные камни.**',
  '**Источники:**',
];

const partHeads = [...text.matchAll(/^## Часть (\d+)\.(\d+)\. (.+)$/gm)];
const paraHeads = [...text.matchAll(/^### §(\d+)\.(\d+)\.(\d+)\. (.+)$/gm)];

if (partHeads.length === 0) note('в главе нет ни одной части');
for (const head of partHeads) {
  if (Number(head[1]) !== CHAPTER_NO) note(`часть «${head[3]}» объявлена от чужой главы ${head[1]}`);
}

/** Текст параграфа — от его заголовка до следующего заголовка любого уровня. */
function sliceAfter(index, from) {
  const rest = text.slice(index + from.length);
  const next = rest.search(/^#{2,4} /m);
  return next === -1 ? rest : rest.slice(0, next);
}

for (const head of paraHeads) {
  const body = sliceAfter(head.index, head[0]);
  const name = `§${head[1]}.${head[2]}.${head[3]}`;
  for (const element of ELEMENTS) {
    if (!body.includes(element)) note(`${name}: нет элемента ${element}`);
  }
  const examples = (body.match(/^\*Пример \d+\./gm) ?? []).length;
  if (examples < 2) note(`${name}: разобранных примеров ${examples}, нужно не меньше двух`);
}

// ——— 4. Задания: сплошная нумерация и 6–15 на часть ———

const taskIds = [...text.matchAll(/\*\*Г(\d+)\.Ч(\d+)\.З(\d+)\.\*\*/g)];
const byPart = new Map();
for (const id of taskIds) {
  if (Number(id[1]) !== CHAPTER_NO) note(`задание Г${id[1]}.Ч${id[2]}.З${id[3]} от чужой главы`);
  const key = Number(id[2]);
  if (!byPart.has(key)) byPart.set(key, []);
  byPart.get(key).push(Number(id[3]));
}
for (const [part, numbers] of [...byPart.entries()].sort((a, b) => a[0] - b[0])) {
  if (numbers.length < 6 || numbers.length > 15) {
    note(`часть ${CHAPTER_NO}.${part}: заданий ${numbers.length}, нужно 6–15`);
  }
  for (let i = 0; i < numbers.length; i += 1) {
    if (numbers[i] !== i + 1) {
      note(`часть ${CHAPTER_NO}.${part}: нумерация заданий рвётся на ${numbers[i]} (ожидалось ${i + 1})`);
      break;
    }
  }
}
if (byPart.size !== partHeads.length) {
  note(`частей ${partHeads.length}, а блоков заданий ${byPart.size}`);
}

// ——— 5. Блоки «Источники части N» ———

for (const head of partHeads) {
  const marker = `**Источники части ${head[1]}.${head[2]}:**`;
  if (!text.includes(marker)) note(`нет блока ${marker}`);
}

// ——— 6. Журнал проектных решений: формат Р{глава}.{номер} и шесть строк ———

const DECISION_LINES = [
  '**Выбрано:**',
  '**Отвергнуто:**',
  '**Почему:**',
  '**Цена:**',
  '**Когда выиграл бы отвергнутый вариант:**',
  '**Проверка:**',
];

const decisions = [...text.matchAll(/^#### Р(\d+)\.(\d+) — (.+)$/gm)];
if (decisions.length === 0) note('в главе нет ни одного решения журнала');
decisions.forEach((decision, i) => {
  const name = `Р${decision[1]}.${decision[2]}`;
  if (Number(decision[1]) !== CHAPTER_NO) note(`${name}: решение от чужой главы`);
  if (Number(decision[2]) !== i + 1) note(`${name}: нумерация решений рвётся (ожидалось ${i + 1})`);
  const body = sliceAfter(decision.index, decision[0]);
  for (const line of DECISION_LINES) {
    if (!body.includes(line)) note(`${name}: нет строки ${line}`);
  }
});

// ——— 7. Белый список символов ———

const ALLOWED = new Set([
  ...'§—–…«»×→←↑↓≈≤≥±°•✓№⌀',
  ...'┌┐└┘├┤┬┴┼─│►◄▲▼█▄▀',
  // Знаки схем, которыми главы 3 и 4 рисуют графы и деревья. Добавлены
  // 2026-08-13: скрипт впервые дошёл до этих глав и нашёл их вне списка.
  ...'━╲╱●○◆◇',
  // Подстрочная «i» (U+1D62) живёт вне блока U+2070…U+209F, хотя по смыслу
  // относится к нему: глава 4 пишет ею индексы.
  'ᵢ',
  ...'✔✖ℹ★☆',
  // Символ замены допущен намеренно: §6.2.3 показывает им, во что превращается
  // битый байт у нестрогого декодера.
  '�',
]);
const suspicious = new Map();
for (const ch of text) {
  const code = ch.codePointAt(0);
  const cyrillic = code >= 0x0400 && code <= 0x04ff;
  const latinOrAscii = code < 0x0180;
  // Надстрочные и подстрочные знаки (U+2070…U+209F) разрешены с главы 7:
  // книга входит в блок рендера, где математическая запись вида F0 и M^-1
  // встречается постоянно, и коверкать её ради узкого списка незачем.
  const scripts = code >= 0x2070 && code <= 0x209f;
  // Греческие буквы (Δ, π) разрешены по тому же доводу, что и надстрочные знаки:
  // книга о графике, и запись вида «Δt» неизбежна. Глава 2 пользуется ими с
  // самого начала — обнаружено 2026-08-13, когда скрипт впервые прочитал её.
  const greek = code >= 0x0370 && code <= 0x03ff;
  // Знак ударения над русской гласной: он же комбинирующий U+0301.
  const stress = code === 0x0301;
  if (cyrillic || latinOrAscii || scripts || greek || stress || ALLOWED.has(ch)) continue;
  suspicious.set(ch, (suspicious.get(ch) ?? 0) + 1);
}
for (const [ch, count] of suspicious) {
  note(`символ вне белого списка: «${ch}» (U+${ch.codePointAt(0).toString(16).toUpperCase()}), ${count} раз`);
}

// ——— 8. Версия three объявлена ———

if (!/three 0\.\d+\.\d+/.test(text)) note('в главе не объявлена версия three');

// ——— 9. Достаточность: законченная единица на каждый параграф с кодом ———

/**
 * Скобочный баланс в обход строк и комментариев. Нужен затем, что законченная
 * единица — это не «длинный листинг», а фрагмент, который закрывает все скобки,
 * которые открыл: такой можно набрать в файл и он соберётся.
 */
function balanced(source) {
  const pairs = { '}': '{', ')': '(', ']': '[' };
  const stack = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ')' || ch === ']') {
      if (stack.pop() !== pairs[ch]) return false;
    }
    i += 1;
  }
  return stack.length === 0;
}

const DECLARATION =
  /^(export\s+)?(default\s+)?(async\s+)?(function|class|const|let|var|interface|type)\s+[\w$]/;
/** Метод объекта или класса, показанный целиком: `finalize(value, context) {`. */
const METHOD = /^(async\s+)?[\w$]+\s*\([^)]*\)\s*[:{]/;
/** Слова, которые выглядят как метод, но методом не являются. */
const NOT_A_HEAD = new Set(['for', 'if', 'while', 'switch', 'catch', 'return', 'else', 'do']);

/**
 * Законченная единица: объявление или метод целиком, со всеми закрытыми
 * скобками. Отступ не важен — вложенная функция, показанная от заголовка до
 * последней скобки, законченна ровно так же, как объявление верхнего уровня.
 * А вот кусок из середины единицы скобки не сводит, и это ловится балансом.
 */
function isCompleteUnit(listing) {
  const body = listing.body;
  const first = body.find((line) => line.trim() !== '');
  if (first === undefined) return false;
  const head = first.trim();
  const word = /^[\w$]+/.exec(head)?.[0] ?? '';
  if (NOT_A_HEAD.has(word)) return false;
  const looksLikeUnit = DECLARATION.test(head) || METHOD.test(head) || /^(test|describe)\(/.test(head);
  if (!looksLikeUnit) return false;
  const source = body.join('\n');
  // Единица — это функция или объект, а не число: `const STRIDE = 8;` объявление
  // законченное, но набирать читателю в нём нечего.
  if (!source.includes('{')) return false;
  return balanced(source);
}

/**
 * Порог доли законченных единиц. Взят не с потолка: у главы 6, на которую долг
 * главы 7 ссылается как на стандарт, законченных единиц больше половины
 * листингов. Треть — это стандарт с запасом вниз.
 *
 * Проверка идёт по частям, а не по параграфам, и это тоже измерение, а не вкус:
 * правило «единица в каждом параграфе» было записано в долге, но на самой главе
 * 6 оно падает в двух теоретических параграфах, где показаны только ассерты.
 * Требовать там законченную единицу — значит требовать выдуманного кода.
 */
const UNIT_SHARE = 1 / 3;

const parts = partHeads.map((head, i) => {
  const startLine = text.slice(0, head.index).split('\n').length;
  const endLine =
    i + 1 < partHeads.length ? text.slice(0, partHeads[i + 1].index).split('\n').length : lines.length;
  return { name: `часть ${head[1]}.${head[2]}`, startLine, endLine, listings: [] };
});

for (const listing of listings) {
  const owner = parts.find((p) => listing.start >= p.startLine && listing.start < p.endLine);
  if (owner !== undefined) owner.listings.push(listing);
}

let unitCount = 0;
for (const listing of listings) if (isCompleteUnit(listing)) unitCount += 1;

for (const part of parts) {
  if (part.listings.length === 0) continue;
  if (!part.listings.some((listing) => isCompleteUnit(listing))) {
    note(
      `${part.name}: ${part.listings.length} листингов кода и ни одной законченной единицы — ` +
        'читателю нечего набрать в файл',
    );
  }
}

if (listings.length > 0 && unitCount / listings.length < UNIT_SHARE) {
  note(
    `законченных единиц ${unitCount} из ${listings.length} листингов ` +
      `(${((unitCount / listings.length) * 100).toFixed(0)} %), нужно не меньше трети: ` +
      'глава показывает выдержки, а не код',
  );
}

// ——— 10. Достаточность: доля кода главы, попавшая в текст ———
//
// Порога у покрытия нет, и это решено измерением, а не вкусом (2026-08-13).
// Замеренный разброс по закрытым главам — от 10,7 % (глава 5, контрольная
// точка: она собирает уже показанное, и показывать ей нечего) до 81 % (глава 1,
// где кода всего ничего). Любой порог, отсекающий главу 7 до правки (16,1 %),
// отсекает и главу 5, которая правилам достаточности не противоречит. Долю
// печатаем как справку; бинарные критерии — единица в каждой части, треть
// законченных единиц и опора из раздела 11.

let codeLines = 0;
for (const listing of listings) codeLines += listing.body.length;

const coverage = [];
let totalOwn = 0;
let totalCovered = 0;
for (const [file, covered] of [...coveredLines.entries()].sort()) {
  const total = contents.get(file).split('\n').filter((line) => line.trim() !== '').length;
  const shown = covered.size;
  totalOwn += total;
  totalCovered += shown;
  coverage.push({ file: path.relative(ROOT, file), total, shown });
}

// ——— 11. Опора: показанное опирается только на показанное ———

/** Объявление с именем: `export function readGlb(`, `const GLB_MAGIC =`, `interface GlbFile {`. */
const DECLARATION_NAME =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([\w$]+)/;

/**
 * Объявления верхнего уровня файла вместе с их протяжённостью: от строки
 * объявления до строки, где сходятся скобки. Протяжённость нужна затем, что
 * длинную функцию глава законно показывает по частям — и тогда «показанной»
 * её делает не один листинг, а покрытие всех её строк.
 */
function topLevelDeclarations(body) {
  const found = [];
  const fileLines = body.split('\n');
  for (let i = 0; i < fileLines.length; i += 1) {
    if (fileLines[i] !== fileLines[i].trimStart()) continue;
    const match = DECLARATION_NAME.exec(fileLines[i]);
    if (match === null) continue;
    let chunk = '';
    for (let j = i; j < fileLines.length; j += 1) {
      chunk += (j > i ? '\n' : '') + fileLines[j];
      if (balanced(chunk)) {
        found.push({ name: match[1], from: i + 1, to: j + 1, lines: fileLines });
        break;
      }
    }
  }
  return found;
}

/**
 * Имена верхнего уровня — по файлам, и проверяется листинг только против
 * **своего** файла. Довод: то, что приходит из другого модуля, приходит по
 * `import`, и сама строка импорта в листинге видна; а вот сосед по файлу
 * невидим — именно так в главе 7 и остались `readOne`, `fourCC`, `pad`.
 * Заодно это снимает ложные срабатывания на совпадении имён: локальная `view`
 * в одном файле и `const view` в другом — разные имена, а не опора.
 */
const declsByFile = new Map();
for (const file of ownFiles) {
  const body = contents.get(file);
  if (body === undefined) continue;
  const map = new Map();
  for (const decl of topLevelDeclarations(body)) if (!map.has(decl.name)) map.set(decl.name, decl);
  declsByFile.set(file, map);
}

/** Ключевые слова языка: `from` в импорте — не ссылка на `const from` в файле. */
const KEYWORDS = new Set([
  'from', 'of', 'as', 'in', 'new', 'this', 'super', 'typeof', 'keyof', 'instanceof', 'void',
  'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'function', 'class', 'const', 'let', 'var', 'interface', 'type', 'enum', 'import', 'export',
  'default', 'extends', 'implements', 'async', 'await', 'yield', 'try', 'catch', 'finally',
  'throw', 'delete', 'true', 'false', 'null', 'undefined', 'readonly', 'satisfies', 'is',
  'asserts', 'declare', 'static', 'get', 'set', 'public', 'private', 'protected', 'abstract',
  'infer', 'never', 'unknown', 'any', 'string', 'number', 'boolean', 'object', 'symbol',
]);

/**
 * Имена, объявления которых показаны целиком в листинге: от строки объявления
 * до места, где сходятся скобки. Кусок объявления, оборванный на середине,
 * показанным не считается — набрать его читатель не может. Требование нулевого
 * отступа отделяет объявление верхнего уровня от одноимённой локальной
 * переменной внутри показанной функции.
 */
function shownDeclarations(body) {
  const names = new Set();
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== body[i].trimStart()) continue;
    const match = DECLARATION_NAME.exec(body[i]);
    if (match === null) continue;
    let chunk = '';
    for (let j = i; j < body.length; j += 1) {
      chunk += (j > i ? '\n' : '') + body[j];
      if (balanced(chunk)) {
        names.add(match[1]);
        break;
      }
    }
  }
  return names;
}

/**
 * Текст без строковых литералов и комментариев: имя, встреченное в сообщении об
 * ошибке, ссылкой на код не является. Подстановки `${…}` в шаблонной строке —
 * наоборот, настоящий код, и их содержимое сохраняется: именно так `fourCC`
 * вызывается в `readGlb`.
 */
function stripLiterals(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      out += ' ';
      continue;
    }
    if (ch === '`') {
      i += 1;
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          i += 2;
          let depth = 1;
          while (i < source.length) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') {
              depth -= 1;
              if (depth === 0) break;
            }
            out += source[i];
            i += 1;
          }
          i += 1;
          out += ' ';
          continue;
        }
        i += 1;
      }
      i += 1;
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Имена, на которые листинг ссылается: обращения к полям (`x.foo`) не в счёт. */
function usedNames(listing) {
  const source = stripLiterals(listing.body.join('\n'));
  const used = new Set();
  for (const match of source.matchAll(/[A-Za-z_$][\w$]*/g)) {
    if (KEYWORDS.has(match[0])) continue;
    const before = source.slice(0, match.index).replace(/\s+$/, '');
    if (before.endsWith('.')) continue;
    used.add(match[0]);
  }
  // Имя, объявленное в самом листинге, — определение, а не опора на чужое.
  for (const line of listing.body) {
    const match = DECLARATION_NAME.exec(line.trim());
    if (match !== null) used.delete(match[1]);
  }
  return used;
}

/**
 * Показанным считается объявление, попавшее в текст этой главы или любой
 * предыдущей: движок читатель набирает по порядку, и имя из главы 6 у него уже
 * есть. Поэтому проверка читает все главы 1…N, а не одну.
 */
const shownSomewhere = new Set();
const chapterDir = path.dirname(path.resolve(CHAPTER));
for (const entry of fs.readdirSync(chapterDir)) {
  const number = /^(\d+)-.*\.md$/.exec(entry);
  if (number === null || Number(number[1]) > CHAPTER_NO) continue;
  const body = fs.readFileSync(path.join(chapterDir, entry), 'utf8').replace(/\r\n/g, '\n').split('\n');
  let block = null;
  for (const line of body) {
    const fence = /^```([A-Za-z0-9+-]*)\s*$/.exec(line);
    if (block === null) {
      if (fence && CODE_LANGS.has(fence[1])) block = [];
      continue;
    }
    if (/^```\s*$/.test(line)) {
      for (const name of shownDeclarations(block)) shownSomewhere.add(name);
      block = null;
      continue;
    }
    block.push(line);
  }
}

/**
 * Объявление показано и тогда, когда оно собрано из нескольких листингов этой
 * главы: длинную функцию книга законно разбирает по кускам, и читатель, набрав
 * все куски, получит её целиком. Пустые строки не в счёт — по той же причине,
 * по какой они не считаются в покрытии.
 */
function missingLines(file, decl) {
  const covered = coveredLines.get(file) ?? new Set();
  const gaps = [];
  for (let line = decl.from; line <= decl.to; line += 1) {
    if (decl.lines[line - 1].trim() === '' || covered.has(line)) continue;
    const last = gaps[gaps.length - 1];
    if (last !== undefined && last.to === line - 1) last.to = line;
    else gaps.push({ from: line, to: line });
  }
  return gaps;
}

/** Имя → первый листинг главы, который на него опирается. */
const leaning = new Map();
for (const listing of listings) {
  if (listing.own !== true) continue;
  const decls = declsByFile.get(listing.file);
  if (decls === undefined) continue;
  for (const name of usedNames(listing)) {
    const decl = decls.get(name);
    if (decl === undefined || shownSomewhere.has(name)) continue;
    const gaps = missingLines(listing.file, decl);
    if (gaps.length === 0) continue;
    if (!leaning.has(name)) leaning.set(name, { listing, file: listing.file, decl, gaps });
  }
}

// В главе с неподвижными листингами опора не проверяется по той же причине, по
// какой не проверяется подлинность: сравнивать пришлось бы с кодом, который эти
// главы уже не описывают. Печатается это прямо, а не умалчивается.
for (const [name, where] of FROZEN ? [] : leaning) {
  const whole = where.gaps.length === 1 && where.gaps[0].from === where.decl.from;
  const gaps = where.gaps.map((gap) => (gap.from === gap.to ? `${gap.from}` : `${gap.from}-${gap.to}`));
  note(
    `листинг на строках ${where.listing.start}-${where.listing.end} опирается на «${name}» ` +
      `(${path.relative(ROOT, where.file)}, строки ${where.decl.from}-${where.decl.to}), ` +
      (whole
        ? 'но объявление не показано вовсе'
        : `но не показаны строки ${gaps.join(', ')}`),
  );
}

// ——— Отчёт ———

console.log(`глава ${CHAPTER_NO}: ${CHAPTER}`);
console.log(`частей ${partHeads.length}, параграфов ${paraHeads.length}, заданий ${taskIds.length}, решений ${decisions.length}`);
console.log(`листингов кода сверено ${listings.length}, ограждений всего ${blocks.length}`);
console.log(`строк кода в тексте ${codeLines}, средний листинг ${(codeLines / (listings.length || 1)).toFixed(1)}`);
console.log(`законченных единиц ${unitCount} из ${listings.length} листингов`);
console.log(
  `покрытие: ${totalCovered} из ${totalOwn} значащих строк в ${coverage.length} файлах` +
    (totalOwn === 0 ? '' : ` (${((totalCovered / totalOwn) * 100).toFixed(1)} %)`),
);
if (FROZEN) {
  console.log(
    `глава с неподвижными листингами (решение владельца 2026-08-13): подлинность не сверялась ` +
      `у ${unverified} листингов из ${listings.length}, опора не проверялась вовсе`,
  );
} else {
  console.log(`имён проекта, на которые опираются листинги: ${leaning.size} не показано`);
}
for (const row of coverage) {
  console.log(`  · ${row.file}: ${row.shown} из ${row.total}`);
}
if (problems.length === 0) {
  console.log('проблем: 0');
} else {
  console.log(`проблем: ${problems.length}`);
  for (const problem of problems) console.log(`  · ${problem}`);
  process.exitCode = 1;
}

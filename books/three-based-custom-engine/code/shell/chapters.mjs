// Реестр состояний движка. Одна запись — одно состояние, на котором проверялась глава.
// Порядок записей = порядок кнопок в шапке стенда.
export const CHAPTERS = [
  {
    id: '01-engine-scope',
    number: 1,
    title: 'Движок и его границы',
    demo: 'Первый кадр: пустая сцена 640×360, один render()',
  },
  {
    id: '02-frame-loop',
    number: 2,
    title: 'Цикл кадра и время',
    demo: 'Фиксированный шаг с аккумулятором, фазы кадра, пул',
  },
];

export const LATEST = CHAPTERS[CHAPTERS.length - 1];

export function chapterById(id) {
  return CHAPTERS.find((chapter) => chapter.id === id) ?? LATEST;
}

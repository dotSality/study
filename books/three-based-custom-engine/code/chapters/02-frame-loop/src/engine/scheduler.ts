// Планировщик фаз кадра: кто получает управление, в какой фазе и в каком порядке.

/** Порядок фаз кадра. Он один на весь движок и не переопределяется. */
export const PHASES = ['input', 'fixed', 'update', 'render'] as const;

export type Phase = (typeof PHASES)[number];

/** Что подсистема знает о текущем кадре. Только чтение: объект один на всё время работы. */
export interface FrameInfo {
  /** Номер кадра с запуска цикла, начиная с 1. */
  readonly frame: number;
  readonly phase: Phase;
  /** Длительность, за которую отвечает эта фаза, мс. В фазе fixed — всегда шаг. */
  readonly deltaMs: number;
  /** Доля шага для интерполяции при отрисовке, [0, 1). */
  readonly alpha: number;
  /** Игровое время на конец кадра, мс. */
  readonly gameMs: number;
}

/** Тот же объект глазами цикла: цикл его заполняет, подсистемы — только читают. */
export interface MutableFrameInfo {
  frame: number;
  phase: Phase;
  deltaMs: number;
  alpha: number;
  gameMs: number;
}

export interface System {
  readonly name: string;
  readonly phase: Phase;
  /** Меньше — раньше внутри фазы; при равенстве работает порядок регистрации. */
  readonly order?: number;
  update(frame: FrameInfo): void;
}

export interface Scheduler {
  add(system: System): void;
  remove(name: string): boolean;
  systems(phase: Phase): readonly System[];
  run(phase: Phase, frame: FrameInfo): void;
}

export function createScheduler(): Scheduler {
  const lists: Record<Phase, System[]> = {
    input: [],
    fixed: [],
    update: [],
    render: [],
  };

  return {
    add(system) {
      const list = lists[system.phase];
      list.push(system);
      // Сортировка устойчива, поэтому подсистемы с одинаковым order
      // остаются в порядке регистрации.
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    },

    remove(name) {
      for (const phase of PHASES) {
        const list = lists[phase];
        const index = list.findIndex((system) => system.name === name);
        if (index >= 0) {
          list.splice(index, 1);
          return true;
        }
      }
      return false;
    },

    systems(phase) {
      return lists[phase];
    },

    run(phase, frame) {
      const list = lists[phase];
      // Обычный цикл по индексу, а не for…of: в горячем коде не нужен даже итератор.
      for (let i = 0; i < list.length; i += 1) {
        list[i].update(frame);
      }
    },
  };
}

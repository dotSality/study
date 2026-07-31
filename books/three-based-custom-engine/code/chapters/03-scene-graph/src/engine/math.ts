import { Matrix4, Quaternion, Vector3 } from 'three';

// Соглашения движка. Меняются только вместе с этим файлом, потому что от них
// зависят и граф сцены, и камера, и любой код, читающий матрицу по элементам.
export const HANDEDNESS = 'right';
export const UP_AXIS = 'y';
export const FORWARD_AXIS = '-z';

// Матрица 4x4 хранится одним массивом из 16 чисел, идущих по столбцам.
export const MATRIX_ELEMENT_COUNT = 16;
export const MATRIX_SIZE = 4;

/**
 * Индекс элемента (row, column) в массиве elements.
 * Столбцовая раскладка: сначала весь нулевой столбец, потом первый и так далее.
 */
export function elementIndex(row: number, column: number): number {
  return column * MATRIX_SIZE + row;
}

/**
 * Столбец матрицы как вектор. Первые три столбца преобразования — направления
 * локальных осей в объемлющем пространстве, четвёртый — положение начала координат.
 */
export function readColumn(matrix: Matrix4, column: number, out: Vector3): Vector3 {
  const e = matrix.elements;
  const base = column * MATRIX_SIZE;
  return out.set(e[base], e[base + 1], e[base + 2]);
}

/** Направления локальных осей объекта в объемлющем пространстве. */
export function readAxisX(matrix: Matrix4, out: Vector3): Vector3 {
  return readColumn(matrix, 0, out);
}

export function readAxisY(matrix: Matrix4, out: Vector3): Vector3 {
  return readColumn(matrix, 1, out);
}

export function readAxisZ(matrix: Matrix4, out: Vector3): Vector3 {
  return readColumn(matrix, 2, out);
}

/** Положение локального начала координат в объемлющем пространстве. */
export function readOrigin(matrix: Matrix4, out: Vector3): Vector3 {
  return readColumn(matrix, 3, out);
}

/**
 * Точка: подразумеваемая координата w равна единице, поэтому перенос действует.
 * Аргумент point и out могут быть одним и тем же вектором.
 */
export function applyToPoint(matrix: Matrix4, point: Vector3, out: Vector3): Vector3 {
  const e = matrix.elements;
  const x = point.x;
  const y = point.y;
  const z = point.z;
  return out.set(
    e[0] * x + e[4] * y + e[8] * z + e[12],
    e[1] * x + e[5] * y + e[9] * z + e[13],
    e[2] * x + e[6] * y + e[10] * z + e[14],
  );
}

/**
 * Направление: подразумеваемая координата w равна нулю, поэтому четвёртый
 * столбец не участвует и перенос на результат не влияет.
 */
export function applyToDirection(matrix: Matrix4, direction: Vector3, out: Vector3): Vector3 {
  const e = matrix.elements;
  const x = direction.x;
  const y = direction.y;
  const z = direction.z;
  return out.set(
    e[0] * x + e[4] * y + e[8] * z,
    e[1] * x + e[5] * y + e[9] * z,
    e[2] * x + e[6] * y + e[10] * z,
  );
}

/**
 * Локальная матрица из положения, поворота и масштаба.
 * Порядок применения к вектору — сначала масштаб, потом поворот, потом перенос.
 */
export function composeLocal(
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
  out: Matrix4,
): Matrix4 {
  return out.compose(position, rotation, scale);
}

/**
 * Мировая матрица узла: сначала действует локальная, затем родительская.
 * Порядок множителей обратен порядку применения.
 */
export function composeWorld(parentWorld: Matrix4, local: Matrix4, out: Matrix4): Matrix4 {
  return out.multiplyMatrices(parentWorld, local);
}

export { Matrix4, Quaternion, Vector3 };

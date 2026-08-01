import { Euler, Quaternion, Vector3 } from 'three';

/**
 * Порядок осей для углов Эйлера в движке.
 * YXZ означает, что первым применяется поворот вокруг Z, затем вокруг X и
 * последним — вокруг Y, поэтому рыскание остаётся поворотом вокруг мировой
 * вертикали даже после наклона. Порядок по умолчанию в three — XYZ.
 */
export const ENGINE_EULER_ORDER = 'YXZ';

const _euler = new Euler(0, 0, 0, ENGINE_EULER_ORDER);
const _quaternion = new Quaternion();
const _axis = new Vector3();

/** Кватернион поворота на угол angle вокруг единичной оси. */
export function fromAxisAngle(
  axisX: number,
  axisY: number,
  axisZ: number,
  angle: number,
  out: Quaternion,
): Quaternion {
  _axis.set(axisX, axisY, axisZ).normalize();
  return out.setFromAxisAngle(_axis, angle);
}

/**
 * Кватернион из рыскания, тангажа и крена в радианах.
 * Углы всегда трактуются в порядке ENGINE_EULER_ORDER.
 */
export function fromYawPitchRoll(
  yaw: number,
  pitch: number,
  roll: number,
  out: Quaternion,
): Quaternion {
  _euler.set(pitch, yaw, roll, ENGINE_EULER_ORDER);
  return out.setFromEuler(_euler);
}

/** Рыскание, тангаж и крен из кватерниона — обратная операция к fromYawPitchRoll. */
export function toYawPitchRoll(rotation: Quaternion, out: Vector3): Vector3 {
  _euler.setFromQuaternion(rotation, ENGINE_EULER_ORDER);
  return out.set(_euler.y, _euler.x, _euler.z);
}

/**
 * Композиция поворотов: сначала действует first, затем second.
 * Порядок множителей обратен порядку применения, как и у матриц.
 */
export function concat(second: Quaternion, first: Quaternion, out: Quaternion): Quaternion {
  return out.multiplyQuaternions(second, first);
}

/** Поворот, обратный данному. Для единичного кватерниона это сопряжение. */
export function invert(rotation: Quaternion, out: Quaternion): Quaternion {
  return out.copy(rotation).invert();
}

/**
 * Интерполяция поворотов по кратчайшей дуге с постоянной угловой скоростью.
 * Аргументы не изменяются.
 */
export function interpolate(
  from: Quaternion,
  to: Quaternion,
  alpha: number,
  out: Quaternion,
): Quaternion {
  return out.copy(from).slerp(to, alpha);
}

/** Угол между двумя поворотами в радианах. */
export function angleBetween(a: Quaternion, b: Quaternion): number {
  return a.angleTo(b);
}

/**
 * Поворот вектора кватернионом. Вектор трактуется как направление:
 * поворот не переносит и не масштабирует.
 */
export function rotateVector(rotation: Quaternion, vector: Vector3, out: Vector3): Vector3 {
  return out.copy(vector).applyQuaternion(rotation);
}

/**
 * Кратчайший поворот, переводящий направление from в направление to.
 * Оба направления должны быть единичной длины.
 */
export function fromUnitVectors(from: Vector3, to: Vector3, out: Quaternion): Quaternion {
  return out.setFromUnitVectors(from, to);
}

/** Совпадают ли повороты как ориентации: q и -q задают одну ориентацию. */
export function sameOrientation(a: Quaternion, b: Quaternion, epsilon: number): boolean {
  _quaternion.copy(a);
  const dot = _quaternion.dot(b);
  return Math.abs(Math.abs(dot) - 1) <= epsilon;
}

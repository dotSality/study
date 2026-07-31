import { Matrix4, Vector3, Vector4, WebGLCoordinateSystem } from 'three';
import type { SceneNode } from './scene-graph.ts';

/**
 * Камера — обычный узел графа сцены плюс две матрицы.
 * Из узла берётся преобразование камера → мир, из настроек — камера → клип.
 */
export interface Camera {
  /** Узел, в котором живёт камера: её положение и поворот — это его положение и поворот. */
  readonly node: SceneNode;
  /** Мир → камера. Обратна мировой матрице узла. */
  readonly viewMatrix: Matrix4;
  /** Камера → клип. */
  readonly projectionMatrix: Matrix4;
  /** Мир → клип, произведение двух предыдущих. */
  readonly viewProjectionMatrix: Matrix4;
  setPerspective(fovYRadians: number, aspect: number, near: number, far: number): void;
  /** Пересчитывает матрицы по текущей мировой матрице узла. */
  update(): void;
}

export function createCamera(node: SceneNode): Camera {
  const viewMatrix = new Matrix4();
  const projectionMatrix = new Matrix4();
  const viewProjectionMatrix = new Matrix4();

  return {
    node,
    viewMatrix,
    projectionMatrix,
    viewProjectionMatrix,

    setPerspective(fovYRadians, aspect, near, far) {
      // Половина высоты ближней плоскости; дальше — обычная симметричная пирамида.
      const top = near * Math.tan(fovYRadians / 2);
      const height = 2 * top;
      const width = aspect * height;
      const left = -0.5 * width;
      projectionMatrix.makePerspective(
        left,
        left + width,
        top,
        top - height,
        near,
        far,
        WebGLCoordinateSystem,
      );
    },

    update() {
      // Камера смотрит из своего пространства: переход мир → камера обратен
      // переходу камера → мир, который хранит узел.
      viewMatrix.copy(node.worldMatrix).invert();
      viewProjectionMatrix.multiplyMatrices(projectionMatrix, viewMatrix);
    },
  };
}

/**
 * Мировая точка в клип-пространство. Координата w остаётся: делить на неё —
 * отдельный шаг, и до него точку ещё можно отсечь.
 */
export function worldToClip(camera: Camera, point: Vector3, out: Vector4): Vector4 {
  out.set(point.x, point.y, point.z, 1);
  return out.applyMatrix4(camera.viewProjectionMatrix);
}

/**
 * Лежит ли точка внутри видимого объёма. Границы заданы в клип-пространстве,
 * до перспективного деления, поэтому сравнения идут с w.
 */
export function isInsideViewVolume(clip: Vector4): boolean {
  const w = clip.w;
  return (
    clip.x >= -w && clip.x <= w && clip.y >= -w && clip.y <= w && clip.z >= -w && clip.z <= w
  );
}

/**
 * Перспективное деление: клип-пространство → нормализованные координаты устройства.
 * Именно это деление делает удалённые объекты меньше.
 */
export function clipToNdc(clip: Vector4, out: Vector3): Vector3 {
  const invW = 1 / clip.w;
  return out.set(clip.x * invW, clip.y * invW, clip.z * invW);
}

/**
 * Нормализованные координаты устройства → пиксели.
 * Ось y экрана растёт вниз, ось y NDC — вверх, поэтому знак меняется.
 */
export function ndcToScreen(
  ndc: Vector3,
  widthPx: number,
  heightPx: number,
  out: Vector3,
): Vector3 {
  return out.set(
    (ndc.x + 1) * 0.5 * widthPx,
    (1 - ndc.y) * 0.5 * heightPx,
    (ndc.z + 1) * 0.5,
  );
}

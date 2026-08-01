import { Matrix4, Quaternion, Vector3 } from 'three';
import { composeLocal, composeWorld } from './math.ts';

/**
 * Узел графа сцены глазами игрового кода: положение, поворот и масштаб
 * читаются функциями этого модуля, а меняются только его же функциями —
 * иначе грязный флаг некому поставить.
 */
export interface SceneNode {
  readonly name: string;
  readonly parent: SceneNode | null;
  readonly children: readonly SceneNode[];
  /** Расстояние до корня: у корня 0. */
  readonly depth: number;
  /** Преобразование из локального пространства узла в пространство родителя. */
  readonly localMatrix: Matrix4;
  /** Преобразование из локального пространства узла в мировое. */
  readonly worldMatrix: Matrix4;
}

// Внутреннее представление узла. Игровой код его не видит: в SceneNode нет ни
// одного изменяемого поля, поэтому забыть поставить флаг снаружи невозможно.
interface NodeState {
  name: string;
  parent: NodeState | null;
  children: NodeState[];
  depth: number;
  localMatrix: Matrix4;
  worldMatrix: Matrix4;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  /** Локальная матрица не соответствует position/rotation/scale. */
  localDirty: boolean;
  /** Мировая матрица не соответствует локальной или мировой матрице родителя. */
  worldDirty: boolean;
}

/** Счётчики обхода. Пересчитываются от прогона к прогону одинаково. */
export interface GraphStats {
  /** Сколько раз запускался обход графа. За кадр должен быть один. */
  traversals: number;
  /** Сколько узлов посетил обход. */
  visited: number;
  /** Сколько локальных матриц собрано заново. */
  localRecomputed: number;
  /** Сколько мировых матриц пересчитано. */
  worldRecomputed: number;
}

export interface SceneGraph {
  readonly root: SceneNode;
  readonly stats: GraphStats;
  /** Приводит мировые матрицы в соответствие с локальными. */
  update(): void;
  resetStats(): void;
  /**
   * Вернуть граф в состояние до первого обхода: все матрицы снова считаются
   * грязными, счётчики обнуляются. Без этого два прогона одного сценария дают
   * разные числа пересчётов — граф помнит, что уже считал (найдено при сборке
   * ядра, часть 5.2).
   */
  reset(): void;
}

function asState(node: SceneNode): NodeState {
  return node as unknown as NodeState;
}

export function createSceneNode(name: string): SceneNode {
  const state: NodeState = {
    name,
    parent: null,
    children: [],
    depth: 0,
    localMatrix: new Matrix4(),
    worldMatrix: new Matrix4(),
    position: new Vector3(0, 0, 0),
    rotation: new Quaternion(0, 0, 0, 1),
    scale: new Vector3(1, 1, 1),
    // Новый узел ещё ни разу не считался, поэтому обе матрицы грязные.
    localDirty: true,
    worldDirty: true,
  };
  return state as unknown as SceneNode;
}

/**
 * Делает child потомком parent. Локальное преобразование сохраняется,
 * поэтому мировое положение узла меняется вместе со сменой родителя.
 */
export function addChild(parent: SceneNode, child: SceneNode): void {
  const parentState = asState(parent);
  const childState = asState(child);
  if (childState === parentState) {
    throw new RangeError('Узел не может быть своим родителем');
  }
  if (childState.parent !== null) {
    removeChild(childState.parent as unknown as SceneNode, child);
  }
  childState.parent = parentState;
  parentState.children.push(childState);
  markSubtreeWorldDirty(childState, parentState.depth + 1);
}

export function removeChild(parent: SceneNode, child: SceneNode): boolean {
  const parentState = asState(parent);
  const childState = asState(child);
  const index = parentState.children.indexOf(childState);
  if (index < 0) {
    return false;
  }
  parentState.children.splice(index, 1);
  childState.parent = null;
  markSubtreeWorldDirty(childState, 0);
  return true;
}

// Смена родителя меняет мировое преобразование всего поддерева и его глубину.
function markSubtreeWorldDirty(node: NodeState, depth: number): void {
  node.depth = depth;
  node.worldDirty = true;
  const children = node.children;
  for (let i = 0; i < children.length; i += 1) {
    markSubtreeWorldDirty(children[i], depth + 1);
  }
}

export function setLocalPosition(node: SceneNode, x: number, y: number, z: number): void {
  const state = asState(node);
  state.position.set(x, y, z);
  state.localDirty = true;
  state.worldDirty = true;
}

export function setLocalRotation(node: SceneNode, rotation: Quaternion): void {
  const state = asState(node);
  state.rotation.copy(rotation);
  state.localDirty = true;
  state.worldDirty = true;
}

export function setLocalScale(node: SceneNode, x: number, y: number, z: number): void {
  const state = asState(node);
  state.scale.set(x, y, z);
  state.localDirty = true;
  state.worldDirty = true;
}

export function translateLocal(node: SceneNode, dx: number, dy: number, dz: number): void {
  const state = asState(node);
  state.position.set(state.position.x + dx, state.position.y + dy, state.position.z + dz);
  state.localDirty = true;
  state.worldDirty = true;
}

export function getLocalPosition(node: SceneNode, out: Vector3): Vector3 {
  return out.copy(asState(node).position);
}

export function getLocalRotation(node: SceneNode, out: Quaternion): Quaternion {
  return out.copy(asState(node).rotation);
}

export function getLocalScale(node: SceneNode, out: Vector3): Vector3 {
  return out.copy(asState(node).scale);
}

/** Грязна ли локальная матрица узла. Нужно проверкам, а не игровому коду. */
export function isLocalDirty(node: SceneNode): boolean {
  return asState(node).localDirty;
}

export function isWorldDirty(node: SceneNode): boolean {
  return asState(node).worldDirty;
}

/**
 * Пометить узел и всё его поддерево грязными. Нужно после правки, сделанной
 * мимо мутаторов модуля, и при сбросе движка.
 */
export function markTreeDirty(node: SceneNode): void {
  const state = asState(node);
  state.localDirty = true;
  state.worldDirty = true;
  for (let i = 0; i < state.children.length; i += 1) {
    markTreeDirty(state.children[i] as unknown as SceneNode);
  }
}

export function createGraphStats(): GraphStats {
  return { traversals: 0, visited: 0, localRecomputed: 0, worldRecomputed: 0 };
}

export function createSceneGraph(root: SceneNode): SceneGraph {
  const rootState = asState(root);
  const stats = createGraphStats();

  // Стек обхода: массив узлов и признак «предок пересчитан» для каждого из них.
  // Оба массива переиспользуются между кадрами, поэтому обход не выделяет память.
  const nodeStack: NodeState[] = [];
  const dirtyStack: boolean[] = [];

  return {
    root,
    stats,

    update() {
      stats.traversals += 1;

      let top = 0;
      nodeStack[top] = rootState;
      dirtyStack[top] = false;
      top += 1;

      while (top > 0) {
        top -= 1;
        const node = nodeStack[top];
        const parentRecomputed = dirtyStack[top];
        stats.visited += 1;

        if (node.localDirty) {
          composeLocal(node.position, node.rotation, node.scale, node.localMatrix);
          node.localDirty = false;
          stats.localRecomputed += 1;
        }

        // Мировая матрица устарела, если изменилось само поддерево или если
        // родитель пересчитался: грязь распространяется вниз по ходу обхода,
        // а не помечает всё поддерево заранее.
        const recompute = node.worldDirty || parentRecomputed;
        if (recompute) {
          if (node.parent === null) {
            node.worldMatrix.copy(node.localMatrix);
          } else {
            composeWorld(node.parent.worldMatrix, node.localMatrix, node.worldMatrix);
          }
          node.worldDirty = false;
          stats.worldRecomputed += 1;
        }

        const children = node.children;
        for (let i = children.length - 1; i >= 0; i -= 1) {
          nodeStack[top] = children[i];
          dirtyStack[top] = recompute;
          top += 1;
        }
      }
    },

    resetStats() {
      stats.traversals = 0;
      stats.visited = 0;
      stats.localRecomputed = 0;
      stats.worldRecomputed = 0;
    },

    reset() {
      markTreeDirty(root);
      stats.traversals = 0;
      stats.visited = 0;
      stats.localRecomputed = 0;
      stats.worldRecomputed = 0;
    },
  };
}

/** Сколько узлов в поддереве, включая сам узел. */
export function countNodes(node: SceneNode): number {
  const state = asState(node);
  let total = 1;
  for (let i = 0; i < state.children.length; i += 1) {
    total += countNodes(state.children[i] as unknown as SceneNode);
  }
  return total;
}

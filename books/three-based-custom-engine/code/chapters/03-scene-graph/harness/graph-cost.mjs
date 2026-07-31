// Измерение слоя 1: во что обходится кадр графа сцены.
// Сравниваются три режима на одном и том же дереве и одном и том же движении:
// граф движка, three с настройками по умолчанию и three с ручным управлением матрицами.
//
// Запуск: node harness/graph-cost.mjs
import { PerformanceObserver } from 'node:perf_hooks';
import { Object3D } from 'three';
import {
  addChild,
  countNodes,
  createSceneGraph,
  createSceneNode,
  setLocalPosition,
} from '../src/engine/scene-graph.ts';

const BRANCHING = 5;
const DEPTH = 4;

/** Дерево из BRANCHING^0 + … + BRANCHING^DEPTH узлов. */
function buildEngineTree() {
  const root = createSceneNode('root');
  let level = [root];
  for (let d = 0; d < DEPTH; d += 1) {
    const next = [];
    for (const parent of level) {
      for (let i = 0; i < BRANCHING; i += 1) {
        const child = createSceneNode(`n${d}-${i}`);
        addChild(parent, child);
        next.push(child);
      }
    }
    level = next;
  }
  return root;
}

function buildThreeTree() {
  const root = new Object3D();
  let level = [root];
  for (let d = 0; d < DEPTH; d += 1) {
    const next = [];
    for (const parent of level) {
      for (let i = 0; i < BRANCHING; i += 1) {
        const child = new Object3D();
        parent.add(child);
        next.push(child);
      }
    }
    level = next;
  }
  return root;
}

/** Первый узел второго уровня: у него есть и предки, и заметное поддерево. */
function firstGrandchild(node) {
  return node.children[0].children[0];
}

function subtreeSizeThree(node) {
  let total = 1;
  for (const child of node.children) total += subtreeSizeThree(child);
  return total;
}

// Счётчики three снимаются подменой методов на прототипе: обёртка считает вход в
// узел и предсказывает, будет ли пересчитана мировая матрица. Предсказание
// повторяет условие из исходного кода 0.185.1: при matrixAutoUpdate вызов
// updateMatrix() безусловно ставит matrixWorldNeedsUpdate.
const originalUpdateMatrix = Object3D.prototype.updateMatrix;
const originalUpdateMatrixWorld = Object3D.prototype.updateMatrixWorld;

const threeStats = { visited: 0, localRecomputed: 0, worldRecomputed: 0 };

Object3D.prototype.updateMatrix = function countedUpdateMatrix() {
  threeStats.localRecomputed += 1;
  return originalUpdateMatrix.call(this);
};

Object3D.prototype.updateMatrixWorld = function countedUpdateMatrixWorld(force) {
  threeStats.visited += 1;
  if (this.matrixAutoUpdate || this.matrixWorldNeedsUpdate || force) {
    threeStats.worldRecomputed += 1;
  }
  return originalUpdateMatrixWorld.call(this, force);
};

function resetThreeStats() {
  threeStats.visited = 0;
  threeStats.localRecomputed = 0;
  threeStats.worldRecomputed = 0;
}

function measureEngine() {
  const root = buildEngineTree();
  const graph = createSceneGraph(root);
  graph.update();
  graph.resetStats();

  const moved = root.children[0].children[0];
  setLocalPosition(moved, 1, 0, 0);
  graph.update();

  return {
    total: countNodes(root),
    subtree: countNodes(moved),
    visited: graph.stats.visited,
    localRecomputed: graph.stats.localRecomputed,
    worldRecomputed: graph.stats.worldRecomputed,
  };
}

function measureThreeDefault() {
  const root = buildThreeTree();
  root.updateMatrixWorld(false);
  resetThreeStats();

  const moved = firstGrandchild(root);
  moved.position.set(1, 0, 0);
  root.updateMatrixWorld(false);

  return {
    total: subtreeSizeThree(root),
    subtree: subtreeSizeThree(moved),
    visited: threeStats.visited,
    localRecomputed: threeStats.localRecomputed,
    worldRecomputed: threeStats.worldRecomputed,
  };
}

function measureThreeManual() {
  const root = buildThreeTree();
  root.traverse((node) => {
    node.matrixAutoUpdate = false;
  });
  root.updateMatrixWorld(true);
  resetThreeStats();

  const moved = firstGrandchild(root);
  moved.position.set(1, 0, 0);
  moved.updateMatrix();
  root.updateMatrixWorld(false);

  return {
    total: subtreeSizeThree(root),
    subtree: subtreeSizeThree(moved),
    visited: threeStats.visited,
    localRecomputed: threeStats.localRecomputed,
    worldRecomputed: threeStats.worldRecomputed,
  };
}

/**
 * Сборки мусора за серию обходов. Ноль означает, что обход не создаёт объектов:
 * стек обхода живёт между кадрами, временных векторов и матриц в нём нет.
 */
function measureAllocations(traversals) {
  const collections = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) collections.push(entry.startTime);
  });
  observer.observe({ entryTypes: ['gc'] });

  const root = buildEngineTree();
  const graph = createSceneGraph(root);
  const moved = root.children[0].children[0];
  graph.update();

  const from = performance.now();
  for (let i = 0; i < traversals; i += 1) {
    setLocalPosition(moved, i, 0, 0);
    graph.update();
  }
  const to = performance.now();

  observer.disconnect();
  return {
    traversals,
    collections: collections.filter((at) => at >= from && at <= to).length,
  };
}

const rows = [
  ['граф движка', measureEngine()],
  ['three, настройки по умолчанию', measureThreeDefault()],
  ['three, matrixAutoUpdate = false', measureThreeManual()],
];

console.log(`дерево: ветвление ${BRANCHING}, глубина ${DEPTH}, узлов ${rows[0][1].total}`);
console.log(`сдвинут один узел, размер его поддерева: ${rows[0][1].subtree}`);
console.log('');
console.log('режим                            посещено  локальных  мировых');
for (const [name, stats] of rows) {
  console.log(
    `${name.padEnd(32)} ${String(stats.visited).padStart(8)}  ${String(stats.localRecomputed).padStart(9)}  ${String(stats.worldRecomputed).padStart(7)}`,
  );
}

const allocations = measureAllocations(10_000);
console.log('');
console.log(
  `обходов подряд: ${allocations.traversals}, сборок мусора за это время: ${allocations.collections}`,
);

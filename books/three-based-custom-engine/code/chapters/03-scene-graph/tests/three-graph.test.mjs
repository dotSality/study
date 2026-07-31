// Слой 3: чем обход графа движка отличается от обхода three 0.185.1.
// Тест закрепляет поведение библиотеки: если оно изменится, глава устареет и
// об этом станет известно из падения, а не из неверного текста.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D } from 'three';
import { engine } from './adapter.mjs';

const BRANCHING = 5;
const DEPTH = 4;
const TOTAL_NODES = 781;
const SUBTREE_NODES = 31;

const originalUpdateMatrix = Object3D.prototype.updateMatrix;
const originalUpdateMatrixWorld = Object3D.prototype.updateMatrixWorld;
const stats = { visited: 0, localRecomputed: 0, worldRecomputed: 0 };

Object3D.prototype.updateMatrix = function countedUpdateMatrix() {
  stats.localRecomputed += 1;
  return originalUpdateMatrix.call(this);
};

Object3D.prototype.updateMatrixWorld = function countedUpdateMatrixWorld(force) {
  stats.visited += 1;
  // Условие повторяет исходный код 0.185.1: при matrixAutoUpdate вызов
  // updateMatrix() безусловно ставит matrixWorldNeedsUpdate.
  if (this.matrixAutoUpdate || this.matrixWorldNeedsUpdate || force) {
    stats.worldRecomputed += 1;
  }
  return originalUpdateMatrixWorld.call(this, force);
};

function resetStats() {
  stats.visited = 0;
  stats.localRecomputed = 0;
  stats.worldRecomputed = 0;
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

function buildEngineTree() {
  const root = engine.newNode('root');
  let level = [root];
  for (let d = 0; d < DEPTH; d += 1) {
    const next = [];
    for (const parent of level) {
      for (let i = 0; i < BRANCHING; i += 1) {
        const child = engine.newNode(`n${d}-${i}`);
        engine.addChild(parent, child);
        next.push(child);
      }
    }
    level = next;
  }
  return root;
}

test('the reference tree has the size the chapter claims', () => {
  const root = buildEngineTree();
  assert.equal(engine.countNodes(root), TOTAL_NODES);
  assert.equal(engine.countNodes(root.children[0].children[0]), SUBTREE_NODES);
});

test('three recomputes every matrix every frame with default settings', () => {
  const root = buildThreeTree();
  root.updateMatrixWorld(false);
  resetStats();

  root.children[0].children[0].position.set(1, 0, 0);
  root.updateMatrixWorld(false);

  assert.equal(stats.visited, TOTAL_NODES);
  assert.equal(stats.localRecomputed, TOTAL_NODES, 'локальная матрица собирается у каждого узла');
  assert.equal(stats.worldRecomputed, TOTAL_NODES, 'мировая матрица пересчитывается у каждого узла');
});

test('three honours the dirty flag once matrixAutoUpdate is off', () => {
  const root = buildThreeTree();
  root.traverse((node) => {
    node.matrixAutoUpdate = false;
  });
  root.updateMatrixWorld(true);
  resetStats();

  const moved = root.children[0].children[0];
  moved.position.set(1, 0, 0);
  moved.updateMatrix();
  root.updateMatrixWorld(false);

  assert.equal(stats.visited, TOTAL_NODES, 'обход всё равно полный');
  assert.equal(stats.localRecomputed, 1);
  assert.equal(stats.worldRecomputed, SUBTREE_NODES);
});

test('the engine graph gives the manual numbers without the manual call', () => {
  const root = buildEngineTree();
  const graph = engine.newGraph(root);
  graph.update();
  graph.resetStats();

  engine.setLocalPosition(root.children[0].children[0], 1, 0, 0);
  graph.update();

  assert.equal(graph.stats.visited, TOTAL_NODES);
  assert.equal(graph.stats.localRecomputed, 1);
  assert.equal(graph.stats.worldRecomputed, SUBTREE_NODES);
});

test('forgetting updateMatrix in three loses the move, the engine cannot forget', () => {
  const root = buildThreeTree();
  root.traverse((node) => {
    node.matrixAutoUpdate = false;
  });
  root.updateMatrixWorld(true);

  const moved = root.children[0].children[0];
  moved.position.set(5, 0, 0);
  // updateMatrix() не вызван: движение потеряно, и ничто об этом не сообщает.
  root.updateMatrixWorld(false);
  assert.equal(moved.matrixWorld.elements[12], 0, 'three не заметил движения');

  const engineRoot = buildEngineTree();
  const graph = engine.newGraph(engineRoot);
  graph.update();
  const engineMoved = engineRoot.children[0].children[0];
  engine.setLocalPosition(engineMoved, 5, 0, 0);
  graph.update();
  assert.equal(engineMoved.worldMatrix.elements[12], 5, 'движок пересчитал сам');
});

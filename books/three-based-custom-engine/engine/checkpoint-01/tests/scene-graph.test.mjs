// Слой 3: иерархия, мировые матрицы и грязный флаг.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { engine } from './adapter.mjs';

const EPSILON = 1e-6;

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: получено ${actual}, ожидалось ${expected}`,
  );
}

function assertVectorClose(actual, expected, message) {
  assertClose(actual.x, expected[0], `${message} (x)`);
  assertClose(actual.y, expected[1], `${message} (y)`);
  assertClose(actual.z, expected[2], `${message} (z)`);
}

/** Дерево из шести узлов: корень, двое детей, двое внуков у первого и один у второго. */
function buildTree() {
  const root = engine.newNode('root');
  const a = engine.newNode('a');
  const b = engine.newNode('b');
  const a1 = engine.newNode('a1');
  const a2 = engine.newNode('a2');
  const b1 = engine.newNode('b1');

  engine.addChild(root, a);
  engine.addChild(root, b);
  engine.addChild(a, a1);
  engine.addChild(a, a2);
  engine.addChild(b, b1);

  return { root, a, b, a1, a2, b1, graph: engine.newGraph(root) };
}

function worldOrigin(node, out) {
  return engine.origin(node.worldMatrix, out);
}

test('the tree has the expected number of nodes', () => {
  const tree = buildTree();
  assert.equal(engine.countNodes(tree.root), 6);
  assert.equal(tree.root.depth, 0);
  assert.equal(tree.a.depth, 1);
  assert.equal(tree.a1.depth, 2);
});

test('the world matrix of the root equals its local matrix', () => {
  const tree = buildTree();
  engine.setLocalPosition(tree.root, 1, 2, 3);
  tree.graph.update();

  const out = new Vector3();
  assertVectorClose(worldOrigin(tree.root, out), [1, 2, 3], 'корень');
  assertVectorClose(engine.origin(tree.root.localMatrix, out), [1, 2, 3], 'локальная матрица корня');
});

test('a child world matrix is the parent world matrix times the local one', () => {
  const tree = buildTree();
  engine.setLocalPosition(tree.a, 10, 0, 0);
  engine.setLocalPosition(tree.a1, 0, 5, 0);
  tree.graph.update();

  const expected = new Matrix4();
  engine.composeWorld(tree.a.worldMatrix, tree.a1.localMatrix, expected);
  assert.deepEqual([...tree.a1.worldMatrix.elements], [...expected.elements]);

  const out = new Vector3();
  assertVectorClose(worldOrigin(tree.a1, out), [10, 5, 0], 'внук');
});

test('a parent rotation carries its whole subtree', () => {
  const tree = buildTree();
  const rotation = new Quaternion();
  engine.setLocalPosition(tree.a1, 1, 0, 0);
  engine.fromAxisAngle(0, 1, 0, Math.PI / 2, rotation);
  engine.setLocalRotation(tree.a, rotation);
  tree.graph.update();

  const out = new Vector3();
  // Поворот родителя на 90 градусов вокруг y переводит смещение вдоль x в -z.
  assertVectorClose(worldOrigin(tree.a1, out), [0, 0, -1], 'внук после поворота родителя');
});

test('one update is one traversal that visits every node', () => {
  const tree = buildTree();
  tree.graph.update();

  assert.equal(tree.graph.stats.traversals, 1);
  assert.equal(tree.graph.stats.visited, 6);
});

test('the first update computes every matrix once', () => {
  const tree = buildTree();
  tree.graph.update();

  assert.equal(tree.graph.stats.localRecomputed, 6);
  assert.equal(tree.graph.stats.worldRecomputed, 6);
});

test('an update without changes recomputes nothing but still walks the graph', () => {
  const tree = buildTree();
  tree.graph.update();
  tree.graph.resetStats();

  tree.graph.update();

  assert.equal(tree.graph.stats.visited, 6, 'обход всё равно полный');
  assert.equal(tree.graph.stats.localRecomputed, 0, 'локальные матрицы не пересобираются');
  assert.equal(tree.graph.stats.worldRecomputed, 0, 'мировые матрицы не пересчитываются');
});

test('moving a parent recomputes its subtree and nothing else', () => {
  const tree = buildTree();
  tree.graph.update();
  tree.graph.resetStats();

  engine.setLocalPosition(tree.a, 0, 7, 0);
  tree.graph.update();

  // Поддерево a — это сам a и двое его детей.
  assert.equal(tree.graph.stats.localRecomputed, 1, 'локальная матрица только у сдвинутого узла');
  assert.equal(tree.graph.stats.worldRecomputed, 3, 'мировые матрицы у поддерева a');
  assert.equal(tree.graph.stats.visited, 6, 'обход при этом полный');

  const out = new Vector3();
  assertVectorClose(worldOrigin(tree.a1, out), [0, 7, 0], 'внук уехал вместе с родителем');
  assertVectorClose(worldOrigin(tree.b1, out), [0, 0, 0], 'соседнее поддерево не тронуто');
});

test('moving a leaf recomputes one world matrix', () => {
  const tree = buildTree();
  tree.graph.update();
  tree.graph.resetStats();

  engine.translateLocal(tree.b1, 1, 1, 1);
  tree.graph.update();

  assert.equal(tree.graph.stats.localRecomputed, 1);
  assert.equal(tree.graph.stats.worldRecomputed, 1);
});

test('two moves in one frame cost one recomputation each', () => {
  const tree = buildTree();
  tree.graph.update();
  tree.graph.resetStats();

  engine.setLocalPosition(tree.a1, 1, 0, 0);
  engine.setLocalPosition(tree.a2, 2, 0, 0);
  tree.graph.update();

  assert.equal(tree.graph.stats.worldRecomputed, 2, 'пересчитаны только сдвинутые листья');
});

test('a node is dirty until the graph is updated', () => {
  const tree = buildTree();
  assert.equal(engine.isLocalDirty(tree.a), true, 'новый узел грязный');

  tree.graph.update();
  assert.equal(engine.isLocalDirty(tree.a), false);
  assert.equal(engine.isWorldDirty(tree.a), false);

  engine.setLocalScale(tree.a, 2, 2, 2);
  assert.equal(engine.isLocalDirty(tree.a), true, 'изменение снова пачкает узел');
});

test('changing the parent keeps the local transform and moves the node in the world', () => {
  const tree = buildTree();
  engine.setLocalPosition(tree.a, 10, 0, 0);
  engine.setLocalPosition(tree.b, 0, 20, 0);
  engine.setLocalPosition(tree.a1, 1, 0, 0);
  tree.graph.update();

  const out = new Vector3();
  assertVectorClose(worldOrigin(tree.a1, out), [11, 0, 0], 'до переноса');

  engine.addChild(tree.b, tree.a1);
  tree.graph.update();

  assertVectorClose(engine.getLocalPosition(tree.a1, out), [1, 0, 0], 'локальное преобразование сохранено');
  assertVectorClose(worldOrigin(tree.a1, out), [1, 20, 0], 'мировое положение сменилось вместе с родителем');
  assert.equal(tree.a1.depth, 2);
  assert.equal(tree.a.children.length, 1, 'узел ушёл из прежнего родителя');
});

test('a removed subtree stops following its former parent', () => {
  const tree = buildTree();
  engine.setLocalPosition(tree.a, 10, 0, 0);
  tree.graph.update();

  assert.equal(engine.removeChild(tree.a, tree.a1), true);
  assert.equal(engine.removeChild(tree.a, tree.a1), false, 'повторное удаление ничего не делает');
  assert.equal(engine.countNodes(tree.root), 5);

  engine.setLocalPosition(tree.a, 100, 0, 0);
  tree.graph.update();

  const out = new Vector3();
  assertVectorClose(worldOrigin(tree.a, out), [100, 0, 0], 'прежний родитель уехал');
  // Узел вне графа никто не обходит: его мировая матрица осталась той, какой была
  // на последнем обходе, и за прежним родителем она уже не следует.
  assertVectorClose(worldOrigin(tree.a1, out), [10, 0, 0], 'отсоединённый узел остался на месте');
  assert.equal(engine.isWorldDirty(tree.a1), true, 'и помечен как требующий пересчёта');
});

test('a node cannot be its own parent', () => {
  const root = engine.newNode('root');
  assert.throws(() => engine.addChild(root, root), RangeError);
});

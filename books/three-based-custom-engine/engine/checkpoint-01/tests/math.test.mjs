// Слой 3: соглашения движка о матрицах и о разнице точки и направления.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
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

test('set takes rows while elements stores columns', () => {
  const matrix = new Matrix4();
  matrix.set(11, 12, 13, 14, 21, 22, 23, 24, 31, 32, 33, 34, 41, 42, 43, 44);
  assert.deepEqual(
    [...matrix.elements],
    [11, 21, 31, 41, 12, 22, 32, 42, 13, 23, 33, 43, 14, 24, 34, 44],
  );
});

test('elementIndex addresses the same entry that set wrote', () => {
  const matrix = new Matrix4();
  matrix.set(11, 12, 13, 14, 21, 22, 23, 24, 31, 32, 33, 34, 41, 42, 43, 44);
  assert.equal(matrix.elements[engine.elementIndex(0, 3)], 14);
  assert.equal(matrix.elements[engine.elementIndex(3, 0)], 41);
  assert.equal(matrix.elements[engine.elementIndex(2, 1)], 32);
});

test('the first three columns are the local axes and the fourth is the origin', () => {
  const matrix = new Matrix4();
  matrix.makeRotationY(Math.PI / 2);
  matrix.setPosition(5, 6, 7);
  const out = new Vector3();

  // Поворот на 90 градусов вокруг y переводит ось x в -z, а ось z в +x.
  assertVectorClose(engine.axisX(matrix, out), [0, 0, -1], 'ось x');
  assertVectorClose(engine.axisY(matrix, out), [0, 1, 0], 'ось y');
  assertVectorClose(engine.axisZ(matrix, out), [1, 0, 0], 'ось z');
  assertVectorClose(engine.origin(matrix, out), [5, 6, 7], 'начало координат');
});

test('translation moves a point but leaves a direction alone', () => {
  const matrix = new Matrix4().makeTranslation(10, 0, 0);
  const out = new Vector3();

  assertVectorClose(engine.applyToPoint(matrix, new Vector3(1, 2, 3), out), [11, 2, 3], 'точка');
  assertVectorClose(
    engine.applyToDirection(matrix, new Vector3(1, 2, 3), out),
    [1, 2, 3],
    'направление',
  );
});

test('rotation acts on a direction the same way as on a point', () => {
  const matrix = new Matrix4().makeRotationZ(Math.PI / 2);
  const out = new Vector3();

  assertVectorClose(engine.applyToPoint(matrix, new Vector3(1, 0, 0), out), [0, 1, 0], 'точка');
  assertVectorClose(
    engine.applyToDirection(matrix, new Vector3(1, 0, 0), out),
    [0, 1, 0],
    'направление',
  );
});

test('the order of multiplication decides the result', () => {
  const rotate = new Matrix4().makeRotationZ(Math.PI / 2);
  const translate = new Matrix4().makeTranslation(10, 0, 0);
  const point = new Vector3(1, 0, 0);
  const out = new Vector3();

  // Сначала поворот, потом перенос: точка уезжает вдоль x уже после поворота.
  const rotateThenTranslate = new Matrix4().multiplyMatrices(translate, rotate);
  assertVectorClose(engine.applyToPoint(rotateThenTranslate, point, out), [10, 1, 0], 'поворот, затем перенос');

  // Сначала перенос, потом поворот: перенос поворачивается вместе с точкой.
  const translateThenRotate = new Matrix4().multiplyMatrices(rotate, translate);
  assertVectorClose(engine.applyToPoint(translateThenRotate, point, out), [0, 11, 0], 'перенос, затем поворот');
});

test('composeWorld applies the local matrix before the parent one', () => {
  const parentWorld = new Matrix4().makeTranslation(0, 10, 0);
  const local = new Matrix4().makeTranslation(5, 0, 0);
  const world = new Matrix4();
  const out = new Vector3();

  engine.composeWorld(parentWorld, local, world);
  assertVectorClose(engine.applyToPoint(world, new Vector3(0, 0, 0), out), [5, 10, 0], 'мировая матрица');
});

test('a transform matrix keeps the fourth row equal to 0 0 0 1', () => {
  const first = new Matrix4().makeRotationX(0.3);
  const second = new Matrix4().makeTranslation(1, 2, 3);
  const scale = new Matrix4().makeScale(2, 3, 4);
  const product = new Matrix4().multiplyMatrices(second, first).multiply(scale);
  const e = product.elements;

  assertClose(e[engine.elementIndex(3, 0)], 0, 'строка 3, столбец 0');
  assertClose(e[engine.elementIndex(3, 1)], 0, 'строка 3, столбец 1');
  assertClose(e[engine.elementIndex(3, 2)], 0, 'строка 3, столбец 2');
  assertClose(e[engine.elementIndex(3, 3)], 1, 'строка 3, столбец 3');
});

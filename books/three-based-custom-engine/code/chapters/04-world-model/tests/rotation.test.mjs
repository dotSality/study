// Слой 3: повороты, потеря степени свободы у углов Эйлера, кватернионы.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { engine } from './adapter.mjs';

const EPSILON = 1e-6;
const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;

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

test('the engine fixes one euler order and it is not the three.js default', () => {
  assert.equal(engine.eulerOrder, 'YXZ');
});

test('yaw pitch roll survive a round trip through a quaternion', () => {
  const rotation = new Quaternion();
  const angles = new Vector3();
  engine.fromYawPitchRoll(0.4, -0.3, 0.2, rotation);
  engine.toYawPitchRoll(rotation, angles);
  assertVectorClose(angles, [0.4, -0.3, 0.2], 'углы после круга');
});

test('rotating a vector by a quaternion equals rotating it by the matrix', () => {
  const rotation = new Quaternion();
  engine.fromYawPitchRoll(0.4, -0.3, 0.2, rotation);

  const byQuaternion = new Vector3();
  engine.rotateVector(rotation, new Vector3(1, 2, 3), byQuaternion);

  const matrix = new Matrix4().makeRotationFromQuaternion(rotation);
  const byMatrix = new Vector3(1, 2, 3).applyMatrix4(matrix);

  assertVectorClose(byQuaternion, [byMatrix.x, byMatrix.y, byMatrix.z], 'поворот вектора');
});

test('composing rotations is not commutative', () => {
  const yaw = new Quaternion();
  const pitch = new Quaternion();
  engine.fromAxisAngle(0, 1, 0, QUARTER_TURN, yaw);
  engine.fromAxisAngle(1, 0, 0, QUARTER_TURN, pitch);

  const yawThenPitch = new Quaternion();
  const pitchThenYaw = new Quaternion();
  engine.concatRotations(pitch, yaw, yawThenPitch);
  engine.concatRotations(yaw, pitch, pitchThenYaw);

  assert.ok(
    !engine.sameOrientation(yawThenPitch, pitchThenYaw, EPSILON),
    'порядок поворотов не должен быть безразличен',
  );
});

test('concat applies the second argument first', () => {
  const yaw = new Quaternion();
  const pitch = new Quaternion();
  engine.fromAxisAngle(0, 1, 0, QUARTER_TURN, yaw);
  engine.fromAxisAngle(1, 0, 0, QUARTER_TURN, pitch);

  const composed = new Quaternion();
  engine.concatRotations(pitch, yaw, composed);

  const byQuaternion = new Vector3();
  engine.rotateVector(composed, new Vector3(0, 0, 1), byQuaternion);

  const step = new Vector3(0, 0, 1);
  engine.rotateVector(yaw, step, step);
  engine.rotateVector(pitch, step, step);

  assertVectorClose(byQuaternion, [step.x, step.y, step.z], 'композиция как два поворота подряд');
});

test('a quaternion and its negation are the same orientation', () => {
  const rotation = new Quaternion();
  engine.fromYawPitchRoll(0.4, -0.3, 0.2, rotation);
  const negated = new Quaternion(-rotation.x, -rotation.y, -rotation.z, -rotation.w);

  assert.ok(engine.sameOrientation(rotation, negated, EPSILON), 'q и -q задают одну ориентацию');

  const byQuaternion = new Vector3();
  const byNegated = new Vector3();
  engine.rotateVector(rotation, new Vector3(1, 2, 3), byQuaternion);
  engine.rotateVector(negated, new Vector3(1, 2, 3), byNegated);
  assertVectorClose(byQuaternion, [byNegated.x, byNegated.y, byNegated.z], 'поворот тем же вектором');
});

test('two different euler triples give one orientation', () => {
  const direct = new Quaternion();
  const roundabout = new Quaternion();
  // Крен на пол-оборота и одновременный разворот рыскания с тангажом дают одно и то же.
  engine.fromYawPitchRoll(0, 0, HALF_TURN, direct);
  engine.fromYawPitchRoll(HALF_TURN, HALF_TURN, 0, roundabout);

  assert.ok(
    engine.sameOrientation(direct, roundabout, EPSILON),
    'разные тройки углов задают одну ориентацию',
  );
});

test('at ninety degrees of pitch yaw and roll turn about one axis', () => {
  const byYaw = new Quaternion();
  const byRoll = new Quaternion();
  const angle = 0.37;
  engine.fromYawPitchRoll(angle, QUARTER_TURN, 0, byYaw);
  engine.fromYawPitchRoll(0, QUARTER_TURN, -angle, byRoll);

  assert.ok(
    engine.sameOrientation(byYaw, byRoll, EPSILON),
    'при тангаже 90 градусов рыскание и крен перестают быть независимыми',
  );
});

test('interpolation covers the angle proportionally', () => {
  const from = new Quaternion();
  const to = new Quaternion();
  engine.fromAxisAngle(0, 1, 0, 0, from);
  engine.fromAxisAngle(0, 1, 0, QUARTER_TURN, to);

  const full = engine.angleBetween(from, to);
  const middle = new Quaternion();
  engine.interpolateRotations(from, to, 0.5, middle);

  assertClose(engine.angleBetween(from, middle), full / 2, 'половина пути');
  assertClose(engine.angleBetween(middle, to), full / 2, 'вторая половина пути');
});

test('interpolation does not touch its arguments', () => {
  const from = new Quaternion();
  const to = new Quaternion();
  engine.fromAxisAngle(0, 1, 0, 0, from);
  engine.fromAxisAngle(0, 1, 0, QUARTER_TURN, to);
  const result = new Quaternion();

  engine.interpolateRotations(from, to, 0.25, result);

  assertClose(engine.angleBetween(from, to), QUARTER_TURN, 'исходные повороты не изменились');
});

test('the inverse rotation undoes the rotation', () => {
  const rotation = new Quaternion();
  const inverse = new Quaternion();
  engine.fromYawPitchRoll(0.4, -0.3, 0.2, rotation);
  engine.invertRotation(rotation, inverse);

  const point = new Vector3(1, 2, 3);
  const moved = new Vector3();
  engine.rotateVector(rotation, point, moved);
  engine.rotateVector(inverse, moved, moved);

  assertVectorClose(moved, [1, 2, 3], 'поворот и обратный ему');
});

// Слой 3: цепочка пространств от мира до пикселей.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3, Vector4 } from 'three';
import { engine } from './adapter.mjs';

const EPSILON = 1e-6;
const NEAR = 0.1;
const FAR = 100;
const FOV_Y = Math.PI / 3;
const ASPECT = 16 / 9;
const WIDTH_PX = 640;
const HEIGHT_PX = 360;

function assertClose(actual, expected, message, epsilon = EPSILON) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: получено ${actual}, ожидалось ${expected}`,
  );
}

function buildCamera() {
  const root = engine.newNode('root');
  const rig = engine.newNode('rig');
  const cameraNode = engine.newNode('camera');
  engine.addChild(root, rig);
  engine.addChild(rig, cameraNode);

  const graph = engine.newGraph(root);
  const camera = engine.newCamera(cameraNode);
  camera.setPerspective(FOV_Y, ASPECT, NEAR, FAR);
  return { root, rig, cameraNode, graph, camera };
}

function project(scene, x, y, z) {
  const clip = new Vector4();
  const ndc = new Vector3();
  engine.worldToClip(scene.camera, new Vector3(x, y, z), clip);
  engine.clipToNdc(clip, ndc);
  return { clip, ndc };
}

test('the view matrix is the inverse of the camera world matrix', () => {
  const scene = buildCamera();
  engine.setLocalPosition(scene.rig, 3, 4, 5);
  scene.graph.update();
  scene.camera.update();

  const product = new Matrix4().multiplyMatrices(
    scene.camera.viewMatrix,
    scene.cameraNode.worldMatrix,
  );
  const identity = new Matrix4();
  for (let i = 0; i < 16; i += 1) {
    assertClose(product.elements[i], identity.elements[i], `элемент ${i}`);
  }
});

test('a point straight ahead lands in the centre of the image', () => {
  const scene = buildCamera();
  scene.graph.update();
  scene.camera.update();

  // Камера смотрит вдоль -z, поэтому точка перед ней имеет отрицательную z.
  const { ndc } = project(scene, 0, 0, -10);
  assertClose(ndc.x, 0, 'x в NDC');
  assertClose(ndc.y, 0, 'y в NDC');

  const screen = new Vector3();
  engine.ndcToScreen(ndc, WIDTH_PX, HEIGHT_PX, screen);
  assertClose(screen.x, WIDTH_PX / 2, 'x в пикселях');
  assertClose(screen.y, HEIGHT_PX / 2, 'y в пикселях');
});

test('the near and far planes map to the ends of the webgl depth range', () => {
  const scene = buildCamera();
  scene.graph.update();
  scene.camera.update();

  assertClose(project(scene, 0, 0, -NEAR).ndc.z, -1, 'ближняя плоскость', 1e-5);
  assertClose(project(scene, 0, 0, -FAR).ndc.z, 1, 'дальняя плоскость', 1e-5);
});

test('the perspective divide makes distant objects smaller', () => {
  const scene = buildCamera();
  scene.graph.update();
  scene.camera.update();

  const near = project(scene, 1, 0, -5);
  const far = project(scene, 1, 0, -50);

  assert.ok(
    Math.abs(far.ndc.x) < Math.abs(near.ndc.x),
    `дальняя точка должна быть ближе к центру: ${far.ndc.x} против ${near.ndc.x}`,
  );
  // Смещение в NDC падает во столько же раз, во сколько выросло расстояние.
  assertClose(near.ndc.x / far.ndc.x, 10, 'отношение смещений', 1e-5);
});

test('the clip w coordinate carries the camera space depth', () => {
  const scene = buildCamera();
  scene.graph.update();
  scene.camera.update();

  assertClose(project(scene, 0, 0, -7).clip.w, 7, 'w на расстоянии семь');
  assertClose(project(scene, 0, 0, -42).clip.w, 42, 'w на расстоянии сорок два');
});

test('points outside the view volume are rejected before the divide', () => {
  const scene = buildCamera();
  scene.graph.update();
  scene.camera.update();

  const inside = project(scene, 0, 0, -10).clip;
  const behind = project(scene, 0, 0, 10).clip;
  const tooFar = project(scene, 0, 0, -(FAR + 1)).clip;
  const offToTheSide = project(scene, 100, 0, -1).clip;

  assert.equal(engine.isInsideViewVolume(inside), true, 'точка перед камерой');
  assert.equal(engine.isInsideViewVolume(behind), false, 'точка за камерой');
  assert.equal(engine.isInsideViewVolume(tooFar), false, 'точка за дальней плоскостью');
  assert.equal(engine.isInsideViewVolume(offToTheSide), false, 'точка сбоку');
});

test('the ndc corners map to the corners of the viewport', () => {
  const topLeft = new Vector3();
  const bottomRight = new Vector3();
  engine.ndcToScreen(new Vector3(-1, 1, 0), WIDTH_PX, HEIGHT_PX, topLeft);
  engine.ndcToScreen(new Vector3(1, -1, 0), WIDTH_PX, HEIGHT_PX, bottomRight);

  assertClose(topLeft.x, 0, 'левый верхний угол, x');
  assertClose(topLeft.y, 0, 'левый верхний угол, y');
  assertClose(bottomRight.x, WIDTH_PX, 'правый нижний угол, x');
  assertClose(bottomRight.y, HEIGHT_PX, 'правый нижний угол, y');
});

test('moving the camera parent moves the view', () => {
  const scene = buildCamera();
  scene.graph.update();
  scene.camera.update();
  const before = project(scene, 0, 0, -10).ndc.x;

  engine.setLocalPosition(scene.rig, 2, 0, 0);
  scene.graph.update();
  scene.camera.update();
  const after = project(scene, 0, 0, -10).ndc.x;

  assertClose(before, 0, 'до сдвига точка была в центре');
  assert.ok(after < -EPSILON, `после сдвига камеры вправо точка ушла влево: ${after}`);
});

test('the field of view sets the edge of the image', () => {
  const scene = buildCamera();
  scene.graph.update();
  scene.camera.update();

  // Точка ровно на верхней границе поля зрения на расстоянии десяти единиц.
  const halfHeight = 10 * Math.tan(FOV_Y / 2);
  assertClose(project(scene, 0, halfHeight, -10).ndc.y, 1, 'верхняя граница кадра', 1e-5);
  assertClose(project(scene, 0, -halfHeight, -10).ndc.y, -1, 'нижняя граница кадра', 1e-5);
});

// Мост к three.js: единственное место движка, которое знает про WebGLRenderer.
// Это подсистема **над** ядром, а не его часть — ядро её не импортирует и
// работает без неё (проверки слоя 3 гоняют движок в Node, где рендерера нет).
// Полноценный слой рендера — блок III; здесь ровно столько, сколько нужно,
// чтобы контрольная точка нарисовала кадр.

import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { Object3D } from 'three';
import { resolveDrawingBuffer } from '../engine/index.ts';
import type { Camera, DrawingBuffer, Subsystem } from '../engine/index.ts';

export interface ViewOptions {
  readonly canvas: HTMLCanvasElement;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly clearColor: number;
}

/** Счётчики слоя 1, снятые с рендерера. */
export interface ViewInfo {
  calls: number;
  triangles: number;
  frame: number;
  geometries: number;
  textures: number;
  programs: number;
}

export interface View extends Subsystem {
  readonly scene: Scene;
  /** Размер буфера рисования, посчитанный по правилам главы 1. */
  readonly buffer: DrawingBuffer;
  readonly ready: boolean;
  add(object: Object3D): void;
  /** Отрисовать сцену камерой движка. Матрицы берутся у камеры, а не у three. */
  render(camera: Camera): void;
  info(): ViewInfo;
  /** Прочитать пиксель буфера рисования: цвет — самая дешёвая проверка кадра. */
  readPixel(x: number, y: number, out: Uint8Array): Uint8Array;
}

const EMPTY_INFO: ViewInfo = {
  calls: 0,
  triangles: 0,
  frame: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
};

export function createView(options: ViewOptions): View {
  const buffer = resolveDrawingBuffer({
    cssWidth: options.cssWidth,
    cssHeight: options.cssHeight,
    devicePixelRatio: options.devicePixelRatio,
  });

  const scene = new Scene();
  scene.background = new Color(options.clearColor);
  // Обход матриц у three выключен: мировые матрицы считает граф сцены движка,
  // и второй обход был бы той же работой второй раз (Р3.3).
  scene.matrixWorldAutoUpdate = false;

  // Камера three — приёмник матриц, а не источник: собственных положения
  // и поворота у неё нет, они приезжают из узла графа сцены.
  const renderCamera = new PerspectiveCamera();
  renderCamera.matrixAutoUpdate = false;
  renderCamera.matrixWorldAutoUpdate = false;

  // Рендерер появляется в start() и исчезает в stop(): контекст WebGL —
  // ресурс операционной системы, а не поле объекта (E1-I, 6.1).
  let renderer: WebGLRenderer | null = null;

  return {
    name: 'view',
    scene,
    buffer,

    get ready() {
      return renderer !== null;
    },

    start() {
      if (renderer !== null) return;
      renderer = new WebGLRenderer({ canvas: options.canvas, antialias: false });
      renderer.setPixelRatio(buffer.pixelRatio);
      renderer.setSize(options.cssWidth, options.cssHeight);
    },

    stop() {
      if (renderer === null) return;
      renderer.dispose();
      renderer = null;
    },

    add(object) {
      scene.add(object);
    },

    render(camera) {
      if (renderer === null) {
        throw new Error('view: render() before start()');
      }
      renderCamera.matrixWorld.copy(camera.node.worldMatrix);
      renderCamera.matrixWorldInverse.copy(camera.viewMatrix);
      renderCamera.projectionMatrix.copy(camera.projectionMatrix);
      renderCamera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      renderer.render(scene, renderCamera);
    },

    info() {
      if (renderer === null) return EMPTY_INFO;
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        frame: renderer.info.render.frame,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
      };
    },

    readPixel(x, y, out) {
      if (renderer === null) {
        throw new Error('view: readPixel() before start()');
      }
      const gl = renderer.getContext();
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    },
  };
}

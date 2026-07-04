precision mediump float;

in vec2 vUv;

uniform float uTime;

out vec4 outColor;

void main() {
  outColor = vec4(vUv, abs(sin(uTime)), 1.0);
}

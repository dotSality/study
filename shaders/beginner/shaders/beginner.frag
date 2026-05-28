#version 300 es

precision mediump float;

in vec2 vTexCoord;

uniform float uTime;

out vec4 outColor;

void main() {
  outColor = vec4(vec3(vTexCoord * (abs(sin(uTime) / cos(uTime))), 1.0), 1.0);
}

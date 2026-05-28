#!/usr/bin/env bash
set -e

if [ -z "$1" ]; then
  echo "usage: ./run.sh <file.c> [args...]"
  exit 1
fi

src="$1"; shift
out="${src%.c}"

clang -std=c17 -g -Wall -Wextra -fsanitize=address "$src" -o "$out"
"$out" "$@"
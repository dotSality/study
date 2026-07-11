# Tech stack

Контент — Markdown (русский). Код книг — C и Rust; верификация двумя контурами:

- **Windows (эталон для C)**: GCC 15.2.0 MinGW-w64 (scoop), `-std=c17 -Wall -Wextra`. LLP64: `int`=4, `long`=4, `long long`=8. ASan/UBSan под MinGW **не линкуются** (libasan/libubsan нет); работает только `-fsanitize=undefined -fsanitize-trap=undefined` (крах без отчёта).
- **WSL1 Ubuntu-24.04** (WSL2 недоступен — виртуализация выключена в BIOS): gcc 13.3.0, clang 18.1.3, valgrind 3.22.0, make 4.3, rustc 1.75 (apt). Санитайзеры (ASan/UBSan/TSan) и valgrind — только здесь. Файлы Windows видны как `/mnt/c/...`; N3220 PDF лежит в `/root/n3220.pdf`.
- **GNU Make 4.4.1** на Windows (scoop, ezwinports) — работает из Git Bash.
- Node.js — verify-скрипты линалгебра-книги.
- Rust на Windows (эталон для тома II, установлен 2026-07-11): **rustup, rustc/cargo 1.97.0 stable, host `x86_64-pc-windows-gnu`** (MSVC Build Tools на машине нет; gnu-тулчейн самодостаточен). `~/.cargo/bin` в PATH новых терминалов; в сессиях агента добавлять `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`. rustc 1.75 (apt, WSL) — запасной контур.

Детали и история настройки — журнал §10 в `books/c-and-rust-book/C-and-Rust-learning.md`.
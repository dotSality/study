# Suggested commands

- Git Bash (инструмент Bash) **не видит `gcc` на PATH** — полный путь: `/c/Users/Max/scoop/apps/gcc/current/bin/gcc.exe` (в PowerShell `gcc` доступен). Эталонная сборка C: `gcc -std=c17 -Wall -Wextra`.
- stdin в тестируемую программу: `printf '7 4\n' | ./prog.exe`.
- WSL из агента: `wsl -d Ubuntu-24.04 -u root bash -c '...'`. Многострочные heredoc в Bash-инструменте и в `wsl bash -c` **ломаются** (кавычки/CRLF) — писать скрипт инструментом Write, затем `tr -d '\r' < script > /root/s.sh && bash /root/s.sh`.
- make из Git Bash на Windows: `export PATH="/c/Users/Max/scoop/apps/gcc/current/bin:$PATH"`; цель Makefile должна называться `app.exe`, иначе make перелинковывает вечно.
- Верификация линалгебра-книги: `node books/linear-algebra/tests/verify_*.js` (3 скрипта, ~190 ассертов).
- `run-c.sh` — только WSL (clang+ASan, под MinGW не работает).
- Коммит захода книги: `book(c-rust): ch NN <slug> — <chapter|revision|solutions|check>`, тело 1–3 строки сути (без поблочного перечисления — договорённость 2026-07-05).
- Автопроверка покрытия решений: собрать все ID `ГN.ЧM.Зk` grep-ом из chapters/ и solutions/, сравнить множества.
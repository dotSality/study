# Suggested commands

- Git Bash (инструмент Bash) **не видит `gcc` на PATH** — полный путь: `/c/Users/Max/scoop/apps/gcc/current/bin/gcc.exe` (в PowerShell `gcc` доступен). Эталонная сборка C: `gcc -std=c17 -Wall -Wextra`.
- stdin в тестируемую программу: `printf '7 4\n' | ./prog.exe`.
- WSL из агента: `wsl -d Ubuntu-24.04 -u root bash -c '...'`. Многострочные heredoc в Bash-инструменте и в `wsl bash -c` **ломаются** (кавычки/CRLF) — писать скрипт инструментом Write, затем `tr -d '\r' < script > /root/s.sh && bash /root/s.sh`.
- make из Git Bash на Windows: `export PATH="/c/Users/Max/scoop/apps/gcc/current/bin:$PATH"`; цель Makefile должна называться `app.exe`, иначе make перелинковывает вечно.
- Верификация линалгебра-книги: `node books/linear-algebra/tests/verify_*.js` (3 скрипта, ~190 ассертов).
- `run-c.sh` — только WSL (clang+ASan, под MinGW не работает).
- Коммит захода книги: `book(c-rust): ch NN <slug> — <chapter|revision|solutions|check>`, тело 1–3 строки сути (без поблочного перечисления — договорённость 2026-07-05).
- Коммит захода asm-книги: `book(asm): <этап N | ch NN <slug>> — <суть>` (образцы — `git log books/asm-book`).
- Пакетная проверка ссылок реестра источников (asm-книга, `sources.md`): вытащить URL node-ом из `<...>` и прогнать циклом `curl -sS -o /dev/null -w '%{http_code}' -L --max-time 35 "$u"`. **`intel.com`, `developer.apple.com` и `learn.microsoft.com` сетевой слой агента не пускает** — curl отдаёт `000` / ошибку 43; страницы при этом живые и читаются инструментом WebFetch. Битыми их не считать и из реестра не удалять.
- Документация Apple — SPA: обычная загрузка отдаёт только заголовок, читаемый текст лежит по адресу `https://developer.apple.com/tutorials/data/documentation/<путь>.json`.
- Реквизиты PDF-спецификаций (версия, дата на титуле) проверяются `pdftotext -f 1 -l 1 file.pdf -` — так подтверждены psABI 1.0 и номер сборки Intel SDM.
- Файлы asm-книги — **CRLF** (как главы C-книги): после Write/Edit нормализовать node-скриптом `s.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n')` и убедиться, что одиночных LF ноль.
- Автопроверка покрытия решений: собрать все ID `ГN.ЧM.Зk` grep-ом из chapters/ и solutions/, сравнить множества.
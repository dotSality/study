# c-rust-book-progress

Состояние на 2026-07-12 (заход главы 16 завершён):

- Том I: главы 1–13 написаны, ревизия тома I выполнена (2026-07-11). Решения (этап 5) не начаты.
- Том II: главы 14–16 написаны и верифицированы. **Глава 16 `16-structs-enums` (структуры/enum/match/Option) закрыта 2026-07-12**: 2 части, 7 параграфов, 20 заданий, 48 прогонов на эталоне rustc 1.97 (Windows gnu). Детали захода — журнал §10 `C-and-Rust-learning.md`, запись 2026-07-12 (вторая).
- Окружение тома II: rustup на Windows, host `x86_64-pc-windows-gnu`, rustc/cargo **1.97.0 stable**, издание 2024; rustc доступен код-агенту прямо в Git Bash (`rustc file.rs`); WSL rustc 1.75 — запасной контур.
- **Следующая клетка: глава 17 `17-collections-strings` (этап 3).** Параллельно допустимы решения тома I (этап 5, главы 1→13 по порядку).
- Введено к концу гл. 16 (можно свободно использовать дальше): struct/tuple struct/unit struct, impl/методы/ассоциированные функции, `#[derive(Debug, Clone, Copy)]`, `{:?}`/`{:#?}`/`dbg!`, `format!`, enum с данными, match (+исчерпывающесть/уловители), Option (unwrap/expect/unwrap_or), if let / let else. НЕ введено: Vec/HashMap/UTF-8-строки/while let (гл. 17), Result (гл. 18), трейты/лайфтаймы/дженерики/PartialEq (гл. 19), итераторы/замыкания (гл. 21), `as` систематически.
- Нюансы 1.97 для будущих глав (дополнительно к записи гл. 15): (1) E0382 на структуре без Clone даёт note «consider implementing `Clone` for this type»; (2) dead_code-warning «fields are never read», если поля читаются только derive(Debug)-печатью — в примеры добавлять прямое чтение полей; (3) явный дискриминант при non-unit вариантах — E0732.
- Верификация источников: R4 (O'Reilly) отдаёт 403 WebFetch-у — цитировать по outline, покрывать R1/R6/R7/R9. У R6 (Comprehensive Rust) URL-структура меняется: страница структур — `user-defined-types/named-structs.html` (structs.html — 404).

Источник истины — трекер §7 и журнал §10 в `books/c-and-rust-book/C-and-Rust-learning.md` + git-история; эта память — только указатель для быстрого входа в заход.
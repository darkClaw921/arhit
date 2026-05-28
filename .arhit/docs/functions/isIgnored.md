# isIgnored

Хелпер src/analyzer/ignore.ts. Посегментный матчинг игнорируемых путей (rel.split(path.sep)) вместо подстрочного rel.includes(p). Устраняет ложные срабатывания generic-имён: 'dist' больше не ловит src/distance.ts, 'out' не ловит layout.tsx. Формы паттернов: имя сегмента (node_modules, .next), glob по расширению (*.egg-info), путь с разделителем (src/generated) — для последнего сохранено старое подстрочное поведение ради обратной совместимости пользовательских конфигов. Используется в findSourceFiles (scanner.ts) и findPythonFiles (python-scanner.ts).

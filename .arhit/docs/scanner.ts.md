# scanner.ts

**Type:** file  
**Path:** src/analyzer/scanner.ts  
**Updated:** 2026-03-30T18:21:14.640Z

Движок AST-анализа для TypeScript/JavaScript. Использует ts-morph для парсинга. createProject — создаёт проект из исходных путей. buildArchNodes — извлекает функции, классы, интерфейсы, типы, перечисления, переменные. buildDependencies — строит граф зависимостей (импорты, вызовы, наследование).

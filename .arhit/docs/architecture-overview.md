# Обзор архитектуры arhit

## Слои системы

### 1. CLI-слой (cli.ts)
Точка входа. Commander.js регистрирует все команды и обрабатывает аргументы.
Глобальный флаг `-H` переключает режим вывода (JSON для агентов / текст для людей).

### 2. Слой команд (commands/)
Каждая команда — отдельный файл:
- **start.ts** — инициализация проекта, автоопределение стека
- **onboarding.ts** — интерактивная настройка
- **arch.ts** — построение и отображение архитектуры
- **analyze.ts** — анализ зависимостей
- **doc.ts** — система документации
- **ui.ts** — веб-интерфейс

### 3. Слой анализа (analyzer/)
Два движка:
- **scanner.ts** — AST-анализ TypeScript/JavaScript через ts-morph
- **python-scanner.ts** — regex-анализ Python (без зависимостей)

Выбор движка автоматический по полю `language` в конфиге.

### 4. Слой форматирования (formatters/)
Четыре формата вывода: JSON, ASCII-дерево, Mermaid, Graphviz DOT.

### 5. Слой хранения (storage.ts)
Все данные в `.arhit/` — JSON и Markdown, git-friendly.

### 6. Веб-интерфейс (ui.ts)
Встроенный HTTP-сервер с SPA. Запускается в фоне через daemon-процесс.
API: /api/architecture, /api/dependencies, /api/docs, /api/mermaid.

## Типы данных
Определены в types.ts: ArhitConfig, ArchNode, Architecture, Dependency, DependencyMap, DocEntry.

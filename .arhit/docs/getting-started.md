# Начало работы с arhit

## Шаг 1. Установка
```bash
npm install -g arhit
```

## Шаг 2. Инициализация
```bash
cd /path/to/your/project
arhit start
```
Arhit автоматически определит язык и фреймворк, создаст `.arhit/` и добавит инструкции в CLAUDE.md.

## Шаг 3. Построение архитектуры
```bash
arhit arch build
arhit -H arch show
```

## Шаг 4. Анализ зависимостей
```bash
arhit analyze
arhit -H deps МояФункция
arhit -H calls МояФункция
arhit -H map --format mermaid
```

## Шаг 5. Документирование
```bash
arhit doc add МояФункция --content "Обрабатывает запросы пользователей"
arhit -H doc list
```

## Шаг 6. Веб-интерфейс
```bash
arhit ui start --port 3000
# Откройте http://localhost:3000
arhit ui stop
```

## Шаг 7. Настройка
```bash
arhit -H onboarding
```
Позволяет изменить пути к исходникам, паттерны игнорирования и другие параметры.

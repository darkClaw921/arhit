# Руководство для ИИ-агентов

## Обзор
arhit предоставляет машинно-читаемый API для исследования кодовой базы.
По умолчанию все команды выводят JSON.

## Рабочий процесс агента

### 1. Инициализация (однократно)
```bash
arhit start
```

### 2. Перед изменением кода
```bash
arhit arch build && arhit analyze
arhit deps <элемент>    # Проверить, кто зависит от элемента
arhit calls <элемент>   # Проверить, что элемент вызывает
```

### 3. После изменения кода
```bash
arhit arch build && arhit analyze    # Обновить данные
arhit doc add <элемент> --content "Описание изменений"
```

### 4. Исследование архитектуры
```bash
arhit arch show                      # Полный граф (JSON)
arhit arch show src/commands         # Фильтр по пути
arhit map --format json              # Карта зависимостей
```

### 5. Поиск документации
```bash
arhit doc list                       # Все документы
arhit doc search запрос              # Поиск
arhit doc show элемент               # Конкретный документ
```

## Форматы ответов
Все команды возвращают JSON с полем `status` для отслеживания результата:
- `{"status": "built", "files": 14, "elements": 51}`
- `{"status": "analyzed", "total": 428}`
- `{"status": "added", "element": "myFunc"}`

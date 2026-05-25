import fs from 'node:fs';
import path from 'node:path';
import { ensureArhitDir, configPath, writeJson, isInitialized } from '../storage.js';
import type { ArhitConfig } from '../types.js';

const ARHIT_CLAUDE_SECTION = `
# Arhit — Инструмент архитектуры и документации

В этом проекте используется \`arhit\` — CLI для работы с архитектурой и документацией кода.
Все данные хранятся в \`.arhit/\` (JSON + Markdown), добавлены в git.

## Как использовать

### Перед началом работы с кодом
\`\`\`bash
arhit context       # Получить полный контекст проекта (рекомендуется в начале сессии)
arhit arch build    # Построить/обновить граф архитектуры
arhit analyze       # Проанализировать зависимости
\`\`\`

### Исследование кодовой базы
\`\`\`bash
arhit search <запрос>              # Fuzzy-поиск по коду И докам (терпит опечатки) — начни отсюда
arhit explain <элемент>            # Всё об элементе разом: путь:строка, сигнатура, вызовы, зависимые, доки
arhit arch show                    # Показать архитектуру (JSON для агента)
arhit arch show --format tree      # Дерево архитектуры
arhit deps <элемент>               # Что зависит от элемента
arhit calls <элемент>              # Что элемент вызывает
arhit map --format mermaid         # Карта взаимодействий
\`\`\`

### Документирование изменений
\`\`\`bash
arhit doc add <элемент> --content "Описание"   # Задокументировать элемент
arhit doc show <элемент>                        # Прочитать документацию
arhit doc list                                  # Все задокументированные элементы
arhit doc search <запрос>                       # Fuzzy-поиск по докам (element, content, path, aliases)
arhit doc create <имя> --content "..."          # Свободная страница
arhit doc alias <элемент> <алиас>              # Добавить поисковый алиас к существующей записи
arhit doc coverage                              # Какие публичные элементы ещё не задокументированы
arhit doc stale                                 # Доки, устаревшие или указывающие на удалённый код
arhit arch build --seed-docs                    # Засеять доки из JSDoc/docstring исходников
\`\`\`

## Правила для агента

### Исследование кодовой базы — ТОЛЬКО через arhit
- **НЕ используй Explore-агентов и массовый Grep/Glob для исследования структуры проекта.** Вместо этого используй команды \`arhit\`:
  - Найти что-либо по теме/имени → \`arhit search <запрос>\` (fuzzy, по коду и докам — первый шаг разведки)
  - Всё об элементе одним вызовом → \`arhit explain <элемент>\` (путь:строка, сигнатура, вызовы, зависимые, доки)
  - Структура и архитектура → \`arhit arch show\` / \`arhit arch show --format tree\`
  - Зависимости элемента → \`arhit deps <элемент>\`
  - Что вызывает элемент → \`arhit calls <элемент>\`
  - Карта взаимодействий → \`arhit map --format mermaid\`
  - Поиск по документации → \`arhit doc search <запрос>\`
  - Контекст проекта → \`arhit context\`
- Explore-агент и subagent_type=Explore допустимы **только** если arhit не содержит нужной информации (например, поиск конкретной строки в коде). В этом случае сначала проверь \`arhit search\`, и только потом переходи к прямому поиску.

### Документирование — ОБЯЗАТЕЛЬНО
- **Документируй ВСЮ разработку.** Каждое изменение в коде должно быть отражено в документации.
- При добавлении нового файла/функции/класса — сразу добавь документацию через \`arhit doc add\`
- При изменении существующего кода — обнови документацию: \`arhit doc add <элемент> --content "новое описание"\`
- При крупных изменениях (рефакторинг, новая фича, архитектурное решение) — создай страницу: \`arhit doc create <имя> --content "описание изменений"\`
- **Документация должна быть ИСЧЕРПЫВАЮЩЕЙ**, а не одно предложение. Для каждого элемента описывай:
  - Что делает элемент и зачем он нужен
  - Ключевые функции/методы и их параметры
  - Зависимости и связи с другими элементами
  - Примеры использования (если применимо)
  - Бизнес-логику и ограничения

### Обновление архитектуры
- После ЛЮБОГО изменения кода запусти \`arhit arch build && arhit analyze\` чтобы обновить данные
- Перед крупными изменениями проверь зависимости через \`arhit deps\` и \`arhit calls\`

### Алиасы документации
Поиск (\`arhit search\` / \`arhit doc search\`) теперь fuzzy и терпит опечатки и формы слов,
поэтому алиасы нужны реже. Но если запрос всё же ничего не нашёл — после выполнения задачи
закрепи его алиасом, чтобы будущие поиски по той же формулировке точно срабатывали:
\`\`\`bash
# Привязать запрос к существующей записи
arhit doc alias <существующий-элемент> "<запрос>"

# Или создать новую запись и добавить алиас
arhit doc add <элемент> --content "..."
arhit doc alias <элемент> "<запрос>"
\`\`\`

### Прочие правила
- Не редактируй файлы в \`.arhit/\` напрямую — используй команды CLI
- По умолчанию вывод в JSON (для агента), флаг \`-H\` для человеко-читаемого формата
`;

const ARHIT_MARKER_START = '<!-- arhit:start -->';
const ARHIT_MARKER_END = '<!-- arhit:end -->';

function findClaudeMd(): string {
  // Check .claude/CLAUDE.md first, then root CLAUDE.md
  const dotClaudePath = path.join(process.cwd(), '.claude', 'CLAUDE.md');
  if (fs.existsSync(dotClaudePath)) return dotClaudePath;

  const rootPath = path.join(process.cwd(), 'CLAUDE.md');
  if (fs.existsSync(rootPath)) return rootPath;

  // Neither exists — create in root
  return rootPath;
}

function buildClaudeSection(): string {
  return `${ARHIT_MARKER_START}\n${ARHIT_CLAUDE_SECTION}\n${ARHIT_MARKER_END}`;
}

function generateClaudeAgent(): void {
  const claudeMdPath = findClaudeMd();
  const section = buildClaudeSection();

  if (fs.existsSync(claudeMdPath)) {
    const existing = fs.readFileSync(claudeMdPath, 'utf-8');
    if (existing.includes(ARHIT_MARKER_START)) {
      const updated = existing.replace(
        new RegExp(`${ARHIT_MARKER_START}[\\s\\S]*?${ARHIT_MARKER_END}`),
        section
      );
      fs.writeFileSync(claudeMdPath, updated);
    } else {
      fs.writeFileSync(claudeMdPath, existing.trimEnd() + '\n\n' + section + '\n');
    }
  } else {
    fs.writeFileSync(claudeMdPath, section + '\n');
  }
}

export type ClaudeSyncResult = 'created' | 'updated' | 'unchanged' | 'absent';

/**
 * Синхронизирует блок инструкций arhit во ВСЕХ существующих CLAUDE.md проекта
 * (и `./CLAUDE.md`, и `.claude/CLAUDE.md` — оба читаются агентом как инструкции).
 *
 * Обновляет блок между маркерами, ТОЛЬКО если он уже присутствует — чтобы при
 * выходе новой версии arhit устаревшие инструкции автоматически подтягивались.
 * Никогда не создаёт файл и не добавляет блок, которого не было (не навязывает
 * секцию проектам/пользователям, которые её удалили). Идемпотентна: если блок
 * актуален, файл не трогается.
 *
 * Итоговый result: 'updated', если хотя бы один файл реально обновлён;
 * иначе 'unchanged', если блок где-то найден, но уже актуален; иначе 'absent'.
 */
export function syncClaudeSection(): { result: ClaudeSyncResult; paths: string[] } {
  const candidates = [
    path.join(process.cwd(), 'CLAUDE.md'),
    path.join(process.cwd(), '.claude', 'CLAUDE.md'),
  ];
  const section = buildClaudeSection();
  const updatedPaths: string[] = [];
  let foundBlock = false;

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const existing = fs.readFileSync(p, 'utf-8');
    if (!existing.includes(ARHIT_MARKER_START)) continue;
    foundBlock = true;

    const updated = existing.replace(
      new RegExp(`${ARHIT_MARKER_START}[\\s\\S]*?${ARHIT_MARKER_END}`),
      section
    );
    if (updated !== existing) {
      fs.writeFileSync(p, updated);
      updatedPaths.push(p);
    }
  }

  if (updatedPaths.length > 0) return { result: 'updated', paths: updatedPaths };
  if (foundBlock) return { result: 'unchanged', paths: [] };
  return { result: 'absent', paths: [] };
}

export function startCommand(options: { human?: boolean }) {
  if (isInitialized()) {
    // Проект уже инициализирован — но блок инструкций в CLAUDE.md мог устареть.
    // Подтянем его до актуальной версии, если он там есть.
    const sync = syncClaudeSection();
    if (options.human) {
      if (sync.result === 'updated') {
        console.log(`Already initialized. Обновлён блок инструкций arhit в: ${sync.paths.join(', ')}.`);
      } else {
        console.log('Already initialized. Run `arhit onboarding` to reconfigure.');
      }
    } else {
      console.log(JSON.stringify({ status: 'already_initialized', claudeMd: sync.result }));
    }
    return;
  }

  ensureArhitDir();

  // Auto-detect language
  let language = 'unknown';
  let framework: string | undefined;
  if (fs.existsSync('tsconfig.json')) language = 'typescript';
  else if (fs.existsSync('package.json')) language = 'javascript';
  else if (fs.existsSync('Cargo.toml')) language = 'rust';
  else if (fs.existsSync('go.mod')) language = 'go';
  else if (fs.existsSync('requirements.txt') || fs.existsSync('pyproject.toml')) language = 'python';

  // Detect framework
  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps['next']) framework = 'next.js';
      else if (allDeps['react']) framework = 'react';
      else if (allDeps['vue']) framework = 'vue';
      else if (allDeps['express']) framework = 'express';
      else if (allDeps['fastify']) framework = 'fastify';
    } catch {}
  }

  const sourcePaths = ['src'];
  if (!fs.existsSync('src')) {
    sourcePaths[0] = '.';
  }

  const config: ArhitConfig = {
    name: path.basename(process.cwd()),
    sourcePaths,
    ignore: ['node_modules', 'dist', '.arhit', '.git', '.omc', '.venv', 'venv', '__pycache__', '.tox', '.mypy_cache', '.pytest_cache'],
    language,
    framework,
  };

  writeJson(configPath(), config);

  // Create CLAUDE.md agent instructions (append, never overwrite)
  generateClaudeAgent();

  if (options.human) {
    console.log(`Initialized .arhit/ in ${process.cwd()}`);
    console.log(`  Language: ${language}${framework ? ` (${framework})` : ''}`);
    console.log(`  Source:   ${sourcePaths.join(', ')}`);
    console.log('\nRun `arhit onboarding` to customize settings.');
  } else {
    console.log(JSON.stringify({ status: 'initialized', config }));
  }
}

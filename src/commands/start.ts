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
arhit arch build    # Построить/обновить граф архитектуры
arhit analyze       # Проанализировать зависимости
\`\`\`

### Исследование кодовой базы
\`\`\`bash
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
arhit doc search <запрос>                       # Поиск по документации
arhit doc create <имя> --content "..."          # Свободная страница
\`\`\`

## Правила для агента
- После изменения кода запусти \`arhit arch build && arhit analyze\` чтобы обновить данные
- Перед крупными изменениями проверь зависимости через \`arhit deps\` и \`arhit calls\`
- Документируй новые публичные функции/классы через \`arhit doc add\`
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

function generateClaudeAgent(): void {
  const claudeMdPath = findClaudeMd();
  const section = `${ARHIT_MARKER_START}\n${ARHIT_CLAUDE_SECTION}\n${ARHIT_MARKER_END}`;

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

export function startCommand(options: { human?: boolean }) {
  if (isInitialized()) {
    const msg = 'Already initialized. Run `arhit onboarding` to reconfigure.';
    if (options.human) {
      console.log(msg);
    } else {
      console.log(JSON.stringify({ status: 'already_initialized', message: msg }));
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
    ignore: ['node_modules', 'dist', '.arhit', '.git', '.omc'],
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

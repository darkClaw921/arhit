import fs from 'node:fs';
import path from 'node:path';
import { docsDir, readJson, architecturePath, readMarkdown, writeMarkdown } from '../storage.js';
import { formatJson } from '../formatters/index.js';
import { scoreMatch } from '../search/score.js';
import { getPublicApi } from './context.js';
import type { Architecture, DocEntry } from '../types.js';

const TYPE_DIRS: Record<string, string> = {
  file: 'files',
  function: 'functions',
  class: 'classes',
  interface: 'types',
  type: 'types',
  enum: 'types',
  variable: 'variables',
  module: 'modules',
  page: 'pages',
  unknown: 'other',
};

function typeDir(type: string): string {
  return TYPE_DIRS[type] || 'other';
}

const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.rb', '.php', '.vue', '.svelte', '.html', '.css', '.scss'];

function detectTypeFromElement(element: string): { type: string; path: string } {
  // Check if element looks like a file path (has a known extension)
  for (const ext of FILE_EXTENSIONS) {
    if (element.endsWith(ext)) {
      return { type: 'file', path: element };
    }
  }
  return { type: 'unknown', path: '' };
}

function docFilePath(element: string, type: string): string {
  const parts = element.split('/');
  const safeParts = parts.map(p => p.replace(/[^\p{L}\p{N}._-]/gu, '_'));
  const dir = path.join(docsDir(), typeDir(type));
  const filePath = path.join(dir, ...safeParts.slice(0, -1), `${safeParts[safeParts.length - 1]}.md`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return filePath;
}

// Search for doc file in categorized dirs, then fallback to flat (legacy)
export function findDocFile(element: string, type?: string): string | null {
  const parts = element.split('/');
  const safeParts = parts.map(p => p.replace(/[^\p{L}\p{N}._-]/gu, '_'));
  const nestedPath = path.join(...safeParts.slice(0, -1), `${safeParts[safeParts.length - 1]}.md`);
  const flatName = `${safeParts.join('_')}.md`;

  // If type known, check categorized path first (nested, then legacy flat)
  if (type) {
    const nested = path.join(docsDir(), typeDir(type), nestedPath);
    if (fs.existsSync(nested)) return nested;
    const flat = path.join(docsDir(), typeDir(type), flatName);
    if (fs.existsSync(flat)) return flat;
  }

  // Search all subdirs
  const base = docsDir();
  try {
    for (const dir of fs.readdirSync(base, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('_')) continue;
      const nested = path.join(base, dir.name, nestedPath);
      if (fs.existsSync(nested)) return nested;
      const flat = path.join(base, dir.name, flatName);
      if (fs.existsSync(flat)) return flat;
    }
  } catch {}

  // Legacy flat path in root docs dir
  const flat = path.join(base, flatName);
  if (fs.existsSync(flat)) return flat;

  return null;
}

export function indexPath(): string {
  return path.join(docsDir(), '_index.json');
}

export function loadIndex(): DocEntry[] {
  return readJson<DocEntry[]>(indexPath()) || [];
}

export function saveIndex(entries: DocEntry[]): void {
  fs.mkdirSync(docsDir(), { recursive: true });
  fs.writeFileSync(indexPath(), JSON.stringify(entries, null, 2) + '\n');
}

export function docAddCommand(element: string, options: { content?: string; human?: boolean }) {
  const content = options.content || '';
  if (!content) {
    if (options.human) {
      console.log('Provide content with --content "..."');
    } else {
      console.log(JSON.stringify({ error: 'content_required', message: 'Provide --content' }));
    }
    return;
  }

  // Try to find element in architecture
  const arch = readJson<Architecture>(architecturePath());
  let elementPath = '';
  let elementType = 'unknown';
  if (arch) {
    for (const node of arch.nodes) {
      if (node.name === element || node.id === element) {
        elementPath = node.path;
        elementType = node.type;
        break;
      }
      const child = node.children?.find(c => c.name === element || c.id === element);
      if (child) {
        elementPath = child.path;
        elementType = child.type;
        break;
      }
    }
  }

  // Auto-detect type from file extension if not found in architecture
  if (elementType === 'unknown') {
    const detected = detectTypeFromElement(element);
    elementType = detected.type;
    if (!elementPath) elementPath = detected.path;
  }

  const now = new Date().toISOString();
  const entry: DocEntry = {
    element,
    path: elementPath,
    type: elementType,
    content,
    createdAt: now,
    updatedAt: now,
  };

  // Update index
  const index = loadIndex();
  const existing = index.findIndex(e => e.element === element);
  if (existing >= 0) {
    entry.createdAt = index[existing].createdAt;
    // Remove old file if type changed
    const oldType = index[existing].type;
    if (oldType !== elementType) {
      const oldFile = findDocFile(element, oldType);
      if (oldFile) try { fs.unlinkSync(oldFile); } catch {}
    }
    index[existing] = entry;
  } else {
    index.push(entry);
  }
  saveIndex(index);

  // Write markdown file in categorized dir
  const filePath = docFilePath(element, elementType);
  const md = `# ${element}\n\n${content}\n`;
  writeMarkdown(filePath, md);

  if (options.human) {
    console.log(`Documentation ${existing >= 0 ? 'updated' : 'added'} for "${element}"`);
  } else {
    console.log(JSON.stringify({ status: existing >= 0 ? 'updated' : 'added', element }));
  }
}

export function docShowCommand(element: string, options: { human?: boolean }) {
  // Look up type from index for better search
  const index = loadIndex();
  const entry = index.find(e => e.element === element);
  const file = findDocFile(element, entry?.type);

  if (!file) {
    const msg = `No documentation found for "${element}"`;
    if (options.human) console.log(msg);
    else console.log(JSON.stringify({ error: 'not_found', element }));
    return;
  }

  const md = readMarkdown(file);
  if (options.human) {
    console.log(md);
  } else {
    console.log(JSON.stringify(entry || { element, content: md }));
  }
}

export function docListCommand(options: { human?: boolean }) {
  const index = loadIndex();

  if (options.human) {
    if (index.length === 0) {
      console.log('No documentation yet. Use `arhit doc add <element> --content "..."`');
      return;
    }

    // Group by type
    const groups: Record<string, DocEntry[]> = {};
    for (const entry of index) {
      const dir = typeDir(entry.type);
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(entry);
    }

    console.log(`Задокументировано элементов: ${index.length}\n`);
    for (const [group, entries] of Object.entries(groups).sort()) {
      console.log(`  ${group}/`);
      for (const entry of entries) {
        console.log(`    ${entry.element} [${entry.type}] — ${entry.path || 'свободная страница'}`);
      }
    }
  } else {
    console.log(formatJson(index));
  }
}

export function docCreateCommand(name: string, options: { content?: string; human?: boolean }) {
  const content = options.content || `# ${name}\n\nДобавьте документацию здесь.\n`;
  const filePath = docFilePath(name, 'page');
  writeMarkdown(filePath, content);

  // Add to index
  const now = new Date().toISOString();
  const index = loadIndex();
  const entry: DocEntry = { element: name, path: '', type: 'page', content, createdAt: now, updatedAt: now };
  const existing = index.findIndex(e => e.element === name);
  if (existing >= 0) { index[existing] = entry; } else { index.push(entry); }
  saveIndex(index);

  if (options.human) {
    console.log(`Created documentation page: ${filePath}`);
  } else {
    console.log(JSON.stringify({ status: 'created', path: filePath }));
  }
}

export function docSearchCommand(query: string, options: { human?: boolean }) {
  const index = loadIndex();

  // Ранжируем по релевантности: имя элемента и алиасы важнее пути/содержимого.
  // Fuzzy-скоринг ловит опечатки и синонимы — ручные алиасы больше не обязательны.
  const scored = index
    .map(e => {
      const nameScore = scoreMatch(query, e.element);
      const aliasScore = Math.max(0, ...(e.aliases || []).map(a => scoreMatch(query, a)));
      const pathScore = scoreMatch(query, e.path) * 0.7;
      const contentScore = scoreMatch(query, e.content) * 0.5;
      const score = Math.max(nameScore, aliasScore, pathScore, contentScore);
      return { entry: e, score };
    })
    .filter(x => x.score >= 0.3)
    .sort((a, b) => b.score - a.score);

  if (options.human) {
    if (scored.length === 0) {
      console.log(`No results for "${query}"`);
      return;
    }
    console.log(`Found ${scored.length} result(s) for "${query}":\n`);
    for (const { entry: m, score } of scored) {
      const aliasHint = m.aliases?.length ? ` (aliases: ${m.aliases.join(', ')})` : '';
      console.log(`  ${m.element} [${m.type}] — ${m.path || 'N/A'}${aliasHint}  (${score.toFixed(2)})`);
    }
  } else {
    console.log(formatJson(scored.map(x => ({ ...x.entry, score: Number(x.score.toFixed(3)) }))));
  }
}

export function docAliasCommand(element: string, alias: string, options: { human?: boolean }) {
  const index = loadIndex();
  const entry = index.find(e => e.element === element || e.aliases?.includes(element));

  if (!entry) {
    if (options.human) {
      console.log(`No documentation found for "${element}"`);
    } else {
      console.log(JSON.stringify({ error: 'not_found', element }));
    }
    return;
  }

  if (!entry.aliases) entry.aliases = [];

  if (entry.aliases.includes(alias)) {
    if (options.human) {
      console.log(`Alias "${alias}" already exists for "${entry.element}"`);
    } else {
      console.log(JSON.stringify({ status: 'already_exists', element: entry.element, alias }));
    }
    return;
  }

  entry.aliases.push(alias);
  entry.updatedAt = new Date().toISOString();
  saveIndex(index);

  if (options.human) {
    console.log(`Alias "${alias}" added to "${entry.element}"`);
  } else {
    console.log(JSON.stringify({ status: 'added', element: entry.element, alias }));
  }
}

/**
 * Засевает документацию из JSDoc/docstring, извлечённых при сборке архитектуры.
 * Создаёт записи с source:'auto' только для элементов с docComment, которые ещё
 * не задокументированы. Ручные записи (source:'manual' или без source) не трогаются.
 * Возвращает счётчики для отчёта.
 */
export function seedDocsFromArchitecture(arch: Architecture): { created: number; skipped: number } {
  const index = loadIndex();
  const byElement = new Map(index.map(e => [e.element, e]));
  let created = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const node of arch.nodes) {
    for (const child of node.children || []) {
      if (!child.docComment) continue;
      const existing = byElement.get(child.name);
      // не перезаписываем ручную документацию
      if (existing && existing.source !== 'auto') { skipped++; continue; }
      // авто-запись уже есть с тем же содержимым — пропускаем
      if (existing && existing.source === 'auto' && existing.content === child.docComment) { skipped++; continue; }

      const entry: DocEntry = {
        element: child.name,
        path: child.path,
        type: child.type,
        content: child.docComment,
        source: 'auto',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      byElement.set(child.name, entry);

      const filePath = docFilePath(child.name, child.type);
      writeMarkdown(filePath, `# ${child.name}\n\n${child.docComment}\n`);
      created++;
    }
  }

  saveIndex([...byElement.values()]);
  return { created, skipped };
}

/**
 * Покрытие документацией: какие элементы публичного API ещё не задокументированы.
 * Помогает агенту увидеть пробелы и понять, что документировать.
 */
export function docCoverageCommand(options: { human?: boolean }) {
  const arch = readJson<Architecture>(architecturePath());
  if (!arch) {
    const msg = 'No architecture data. Run `arhit arch build` first.';
    if (options.human) console.log(msg);
    else console.log(JSON.stringify({ error: 'no_architecture', message: msg }));
    return;
  }

  const api = getPublicApi(arch);
  const index = loadIndex();
  const documented = new Set(index.map(e => e.element));

  const undocumented = api.filter(a => !documented.has(a.name));
  const total = api.length;
  const covered = total - undocumented.length;
  const percent = total === 0 ? 100 : Math.round((covered / total) * 100);

  if (options.human) {
    console.log(`Покрытие документацией: ${covered}/${total} (${percent}%)`);
    if (undocumented.length > 0) {
      console.log(`\nНе задокументировано (${undocumented.length}):`);
      for (const a of undocumented) {
        console.log(`  ${a.type} ${a.name} — ${a.file}`);
      }
    }
  } else {
    console.log(formatJson({ total, covered, percent, undocumented }));
  }
}

/**
 * Устаревшая документация: записи, чей элемент удалён из архитектуры (orphaned),
 * либо чей исходный файл изменялся позже последнего обновления документации (outdated).
 * Защищает агента от доверия неактуальным докам.
 */
export function docStaleCommand(options: { human?: boolean }) {
  const arch = readJson<Architecture>(architecturePath());
  const index = loadIndex();

  // Множество известных элементов архитектуры (имена и id)
  const known = new Set<string>();
  if (arch) {
    for (const node of arch.nodes) {
      known.add(node.name);
      known.add(node.id);
      for (const child of node.children || []) {
        known.add(child.name);
        known.add(child.id);
      }
    }
  }

  const orphaned: { element: string; reason: string }[] = [];
  const outdated: { element: string; reason: string }[] = [];

  for (const e of index) {
    if (e.type === 'page') continue; // свободные страницы не привязаны к коду
    if (arch && !known.has(e.element)) {
      orphaned.push({ element: e.element, reason: 'элемент отсутствует в архитектуре' });
      continue;
    }
    if (e.path) {
      try {
        const mtime = fs.statSync(e.path).mtime.toISOString();
        if (mtime > e.updatedAt) {
          outdated.push({ element: e.element, reason: `код изменён ${mtime.split('T')[0]}, доку обновляли ${e.updatedAt.split('T')[0]}` });
        }
      } catch {
        orphaned.push({ element: e.element, reason: `файл не найден: ${e.path}` });
      }
    }
  }

  if (options.human) {
    if (orphaned.length === 0 && outdated.length === 0) {
      console.log('Вся документация актуальна.');
      return;
    }
    if (orphaned.length > 0) {
      console.log(`Осиротевшие (${orphaned.length}):`);
      for (const o of orphaned) console.log(`  ${o.element} — ${o.reason}`);
    }
    if (outdated.length > 0) {
      console.log(`\nУстаревшие (${outdated.length}):`);
      for (const o of outdated) console.log(`  ${o.element} — ${o.reason}`);
    }
  } else {
    console.log(formatJson({ orphaned, outdated }));
  }
}

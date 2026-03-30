import fs from 'node:fs';
import path from 'node:path';
import { docsDir, readJson, architecturePath, readMarkdown, writeMarkdown } from '../storage.js';
import { formatJson } from '../formatters/index.js';
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

function docFilePath(element: string, type: string): string {
  const safe = element.replace(/[^\p{L}\p{N}._-]/gu, '_');
  const dir = path.join(docsDir(), typeDir(type));
  return path.join(dir, `${safe}.md`);
}

// Search for doc file in categorized dirs, then fallback to flat (legacy)
function findDocFile(element: string, type?: string): string | null {
  const safe = element.replace(/[^\p{L}\p{N}._-]/gu, '_');

  // If type known, check categorized path first
  if (type) {
    const categorized = path.join(docsDir(), typeDir(type), `${safe}.md`);
    if (fs.existsSync(categorized)) return categorized;
  }

  // Search all subdirs
  const base = docsDir();
  try {
    for (const dir of fs.readdirSync(base, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('_')) continue;
      const candidate = path.join(base, dir.name, `${safe}.md`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}

  // Legacy flat path
  const flat = path.join(base, `${safe}.md`);
  if (fs.existsSync(flat)) return flat;

  return null;
}

function indexPath(): string {
  return path.join(docsDir(), '_index.json');
}

function loadIndex(): DocEntry[] {
  return readJson<DocEntry[]>(indexPath()) || [];
}

function saveIndex(entries: DocEntry[]): void {
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
  const md = `# ${element}\n\n**Тип:** ${elementType}  \n**Путь:** ${elementPath || 'N/A'}  \n**Обновлено:** ${now}\n\n${content}\n`;
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
  const q = query.toLowerCase();
  const matches = index.filter(e =>
    e.element.toLowerCase().includes(q) ||
    e.content.toLowerCase().includes(q) ||
    e.path.toLowerCase().includes(q)
  );

  if (options.human) {
    if (matches.length === 0) {
      console.log(`No results for "${query}"`);
      return;
    }
    console.log(`Found ${matches.length} result(s) for "${query}":\n`);
    for (const m of matches) {
      console.log(`  ${m.element} [${m.type}] — ${m.path || 'N/A'}`);
    }
  } else {
    console.log(formatJson(matches));
  }
}

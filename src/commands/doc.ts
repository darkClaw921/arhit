import fs from 'node:fs';
import path from 'node:path';
import { docsDir, readJson, architecturePath, readMarkdown, writeMarkdown } from '../storage.js';
import { formatJson } from '../formatters/index.js';
import type { Architecture, DocEntry } from '../types.js';

function docFilePath(element: string): string {
  const safe = element.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(docsDir(), `${safe}.md`);
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
    index[existing] = entry;
  } else {
    index.push(entry);
  }
  saveIndex(index);

  // Write markdown file
  const md = `# ${element}\n\n**Type:** ${elementType}  \n**Path:** ${elementPath || 'N/A'}  \n**Updated:** ${now}\n\n${content}\n`;
  writeMarkdown(docFilePath(element), md);

  if (options.human) {
    console.log(`Documentation ${existing >= 0 ? 'updated' : 'added'} for "${element}"`);
  } else {
    console.log(JSON.stringify({ status: existing >= 0 ? 'updated' : 'added', element }));
  }
}

export function docShowCommand(element: string, options: { human?: boolean }) {
  const md = readMarkdown(docFilePath(element));
  if (!md) {
    const msg = `No documentation found for "${element}"`;
    if (options.human) console.log(msg);
    else console.log(JSON.stringify({ error: 'not_found', element }));
    return;
  }

  if (options.human) {
    console.log(md);
  } else {
    const index = loadIndex();
    const entry = index.find(e => e.element === element);
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
    console.log(`Documented elements (${index.length}):\n`);
    for (const entry of index) {
      console.log(`  ${entry.element} [${entry.type}] — ${entry.path || 'N/A'}`);
    }
  } else {
    console.log(formatJson(index));
  }
}

export function docCreateCommand(name: string, options: { content?: string; human?: boolean }) {
  const content = options.content || `# ${name}\n\nAdd your documentation here.\n`;
  const filePath = path.join(docsDir(), `${name.replace(/[^a-zA-Z0-9._-]/g, '_')}.md`);
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

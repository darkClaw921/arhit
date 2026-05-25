import { readJson, architecturePath, readMarkdown } from '../storage.js';
import { loadDeps } from './analyze.js';
import { loadIndex, findDocFile } from './doc.js';
import { formatJson } from '../formatters/index.js';
import type { Architecture, ArchNode, Dependency } from '../types.js';

/**
 * Находит элемент архитектуры по имени или id (`file:name`).
 * Сначала ищет среди файлов, затем среди их дочерних элементов.
 */
function findNode(arch: Architecture, element: string): ArchNode | null {
  for (const node of arch.nodes) {
    if (node.name === element || node.id === element || node.path === element) return node;
  }
  for (const node of arch.nodes) {
    const child = node.children?.find(c => c.name === element || c.id === element);
    if (child) return child;
  }
  return null;
}

interface ExplainResult {
  element: string;
  type: string;
  location: string | null;
  signature?: string;
  exports?: string[];
  children?: { name: string; type: string; line?: number }[];
  calls: { to: string; type: string }[];
  dependents: { from: string; type: string }[];
  documentation: string | null;
}

export function explainCommand(element: string, options: { human?: boolean }) {
  const arch = readJson<Architecture>(architecturePath());
  if (!arch) {
    const msg = 'No architecture data. Run `arhit arch build` first.';
    if (options.human) console.log(msg);
    else console.log(JSON.stringify({ error: 'no_architecture', message: msg }));
    return;
  }

  const node = findNode(arch, element);
  const deps = (() => {
    try { return loadDeps(); } catch { return [] as Dependency[]; }
  })();

  // Точное сравнение по element-имени (без includes-шума прежних deps/calls)
  const calls = deps
    .filter(d => d.fromElement === element)
    .map(d => ({ to: d.toElement || d.to, type: d.type }));
  const dependents = deps
    .filter(d => d.toElement === element)
    .map(d => ({ from: d.fromElement || d.from, type: d.type }));

  // Документация
  const index = loadIndex();
  const docEntry = index.find(e => e.element === element || e.aliases?.includes(element));
  let documentation: string | null = null;
  const docFile = findDocFile(element, docEntry?.type);
  if (docFile) {
    documentation = readMarkdown(docFile);
  } else if (docEntry) {
    documentation = docEntry.content;
  }

  const result: ExplainResult = {
    element,
    type: node?.type || docEntry?.type || 'unknown',
    location: node?.path ? `${node.path}${node.line ? ':' + node.line : ''}` : (docEntry?.path || null),
    signature: node?.signature,
    exports: node?.exports?.length ? node.exports : undefined,
    children: node?.children?.map(c => ({ name: c.name, type: c.type, line: c.line })),
    calls,
    dependents,
    documentation,
  };

  if (!node && !docEntry && calls.length === 0 && dependents.length === 0) {
    if (options.human) console.log(`Nothing found for "${element}". Try \`arhit search ${element}\`.`);
    else console.log(JSON.stringify({ error: 'not_found', element }));
    return;
  }

  if (options.human) {
    printHuman(result);
  } else {
    console.log(formatJson(result));
  }
}

function printHuman(r: ExplainResult): void {
  console.log(`${r.element}  [${r.type}]`);
  if (r.location) console.log(`  → ${r.location}`);
  if (r.signature) console.log(`  signature: ${r.signature}`);
  if (r.exports?.length) console.log(`  exports: ${r.exports.join(', ')}`);

  if (r.children?.length) {
    console.log(`\n  Элементы (${r.children.length}):`);
    for (const c of r.children) {
      console.log(`    ${c.name} [${c.type}]${c.line ? ' :' + c.line : ''}`);
    }
  }

  if (r.calls.length) {
    console.log(`\n  Вызывает (${r.calls.length}):`);
    for (const c of r.calls.slice(0, 30)) console.log(`    --[${c.type}]--> ${c.to}`);
  }

  if (r.dependents.length) {
    console.log(`\n  Зависят от него (${r.dependents.length}):`);
    for (const d of r.dependents.slice(0, 30)) console.log(`    ${d.from} --[${d.type}]-->`);
  }

  if (r.documentation) {
    console.log(`\n  Документация:`);
    console.log(r.documentation.split('\n').map(l => '    ' + l).join('\n'));
  } else {
    console.log(`\n  Документация: нет. Добавьте: arhit doc add ${r.element} --content "..."`);
  }
}

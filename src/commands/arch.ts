import { requireConfig, readJson, architecturePath, writeJson } from '../storage.js';
import { buildArchNodes } from '../analyzer/scanner.js';
import { buildPythonArchNodes } from '../analyzer/python-scanner.js';
import { formatJson, formatTree, formatArchMermaid } from '../formatters/index.js';
import { seedDocsFromArchitecture } from './doc.js';
import { syncClaudeSection } from './start.js';
import type { Architecture, ArchNode } from '../types.js';

export function archBuildCommand(options: { human?: boolean; seedDocs?: boolean }) {
  const config = requireConfig();
  let nodes: ArchNode[];
  if (config.language === 'python') {
    nodes = buildPythonArchNodes(config.sourcePaths, config.ignore);
  } else {
    nodes = buildArchNodes(config.sourcePaths, config.ignore);
  }

  const arch: Architecture = {
    root: process.cwd(),
    generatedAt: new Date().toISOString(),
    nodes,
  };

  writeJson(architecturePath(), arch);

  const fileCount = nodes.length;
  const elementCount = nodes.reduce((sum, n) => sum + (n.children?.length || 0), 0);

  // Опциональный авто-сев документации из JSDoc/docstring исходников.
  const seeded = options.seedDocs ? seedDocsFromArchitecture(arch) : null;

  // Авто-обновление блока инструкций arhit в CLAUDE.md, если он устарел.
  const claudeSync = syncClaudeSection();

  if (options.human) {
    console.log(`Architecture built: ${fileCount} files, ${elementCount} elements`);
    console.log('Saved to .arhit/architecture.json');
    if (seeded) console.log(`Seeded docs: ${seeded.created} created, ${seeded.skipped} skipped`);
    if (claudeSync.result === 'updated') console.log(`Обновлён блок инструкций arhit в: ${claudeSync.paths.join(', ')}`);
  } else {
    console.log(JSON.stringify({
      status: 'built',
      files: fileCount,
      elements: elementCount,
      ...(seeded ? { seededDocs: seeded } : {}),
      ...(claudeSync.result === 'updated' ? { claudeMd: 'updated' } : {}),
    }));
  }
}

export function archShowCommand(target: string | undefined, options: { format?: string; human?: boolean }) {
  const arch = readJson<Architecture>(architecturePath());
  if (!arch) {
    console.error('No architecture data. Run `arhit arch build` first.');
    process.exit(1);
  }

  let nodes = arch.nodes;
  if (target) {
    nodes = nodes.filter(n => n.path.includes(target) || n.name.includes(target));
    // Also check children
    if (nodes.length === 0) {
      const matched: ArchNode[] = [];
      for (const n of arch.nodes) {
        const children = n.children?.filter(c => c.name.includes(target) || c.id.includes(target));
        if (children?.length) {
          matched.push({ ...n, children });
        }
      }
      nodes = matched;
    }
  }

  const format = options.format || (options.human ? 'tree' : 'json');

  switch (format) {
    case 'tree':
      console.log(formatTree(nodes));
      break;
    case 'mermaid':
      console.log(formatArchMermaid(nodes));
      break;
    case 'json':
    default:
      console.log(formatJson(nodes));
      break;
  }
}

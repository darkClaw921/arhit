import fs from 'node:fs';
import path from 'node:path';
import {
  isInitialized,
  readJson,
  configPath,
  architecturePath,
  dependenciesPath,
  docsDir,
} from '../storage.js';
import type { ArhitConfig, Architecture, DependencyMap, ArchNode, DocEntry } from '../types.js';

interface ContextBrief {
  project: {
    name: string;
    language: string;
    framework?: string;
    sourcePaths: string[];
  };
  architecture: {
    files: number;
    elements: number;
    generatedAt: string;
    topFiles: { path: string; elements: number }[];
  } | null;
  dependencies: {
    total: number;
    imports: number;
    calls: number;
    extends: number;
    implements: number;
    generatedAt: string;
    hotspots: { element: string; inbound: number; outbound: number }[];
  } | null;
  documentation: {
    total: number;
    byType: Record<string, number>;
    recent: { element: string; type: string; updatedAt: string }[];
  };
  entryPoints: string[];
  publicApi: { name: string; type: string; file: string }[];
}

function findEntryPoints(config: ArhitConfig, arch: Architecture | null): string[] {
  const entries: string[] = [];
  const candidates = ['index', 'main', 'app', 'cli', 'server', 'mod'];

  if (arch) {
    for (const node of arch.nodes) {
      const base = path.basename(node.name, path.extname(node.name));
      if (candidates.includes(base)) {
        entries.push(node.path);
      }
    }
  }

  // Check package.json for main/bin
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    if (pkg.main) entries.push(pkg.main);
    if (pkg.bin) {
      const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
      entries.push(...(bins as string[]));
    }
  } catch {}

  return [...new Set(entries)];
}

function getPublicApi(arch: Architecture): { name: string; type: string; file: string }[] {
  const api: { name: string; type: string; file: string }[] = [];
  for (const node of arch.nodes) {
    if (node.children) {
      for (const child of node.children) {
        if (child.exports.length > 0 || (child.type === 'class' || child.type === 'function' || child.type === 'interface')) {
          api.push({ name: child.name, type: child.type, file: node.path });
        }
      }
    }
  }
  return api;
}

function computeHotspots(deps: DependencyMap): { element: string; inbound: number; outbound: number }[] {
  const inbound: Record<string, number> = {};
  const outbound: Record<string, number> = {};

  for (const d of deps.dependencies) {
    const from = d.fromElement || d.from;
    const to = d.toElement || d.to;
    outbound[from] = (outbound[from] || 0) + 1;
    inbound[to] = (inbound[to] || 0) + 1;
  }

  const all = new Set([...Object.keys(inbound), ...Object.keys(outbound)]);
  const hotspots = [...all].map(el => ({
    element: el,
    inbound: inbound[el] || 0,
    outbound: outbound[el] || 0,
  }));

  // Sort by total connections descending
  hotspots.sort((a, b) => (b.inbound + b.outbound) - (a.inbound + a.outbound));
  return hotspots.slice(0, 10);
}

export function contextCommand(options: { human?: boolean }) {
  if (!isInitialized()) {
    const msg = 'Not initialized. Run `arhit init` first.';
    if (options.human) {
      console.log(msg);
    } else {
      console.log(JSON.stringify({ error: 'not_initialized', message: msg }));
    }
    return;
  }

  const config = readJson<ArhitConfig>(configPath())!;
  const arch = readJson<Architecture>(architecturePath());
  const deps = readJson<DependencyMap>(dependenciesPath());

  // Load doc index
  const indexPath = path.join(docsDir(), '_index.json');
  const docIndex = readJson<DocEntry[]>(indexPath) || [];

  // Build brief
  const brief: ContextBrief = {
    project: {
      name: config.name,
      language: config.language,
      framework: config.framework,
      sourcePaths: config.sourcePaths,
    },
    architecture: null,
    dependencies: null,
    documentation: {
      total: docIndex.length,
      byType: {},
      recent: [],
    },
    entryPoints: findEntryPoints(config, arch),
    publicApi: [],
  };

  // Architecture summary
  if (arch) {
    const topFiles = arch.nodes
      .map(n => ({ path: n.path, elements: n.children?.length || 0 }))
      .sort((a, b) => b.elements - a.elements)
      .slice(0, 10);

    brief.architecture = {
      files: arch.nodes.length,
      elements: arch.nodes.reduce((sum, n) => sum + (n.children?.length || 0), 0),
      generatedAt: arch.generatedAt,
      topFiles,
    };
    brief.publicApi = getPublicApi(arch);
  }

  // Dependencies summary
  if (deps) {
    brief.dependencies = {
      total: deps.dependencies.length,
      imports: deps.dependencies.filter(d => d.type === 'import').length,
      calls: deps.dependencies.filter(d => d.type === 'call').length,
      extends: deps.dependencies.filter(d => d.type === 'extends').length,
      implements: deps.dependencies.filter(d => d.type === 'implements').length,
      generatedAt: deps.generatedAt,
      hotspots: computeHotspots(deps),
    };
  }

  // Documentation summary
  const byType: Record<string, number> = {};
  for (const entry of docIndex) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
  }
  brief.documentation.byType = byType;
  brief.documentation.recent = [...docIndex]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map(e => ({ element: e.element, type: e.type, updatedAt: e.updatedAt }));

  // Output
  if (options.human) {
    printHuman(brief);
  } else {
    console.log(JSON.stringify(brief, null, 2));
  }
}

function printHuman(brief: ContextBrief): void {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║        Контекст проекта               ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');

  // Project
  console.log(`Проект: ${brief.project.name}`);
  console.log(`Язык:   ${brief.project.language}${brief.project.framework ? ` (${brief.project.framework})` : ''}`);
  console.log(`Исходники: ${brief.project.sourcePaths.join(', ')}`);
  console.log('');

  // Entry points
  if (brief.entryPoints.length > 0) {
    console.log('Точки входа:');
    for (const ep of brief.entryPoints) {
      console.log(`  → ${ep}`);
    }
    console.log('');
  }

  // Architecture
  if (brief.architecture) {
    console.log(`Архитектура: ${brief.architecture.files} файлов, ${brief.architecture.elements} элементов`);
    if (brief.architecture.topFiles.length > 0) {
      console.log('Крупнейшие файлы:');
      for (const f of brief.architecture.topFiles.slice(0, 5)) {
        console.log(`  ${f.path} (${f.elements} элементов)`);
      }
    }
    console.log('');
  } else {
    console.log('Архитектура: не построена. Запустите `arhit arch build`');
    console.log('');
  }

  // Dependencies
  if (brief.dependencies) {
    console.log(`Зависимости: ${brief.dependencies.total} связей (${brief.dependencies.imports} импортов, ${brief.dependencies.calls} вызовов)`);
    if (brief.dependencies.hotspots.length > 0) {
      console.log('Ключевые узлы:');
      for (const h of brief.dependencies.hotspots.slice(0, 5)) {
        console.log(`  ${h.element}: ${h.inbound} входящих, ${h.outbound} исходящих`);
      }
    }
    console.log('');
  } else {
    console.log('Зависимости: не проанализированы. Запустите `arhit analyze`');
    console.log('');
  }

  // Documentation
  console.log(`Документация: ${brief.documentation.total} элементов`);
  if (Object.keys(brief.documentation.byType).length > 0) {
    const types = Object.entries(brief.documentation.byType)
      .map(([t, c]) => `${t}: ${c}`)
      .join(', ');
    console.log(`  По типам: ${types}`);
  }
  if (brief.documentation.recent.length > 0) {
    console.log('  Последние обновления:');
    for (const r of brief.documentation.recent) {
      console.log(`    ${r.element} [${r.type}] — ${r.updatedAt.split('T')[0]}`);
    }
  }
  console.log('');

  // Public API
  if (brief.publicApi.length > 0) {
    console.log(`Публичный API: ${brief.publicApi.length} элементов`);
    for (const a of brief.publicApi.slice(0, 10)) {
      console.log(`  ${a.type} ${a.name} — ${a.file}`);
    }
  }
}

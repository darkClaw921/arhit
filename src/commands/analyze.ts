import { requireConfig, readJson, dependenciesPath, writeJson } from '../storage.js';
import { createProject, buildDependencies } from '../analyzer/scanner.js';
import { buildPythonDependencies } from '../analyzer/python-scanner.js';
import { formatJson, formatDepsMermaid, formatDepsDot } from '../formatters/index.js';
import type { DependencyMap, Dependency } from '../types.js';

function loadDeps(): Dependency[] {
  const data = readJson<DependencyMap>(dependenciesPath());
  if (!data) {
    console.error('No dependency data. Run `arhit analyze` first.');
    process.exit(1);
  }
  return data.dependencies;
}

export function analyzeCommand(options: { human?: boolean }) {
  const config = requireConfig();
  let dependencies: Dependency[];
  if (config.language === 'python') {
    dependencies = buildPythonDependencies(config.sourcePaths, config.ignore);
  } else {
    const project = createProject(config.sourcePaths, config.ignore);
    dependencies = buildDependencies(project);
  }

  const depMap: DependencyMap = {
    generatedAt: new Date().toISOString(),
    dependencies,
  };

  writeJson(dependenciesPath(), depMap);

  const importCount = dependencies.filter(d => d.type === 'import').length;
  const callCount = dependencies.filter(d => d.type === 'call').length;

  if (options.human) {
    console.log(`Analysis complete: ${dependencies.length} dependencies found`);
    console.log(`  Imports: ${importCount}`);
    console.log(`  Calls:   ${callCount}`);
    console.log('Saved to .arhit/dependencies.json');
  } else {
    console.log(JSON.stringify({ status: 'analyzed', total: dependencies.length, imports: importCount, calls: callCount }));
  }
}

export function depsCommand(element: string, options: { human?: boolean }) {
  const deps = loadDeps();
  const matches = deps.filter(d => d.toElement === element || d.to.includes(element));

  if (options.human) {
    if (matches.length === 0) {
      console.log(`No dependencies found for "${element}"`);
      return;
    }
    console.log(`Dependencies on "${element}":`);
    for (const d of matches) {
      console.log(`  ${d.from}${d.fromElement ? ':' + d.fromElement : ''} --[${d.type}]--> ${d.toElement || d.to}`);
    }
  } else {
    console.log(formatJson(matches));
  }
}

export function callsCommand(element: string, options: { human?: boolean }) {
  const deps = loadDeps();
  const matches = deps.filter(d => d.fromElement === element || d.from.includes(element));

  if (options.human) {
    if (matches.length === 0) {
      console.log(`No calls found from "${element}"`);
      return;
    }
    console.log(`Calls from "${element}":`);
    for (const d of matches) {
      console.log(`  ${d.fromElement || d.from} --[${d.type}]--> ${d.to}${d.toElement ? ':' + d.toElement : ''}`);
    }
  } else {
    console.log(formatJson(matches));
  }
}

export function mapCommand(options: { format?: string; human?: boolean }) {
  const deps = loadDeps();
  const format = options.format || (options.human ? 'mermaid' : 'json');

  switch (format) {
    case 'mermaid':
      console.log(formatDepsMermaid(deps));
      break;
    case 'dot':
      console.log(formatDepsDot(deps));
      break;
    case 'json':
    default:
      console.log(formatJson(deps));
      break;
  }
}

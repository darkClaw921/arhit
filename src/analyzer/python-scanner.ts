import fs from 'node:fs';
import path from 'node:path';
import type { ArchNode, Dependency } from '../types.js';

interface PythonElement {
  name: string;
  type: ArchNode['type'];
  line: number;
  exported: boolean;
  signature?: string;
  docComment?: string;
}

/**
 * Извлекает docstring элемента: первый строковый литерал тела сразу после
 * строки объявления (def/class). Возвращает undefined, если его нет.
 */
function extractDocstring(lines: string[], declIndex: number): string | undefined {
  // ищем первую непустую строку тела
  for (let i = declIndex + 1; i < lines.length && i < declIndex + 3; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(["']{3}|["'])/);
    if (!m) return undefined;
    const quote = m[1];
    // однострочный docstring: """текст"""
    const rest = trimmed.slice(quote.length);
    const closeIdx = rest.indexOf(quote);
    if (closeIdx >= 0) {
      return rest.slice(0, closeIdx).trim() || undefined;
    }
    // многострочный: собираем до закрывающей кавычки
    const buf = [rest];
    for (let j = i + 1; j < lines.length; j++) {
      const idx = lines[j].indexOf(quote);
      if (idx >= 0) {
        buf.push(lines[j].slice(0, idx));
        return buf.join('\n').trim() || undefined;
      }
      buf.push(lines[j]);
    }
    return buf.join('\n').trim() || undefined;
  }
  return undefined;
}

function parsePythonFile(content: string): PythonElement[] {
  const elements: PythonElement[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Top-level function: def name(
    const fnMatch = line.match(/^def\s+([a-zA-Z_]\w*)\s*\(/);
    if (fnMatch) {
      const name = fnMatch[1];
      elements.push({
        name,
        type: 'function',
        line: lineNum,
        exported: !name.startsWith('_'),
        signature: line.trim().replace(/^def\s+/, '').replace(/:\s*$/, ''),
        docComment: extractDocstring(lines, i),
      });
    }

    // Top-level class: class Name(
    const clsMatch = line.match(/^class\s+([a-zA-Z_]\w*)\s*[:(]/);
    if (clsMatch) {
      const name = clsMatch[1];
      elements.push({
        name,
        type: 'class',
        line: lineNum,
        exported: !name.startsWith('_'),
        signature: line.trim().replace(/:\s*$/, ''),
        docComment: extractDocstring(lines, i),
      });
    }

    // Top-level variable: NAME = ... (UPPER_CASE constants or simple assignments)
    const varMatch = line.match(/^([a-zA-Z_]\w*)\s*[=:]/);
    if (varMatch && !line.startsWith('def ') && !line.startsWith('class ') && !line.startsWith('#') && !line.startsWith(' ') && !line.startsWith('\t')) {
      const name = varMatch[1];
      // Skip common non-variable patterns
      if (!['if', 'for', 'while', 'with', 'try', 'elif', 'else', 'except', 'finally', 'return', 'yield', 'raise', 'import', 'from'].includes(name)) {
        elements.push({
          name,
          type: 'variable',
          line: lineNum,
          exported: !name.startsWith('_'),
        });
      }
    }
  }

  return elements;
}

interface PythonImport {
  module: string;
  names: string[];
  line: number;
}

function parsePythonImports(content: string): PythonImport[] {
  const imports: PythonImport[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // from module import name1, name2
    const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromMatch) {
      const module = fromMatch[1];
      const names = fromMatch[2].split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      imports.push({ module, names, line: lineNum });
      continue;
    }

    // import module1, module2
    const importMatch = line.match(/^import\s+(.+)/);
    if (importMatch) {
      const modules = importMatch[1].split(',').map(m => m.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      for (const mod of modules) {
        imports.push({ module: mod, names: [], line: lineNum });
      }
    }
  }

  return imports;
}

function parsePythonCalls(content: string): Array<{ caller: string | undefined; callee: string; line: number }> {
  const calls: Array<{ caller: string | undefined; callee: string; line: number }> = [];
  const lines = content.split('\n');

  let currentFunction: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track current function scope
    const fnMatch = line.match(/^(\s*)def\s+([a-zA-Z_]\w*)\s*\(/);
    if (fnMatch) {
      const indent = fnMatch[1].length;
      if (indent === 0 || indent === 4) {
        currentFunction = fnMatch[2];
      }
    }

    // Reset scope at top-level non-indented non-empty lines
    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t') && !fnMatch) {
      const clsMatch = line.match(/^class\s+/);
      if (!clsMatch) currentFunction = undefined;
    }

    // Find function calls: name( or name.method(
    const callRegex = /([a-zA-Z_][\w.]*)\s*\(/g;
    let match;
    while ((match = callRegex.exec(line)) !== null) {
      const callee = match[1];
      // Skip keywords and common non-calls
      if (['if', 'for', 'while', 'with', 'def', 'class', 'return', 'print', 'elif', 'except', 'lambda'].includes(callee)) continue;
      calls.push({ caller: currentFunction, callee, line: lineNum });
    }
  }

  return calls;
}

function parsePythonInheritance(content: string): Array<{ className: string; bases: string[]; line: number }> {
  const result: Array<{ className: string; bases: string[]; line: number }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^class\s+([a-zA-Z_]\w*)\s*\(([^)]+)\)/);
    if (match) {
      const className = match[1];
      const bases = match[2].split(',').map(b => b.trim()).filter(b => b && b !== 'object');
      if (bases.length > 0) {
        result.push({ className, bases, line: i + 1 });
      }
    }
  }

  return result;
}

export function findPythonFiles(sourcePaths: string[], ignore: string[]): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(process.cwd(), fullPath);
      if (ignore.some(p => rel.includes(p))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.py')) {
        files.push(fullPath);
      }
    }
  }

  for (const src of sourcePaths) {
    const abs = path.isAbsolute(src) ? src : path.join(process.cwd(), src);
    walk(abs);
  }

  return files;
}

export function buildPythonArchNodes(sourcePaths: string[], ignore: string[]): ArchNode[] {
  const files = findPythonFiles(sourcePaths, ignore);
  const nodes: ArchNode[] = [];

  for (const file of files) {
    const filePath = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf-8');
    const elements = parsePythonFile(content);

    const children: ArchNode[] = elements.map(el => ({
      id: `${filePath}:${el.name}`,
      name: el.name,
      type: el.type,
      path: filePath,
      line: el.line,
      signature: el.signature,
      docComment: el.docComment,
      exports: el.exported ? [el.name] : [],
    }));

    const allExports = children.filter(c => c.exports.length > 0).flatMap(c => c.exports);
    nodes.push({
      id: filePath,
      name: path.basename(filePath),
      type: 'file',
      path: filePath,
      exports: allExports,
      children,
    });
  }

  return nodes;
}

export function buildPythonDependencies(sourcePaths: string[], ignore: string[]): Dependency[] {
  const files = findPythonFiles(sourcePaths, ignore);
  const deps: Dependency[] = [];

  for (const file of files) {
    const filePath = path.relative(process.cwd(), file);
    const content = fs.readFileSync(file, 'utf-8');

    // Imports
    const imports = parsePythonImports(content);
    for (const imp of imports) {
      const toPath = imp.module.replace(/\./g, '/') + '.py';
      if (imp.names.length > 0) {
        for (const name of imp.names) {
          deps.push({ from: filePath, to: toPath, type: 'import', toElement: name });
        }
      } else {
        deps.push({ from: filePath, to: toPath, type: 'import' });
      }
    }

    // Inheritance
    const inheritance = parsePythonInheritance(content);
    for (const inh of inheritance) {
      for (const base of inh.bases) {
        deps.push({ from: filePath, to: filePath, type: 'extends', fromElement: inh.className, toElement: base });
      }
    }

    // Calls
    const calls = parsePythonCalls(content);
    for (const call of calls) {
      deps.push({ from: filePath, to: filePath, type: 'call', fromElement: call.caller, toElement: call.callee });
    }
  }

  return deps;
}

import { Project, SyntaxKind, Node } from 'ts-morph';
import fs from 'node:fs';
import path from 'node:path';
import type { ArchNode, Dependency } from '../types.js';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

/**
 * Обходит файловую систему и собирает пути к исходникам TS/JS.
 *
 * Игнорируемые каталоги (node_modules, dist, …) отсекаются ПРЯМО при обходе —
 * их содержимое никогда не читается и не парсится. Это критично для памяти:
 * раньше ts-morph загружал в AST весь node_modules и удалял его только после,
 * что приводило к OOM в V8 на больших проектах.
 */
export function findSourceFiles(sourcePaths: string[], ignore: string[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

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
      } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        if (!seen.has(fullPath)) {
          seen.add(fullPath);
          files.push(fullPath);
        }
      }
    }
  }

  for (const src of sourcePaths) {
    const abs = path.isAbsolute(src) ? src : path.join(process.cwd(), src);
    walk(abs);
  }

  return files;
}

/**
 * Создаёт «лёгкий» проект ts-morph для пофайлового разбора.
 *
 * skipFileDependencyResolution не даёт ts-morph автоматически подтягивать
 * импортируемые файлы при добавлении одного исходника — иначе добавление
 * одного файла затягивало бы в память весь граф импортов.
 */
function createScratchProject(): Project {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: true },
  });
}

function collectFileChildren(sf: import('ts-morph').SourceFile, filePath: string): ArchNode[] {
  const children: ArchNode[] = [];

  for (const fn of sf.getFunctions()) {
    const name = fn.getName() || '<anonymous>';
    children.push({
      id: `${filePath}:${name}`,
      name,
      type: 'function',
      path: filePath,
      line: fn.getStartLineNumber(),
      exports: fn.isExported() ? [name] : [],
    });
  }

  for (const cls of sf.getClasses()) {
    const name = cls.getName() || '<anonymous>';
    children.push({
      id: `${filePath}:${name}`,
      name,
      type: 'class',
      path: filePath,
      line: cls.getStartLineNumber(),
      exports: cls.isExported() ? [name] : [],
    });
  }

  for (const iface of sf.getInterfaces()) {
    const name = iface.getName();
    children.push({
      id: `${filePath}:${name}`,
      name,
      type: 'interface',
      path: filePath,
      line: iface.getStartLineNumber(),
      exports: iface.isExported() ? [name] : [],
    });
  }

  for (const typeAlias of sf.getTypeAliases()) {
    const name = typeAlias.getName();
    children.push({
      id: `${filePath}:${name}`,
      name,
      type: 'type',
      path: filePath,
      line: typeAlias.getStartLineNumber(),
      exports: typeAlias.isExported() ? [name] : [],
    });
  }

  for (const en of sf.getEnums()) {
    const name = en.getName();
    children.push({
      id: `${filePath}:${name}`,
      name,
      type: 'enum',
      path: filePath,
      line: en.getStartLineNumber(),
      exports: en.isExported() ? [name] : [],
    });
  }

  for (const varStmt of sf.getVariableStatements()) {
    for (const decl of varStmt.getDeclarations()) {
      const name = decl.getName();
      children.push({
        id: `${filePath}:${name}`,
        name,
        type: 'variable',
        path: filePath,
        line: decl.getStartLineNumber(),
        exports: varStmt.isExported() ? [name] : [],
      });
    }
  }

  return children;
}

export function buildArchNodes(sourcePaths: string[], ignore: string[]): ArchNode[] {
  const files = findSourceFiles(sourcePaths, ignore);
  const project = createScratchProject();
  const nodes: ArchNode[] = [];

  for (const file of files) {
    const filePath = path.relative(process.cwd(), file);
    let sf;
    try {
      sf = project.addSourceFileAtPath(file);
    } catch {
      continue; // повреждённый/нечитаемый файл — пропускаем
    }

    const children = collectFileChildren(sf, filePath);
    const allExports = children.filter(c => c.exports.length > 0).flatMap(c => c.exports);
    nodes.push({
      id: filePath,
      name: path.basename(filePath),
      type: 'file',
      path: filePath,
      exports: allExports,
      children,
    });

    // Освобождаем AST файла, чтобы память не росла линейно с размером проекта.
    project.removeSourceFile(sf);
  }

  return nodes;
}

/**
 * Разрешает относительный импорт в путь к файлу без загрузки всего проекта
 * в type checker (что было основным источником потребления памяти в analyze).
 * Возвращает путь относительно cwd либо исходный спецификатор для внешних модулей.
 */
function resolveImport(fromFile: string, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier; // bare/external module

  const baseDir = path.dirname(fromFile);
  const resolvedAbs = path.resolve(baseDir, specifier);

  const candidates = [
    resolvedAbs,
    ...SOURCE_EXTENSIONS.map(e => resolvedAbs + e),
    ...SOURCE_EXTENSIONS.map(e => path.join(resolvedAbs, 'index' + e)),
  ];

  // ESM-TS соглашение: import './foo.js' фактически указывает на './foo.ts'
  const jsExt = specifier.match(/\.(js|jsx|mjs|cjs)$/);
  if (jsExt) {
    const withoutExt = resolvedAbs.replace(/\.(js|jsx|mjs|cjs)$/, '');
    for (const e of SOURCE_EXTENSIONS) candidates.push(withoutExt + e);
  }

  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return path.relative(process.cwd(), c);
    } catch {
      // нет такого пути — пробуем следующий кандидат
    }
  }

  return specifier;
}

function collectFileDependencies(sf: import('ts-morph').SourceFile, file: string, filePath: string): Dependency[] {
  const deps: Dependency[] = [];

  // Импорты
  for (const imp of sf.getImportDeclarations()) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    const toPath = resolveImport(file, moduleSpecifier);

    for (const named of imp.getNamedImports()) {
      deps.push({
        from: filePath,
        to: toPath,
        type: 'import',
        fromElement: undefined,
        toElement: named.getName(),
      });
    }

    const defaultImport = imp.getDefaultImport();
    if (defaultImport) {
      deps.push({
        from: filePath,
        to: toPath,
        type: 'import',
        toElement: 'default',
      });
    }
  }

  // Наследование/реализация
  for (const cls of sf.getClasses()) {
    const ext = cls.getExtends();
    if (ext) {
      deps.push({
        from: filePath,
        to: filePath,
        type: 'extends',
        fromElement: cls.getName(),
        toElement: ext.getText(),
      });
    }
    for (const impl of cls.getImplements()) {
      deps.push({
        from: filePath,
        to: filePath,
        type: 'implements',
        fromElement: cls.getName(),
        toElement: impl.getText(),
      });
    }
  }

  // Вызовы функций
  sf.forEachDescendant((node) => {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      const text = expr.getText();
      if (text.match(/^[a-zA-Z_][\w.]*$/)) {
        const containingFn = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)
          ?? node.getFirstAncestorByKind(SyntaxKind.MethodDeclaration)
          ?? node.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
        const caller = containingFn
          ? (Node.isFunctionDeclaration(containingFn) ? containingFn.getName() : undefined)
          : undefined;
        deps.push({
          from: filePath,
          to: filePath,
          type: 'call',
          fromElement: caller,
          toElement: text,
        });
      }
    }
  });

  return deps;
}

export function buildDependencies(sourcePaths: string[], ignore: string[]): Dependency[] {
  const files = findSourceFiles(sourcePaths, ignore);
  const project = createScratchProject();
  const deps: Dependency[] = [];

  for (const file of files) {
    const filePath = path.relative(process.cwd(), file);
    let sf;
    try {
      sf = project.addSourceFileAtPath(file);
    } catch {
      continue;
    }

    deps.push(...collectFileDependencies(sf, file, filePath));

    // Освобождаем AST файла после извлечения зависимостей.
    project.removeSourceFile(sf);
  }

  return deps;
}

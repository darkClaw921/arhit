import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import path from 'node:path';
import type { ArchNode, Dependency } from '../types.js';

export function createProject(sourcePaths: string[], ignore: string[]): Project {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const srcPath of sourcePaths) {
    project.addSourceFilesAtPaths([
      path.join(srcPath, '**/*.ts'),
      path.join(srcPath, '**/*.tsx'),
      path.join(srcPath, '**/*.js'),
      path.join(srcPath, '**/*.jsx'),
    ]);
  }
  // Remove ignored
  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(process.cwd(), sf.getFilePath());
    if (ignore.some(p => rel.includes(p))) {
      project.removeSourceFile(sf);
    }
  }
  return project;
}

export function buildArchNodes(project: Project): ArchNode[] {
  const nodes: ArchNode[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = path.relative(process.cwd(), sf.getFilePath());
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

export function buildDependencies(project: Project): Dependency[] {
  const deps: Dependency[] = [];

  for (const sf of project.getSourceFiles()) {
    const filePath = path.relative(process.cwd(), sf.getFilePath());

    // Import dependencies
    for (const imp of sf.getImportDeclarations()) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const resolved = imp.getModuleSpecifierSourceFile();
      const toPath = resolved
        ? path.relative(process.cwd(), resolved.getFilePath())
        : moduleSpecifier;

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

    // Class extends/implements
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

    // Function calls (top-level call expressions)
    sf.forEachDescendant((node) => {
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        const text = expr.getText();
        // Only track simple identifiers and member access
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
  }

  return deps;
}

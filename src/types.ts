export interface ArhitConfig {
  name: string;
  sourcePaths: string[];
  ignore: string[];
  language: string;
  framework?: string;
}

export interface ArchNode {
  id: string;
  name: string;
  type: 'file' | 'module' | 'class' | 'function' | 'variable' | 'interface' | 'type' | 'enum';
  path: string;
  line?: number;
  exports: string[];
  children?: ArchNode[];
}

export interface Architecture {
  root: string;
  generatedAt: string;
  nodes: ArchNode[];
}

export interface Dependency {
  from: string;
  to: string;
  type: 'import' | 'call' | 'extends' | 'implements' | 'uses';
  fromElement?: string;
  toElement?: string;
}

export interface DependencyMap {
  generatedAt: string;
  dependencies: Dependency[];
}

export interface DocEntry {
  element: string;
  path: string;
  type: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutputOptions {
  format?: 'json' | 'tree' | 'mermaid' | 'dot';
  human?: boolean;
}

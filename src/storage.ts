import fs from 'node:fs';
import path from 'node:path';
import type { ArhitConfig } from './types.js';

const ARHIT_DIR = '.arhit';

export function getArhitDir(root: string = process.cwd()): string {
  return path.join(root, ARHIT_DIR);
}

export function ensureArhitDir(root?: string): string {
  const dir = getArhitDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  return dir;
}

export function isInitialized(root?: string): boolean {
  return fs.existsSync(getArhitDir(root));
}

export function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export function requireConfig(): ArhitConfig {
  const config = readJson<ArhitConfig>(configPath());
  if (!config) {
    console.error('Not initialized. Run `arhit init` first.');
    process.exit(1);
  }
  return config;
}

export function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

export function readMarkdown(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function writeMarkdown(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function configPath(root?: string): string {
  return path.join(getArhitDir(root), 'config.json');
}

export function architecturePath(root?: string): string {
  return path.join(getArhitDir(root), 'architecture.json');
}

export function dependenciesPath(root?: string): string {
  return path.join(getArhitDir(root), 'dependencies.json');
}

export function docsDir(root?: string): string {
  return path.join(getArhitDir(root), 'docs');
}

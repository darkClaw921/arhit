import type { Dependency } from '../types.js';

export function formatDepsDot(deps: Dependency[]): string {
  const lines: string[] = ['digraph dependencies {', '  rankdir=LR;'];
  for (const dep of deps) {
    const from = dep.from + (dep.fromElement ? '.' + dep.fromElement : '');
    const to = dep.to + (dep.toElement ? '.' + dep.toElement : '');
    const id = (s: string) => '"' + s.replace(/"/g, '\\"') + '"';
    lines.push(`  ${id(from)} -> ${id(to)} [label="${dep.type}"];`);
  }
  lines.push('}');
  return lines.join('\n');
}

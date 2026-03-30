import type { ArchNode, Dependency } from '../types.js';

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function formatArchMermaid(nodes: ArchNode[]): string {
  const lines: string[] = ['graph TD'];
  function addNode(node: ArchNode) {
    const id = sanitizeId(node.id);
    lines.push(`  ${id}["${node.name} (${node.type})"]`);
    if (node.children) {
      for (const child of node.children) {
        lines.push(`  ${id} --> ${sanitizeId(child.id)}`);
        addNode(child);
      }
    }
  }
  for (const node of nodes) addNode(node);
  return lines.join('\n');
}

export function formatDepsMermaid(deps: Dependency[]): string {
  const lines: string[] = ['graph LR'];
  for (const dep of deps) {
    const from = sanitizeId(dep.from + (dep.fromElement ? '.' + dep.fromElement : ''));
    const to = sanitizeId(dep.to + (dep.toElement ? '.' + dep.toElement : ''));
    const label = dep.type;
    lines.push(`  ${from} -->|${label}| ${to}`);
  }
  return lines.join('\n');
}

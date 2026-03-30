import type { ArchNode } from '../types.js';

export function formatTree(nodes: ArchNode[], prefix = ''): string {
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const typeTag = node.type !== 'file' ? ` [${node.type}]` : '';
    const exportsTag = node.exports.length > 0 ? ` (exports: ${node.exports.join(', ')})` : '';
    lines.push(`${prefix}${connector}${node.name}${typeTag}${exportsTag}`);
    if (node.children?.length) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(formatTree(node.children, childPrefix));
    }
  });
  return lines.join('\n');
}

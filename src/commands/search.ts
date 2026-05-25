import { readJson, architecturePath } from '../storage.js';
import { loadIndex } from './doc.js';
import { formatJson } from '../formatters/index.js';
import { scoreMatch } from '../search/score.js';
import type { Architecture } from '../types.js';

interface SearchHit {
  element: string;
  type: string;
  location: string | null;
  source: 'code' | 'doc';
  signature?: string;
  score: number;
}

/**
 * Единый fuzzy-поиск по архитектуре кода И документации.
 * Возвращает ранжированные совпадения с `path:line`, чтобы агент сразу прыгнул в код,
 * не прибегая к Grep/Glob/Explore.
 */
export function searchCommand(query: string, options: { human?: boolean }) {
  const hits: SearchHit[] = [];

  // Код: файлы и их элементы из architecture.json
  const arch = readJson<Architecture>(architecturePath());
  if (arch) {
    for (const node of arch.nodes) {
      const fileScore = scoreMatch(query, node.path);
      if (fileScore >= 0.3) {
        hits.push({ element: node.name, type: node.type, location: node.path, source: 'code', score: fileScore });
      }
      for (const child of node.children || []) {
        const score = Math.max(scoreMatch(query, child.name), scoreMatch(query, child.signature || '') * 0.8);
        if (score >= 0.3) {
          hits.push({
            element: child.name,
            type: child.type,
            location: `${child.path}${child.line ? ':' + child.line : ''}`,
            source: 'code',
            signature: child.signature,
            score,
          });
        }
      }
    }
  }

  // Документация: индекс doc-записей
  for (const e of loadIndex()) {
    const nameScore = scoreMatch(query, e.element);
    const aliasScore = Math.max(0, ...(e.aliases || []).map(a => scoreMatch(query, a)));
    const contentScore = scoreMatch(query, e.content) * 0.5;
    const score = Math.max(nameScore, aliasScore, contentScore);
    if (score >= 0.3) {
      hits.push({ element: e.element, type: e.type, location: e.path || null, source: 'doc', score });
    }
  }

  // Дедуп: один элемент может быть и в коде, и в доках — оставляем лучший балл,
  // помечая, что есть документация.
  const byKey = new Map<string, SearchHit>();
  for (const h of hits) {
    const key = `${h.element}|${h.location}`;
    const prev = byKey.get(key);
    if (!prev || h.score > prev.score) byKey.set(key, h);
  }

  const ranked = [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, 25);

  if (options.human) {
    if (ranked.length === 0) {
      console.log(`No results for "${query}"`);
      return;
    }
    console.log(`Found ${ranked.length} result(s) for "${query}":\n`);
    for (const h of ranked) {
      const loc = h.location ? ` — ${h.location}` : '';
      const sig = h.signature ? `  ${h.signature}` : '';
      console.log(`  [${h.source}] ${h.element} [${h.type}]${loc}  (${h.score.toFixed(2)})${sig}`);
    }
  } else {
    console.log(formatJson(ranked.map(h => ({ ...h, score: Number(h.score.toFixed(3)) }))));
  }
}

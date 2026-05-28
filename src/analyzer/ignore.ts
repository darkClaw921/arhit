import path from 'node:path';

/**
 * Проверяет, попадает ли относительный путь под список игнорируемых паттернов.
 *
 * Матчинг посегментный, а НЕ подстрочный: запись `dist` отсекает каталог
 * `dist/`, но не трогает файл `src/distance.ts`. Это устраняет ложные
 * срабатывания коротких generic-имён (`out`, `build`, `bin`, …), которые при
 * старом `rel.includes(p)` ловили настоящий код (`layout.tsx`, `combine.ts`).
 *
 * Поддерживаются три формы паттерна:
 *  - имя сегмента (`node_modules`, `.next`) — совпадает с любым сегментом пути;
 *  - glob по расширению (`*.egg-info`) — совпадает с сегментом по суффиксу;
 *  - путь с разделителем (`src/generated`) — старое подстрочное поведение,
 *    чтобы пользовательские конфиги с вложенными путями не сломались.
 */
export function isIgnored(rel: string, ignore: string[]): boolean {
  const segments = rel.split(path.sep);
  return ignore.some(p => {
    if (p.includes('/') || p.includes(path.sep)) return rel.includes(p);
    if (p.startsWith('*.')) {
      const suffix = p.slice(1);
      return segments.some(s => s.endsWith(suffix));
    }
    return segments.includes(p);
  });
}

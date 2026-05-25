/**
 * Лёгкий скоринг релевантности для поиска по коду и документации.
 *
 * Без внешних зависимостей. Используется и `arhit search`, и `arhit doc search`,
 * чтобы агент находил элемент по имени с опечаткой или по синониму/токену,
 * а не только по точной подстроке (как было раньше через String.includes).
 */

/**
 * Разбивает строку на токены нижнего регистра: по разделителям пути/имён
 * (`/`, `_`, `-`, `.`, пробелы) и по границам camelCase.
 */
export function tokenize(s: string): string[] {
  if (!s) return [];
  return s
    // вставляем пробел на границе camelCase: docSearch -> doc Search
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Расстояние Левенштейна между двумя строками. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // удаление
        curr[j - 1] + 1,  // вставка
        prev[j - 1] + cost // замена
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Оценивает релевантность цели запросу в диапазоне [0, 1].
 *
 * Уровни (берётся максимум):
 *  - 1.0  точное совпадение целиком;
 *  - 0.9  цель содержит запрос как подстроку;
 *  - до 0.8  доля токенов запроса, точно встретившихся среди токенов цели;
 *  - до 0.6  fuzzy-совпадение токенов по Левенштейну (ловит опечатки popap≈popup).
 *
 * 0 — нерелевантно.
 */
export function scoreMatch(query: string, target: string): number {
  if (!query || !target) return 0;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();

  if (q === t) return 1;
  if (t.includes(q)) return 0.9;

  const qTokens = tokenize(query);
  const tTokens = tokenize(target);
  if (qTokens.length === 0 || tTokens.length === 0) return 0;
  const tSet = new Set(tTokens);

  let exactHits = 0;
  let fuzzyHits = 0;
  for (const qt of qTokens) {
    if (tSet.has(qt)) {
      exactHits++;
      continue;
    }
    // fuzzy: ближайший токен цели в пределах порога опечаток
    let best = Infinity;
    for (const tt of tTokens) {
      const d = levenshtein(qt, tt);
      if (d < best) best = d;
    }
    const threshold = qt.length <= 4 ? 1 : 2;
    if (best <= threshold) fuzzyHits++;
  }

  const exactScore = (exactHits / qTokens.length) * 0.8;
  const fuzzyScore = (fuzzyHits / qTokens.length) * 0.6;
  return Math.max(exactScore, fuzzyScore);
}

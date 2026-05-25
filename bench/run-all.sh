#!/usr/bin/env bash
# Готовит кеш и прогоняет все (или выбранные) кейсы в обоих режимах, пишет MD-отчёт.
# Использование:
#   run-all.sh                       — все кейсы, оба режима
#   run-all.sh --case <id>...        — только указанные кейсы
#   run-all.sh --mode arhit|zero     — только один режим
#   run-all.sh --refresh             — пересоздать кеш lunchHunter перед прогоном
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CASES_FILE="$ROOT/bench/cases.json"
RUN="$ROOT/bench/run-case.sh"
PREP="$ROOT/bench/prepare-cache.sh"

ONLY_CASES=()
ONLY_MODE=""
REFRESH=""
NO_CAVEMAN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --case) shift; ONLY_CASES+=("$1"); shift ;;
    --mode) shift; ONLY_MODE="$1"; shift ;;
    --refresh) REFRESH="--refresh"; shift ;;
    --no-caveman) NO_CAVEMAN=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

ALL_IDS=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).cases.map(c=>c.id).join(" "))' "$CASES_FILE")
IDS=("${ONLY_CASES[@]:-}")
[[ ${#IDS[@]} -eq 0 || -z "${IDS[0]:-}" ]] && IDS=($ALL_IDS)

MODES=(arhit zero caveman caveman-arhit)
[[ -n "$ONLY_MODE" ]] && MODES=("$ONLY_MODE")
if [[ $NO_CAVEMAN -eq 1 ]]; then
  NEW_MODES=()
  for m in "${MODES[@]}"; do [[ "$m" != "caveman" && "$m" != "caveman-arhit" ]] && NEW_MODES+=("$m"); done
  MODES=("${NEW_MODES[@]}")
fi

# Ставим плагин caveman только если он реально нужен в этом прогоне
NEED_CAVEMAN=0
for m in "${MODES[@]}"; do [[ "$m" == "caveman" || "$m" == "caveman-arhit" ]] && NEED_CAVEMAN=1; done
export BENCH_INSTALL_CAVEMAN="$NEED_CAVEMAN"

# подготовить кеш ОДИН раз перед прогоном — это вне измерений
"$PREP" $REFRESH >/dev/null

# очистить папку с результатами перед новым прогоном
RESULTS_DIR="$ROOT/bench/results"
echo "[run-all] очищаю $RESULTS_DIR" >&2
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$ROOT/bench/results/report-${STAMP}.md"
JSONL="$ROOT/bench/results/runs-${STAMP}.jsonl"

echo "# Arhit benchmark — ${STAMP}" > "$REPORT"
echo "" >> "$REPORT"
echo "Repo: lunchHunter (свежие копии в bench/workspace/runs/)" >> "$REPORT"
echo "" >> "$REPORT"
echo "| кейс | режим | модель | время_с | вход | выход | кеш_чт | всего | цена_usd | ходы | rc |" >> "$REPORT"
echo "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|" >> "$REPORT"

# Запускаем все кейсы × режимы параллельно — каждый процесс пишет JSON в свой tmp-файл
PAR_TMP="$(mktemp -d)"
trap 'rm -rf "$PAR_TMP"' EXIT
pids=()
for id in "${IDS[@]}"; do
  for mode in "${MODES[@]}"; do
    echo ">>> start $id [$mode]" >&2
    ( "$RUN" "$id" "$mode" > "$PAR_TMP/${id}--${mode}.json" 2> "$PAR_TMP/${id}--${mode}.err" || true ) &
    pids+=($!)
  done
done
echo ">>> waiting for ${#pids[@]} parallel runs..." >&2
for pid in "${pids[@]}"; do wait "$pid" || true; done
echo ">>> all runs done" >&2

# Собираем JSONL и таблицу в детерминированном порядке
for id in "${IDS[@]}"; do
  for mode in "${MODES[@]}"; do
    OUT_FILE="$PAR_TMP/${id}--${mode}.json"
    [[ -s "$OUT_FILE" ]] || { echo "WARN: пустой результат для $id/$mode" >&2; continue; }
    OUT="$(cat "$OUT_FILE")"
    echo "$OUT" >> "$JSONL"
    node -e '
      const r = JSON.parse(process.argv[1]);
      console.log(`| ${r.case} | ${r.mode} | ${r.model} | ${r.wall_s} | ${r.input_tokens} | ${r.output_tokens} | ${r.cache_read_tokens} | ${r.total_tokens} | ${r.cost_usd.toFixed(4)} | ${r.num_turns} | ${r.rc} |`);
    ' "$OUT" >> "$REPORT"
  done
done

echo "" >> "$REPORT"
echo "## Δ против zero (отрицательное = режим лучше zero)" >> "$REPORT"
echo "" >> "$REPORT"
echo "| кейс | режим | Δ время_с | Δ всего_токенов | Δ цена_usd |" >> "$REPORT"
echo "|---|---|---:|---:|---:|" >> "$REPORT"
node -e '
  const fs = require("fs");
  const lines = fs.readFileSync(process.argv[1], "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const by = {};
  for (const r of lines) (by[r.case] ||= {})[r.mode] = r;
  const others = ["arhit", "caveman", "caveman-arhit"];
  for (const [c, m] of Object.entries(by)) {
    if (!m.zero) continue;
    for (const o of others) {
      if (!m[o]) continue;
      const dW = (m[o].wall_s - m.zero.wall_s).toFixed(2);
      const dT = m[o].total_tokens - m.zero.total_tokens;
      const dC = (m[o].cost_usd - m.zero.cost_usd).toFixed(4);
      console.log(`| ${c} | ${o} | ${dW} | ${dT} | ${dC} |`);
    }
  }
' "$JSONL" >> "$REPORT"

echo "" >&2
echo "report: $REPORT" >&2
echo "jsonl:  $JSONL" >&2
echo "$REPORT"

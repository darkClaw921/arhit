#!/usr/bin/env bash
# Запускает ОДИН тест-кейс в ОДНОМ режиме (arhit|zero|caveman|caveman-arhit) на свежей копии lunchHunter.
# Использование: run-case.sh <case_id> <mode> [model_override]
# Печатает JSON: {case, mode, model, wall_s, input/output/cache_*_tokens, total_tokens, cost_usd, num_turns, rc, workdir, ...}
set -euo pipefail

CASE_ID="${1:?case_id required}"
MODE="${2:?mode required (arhit|zero|caveman|caveman-arhit)}"
MODEL_OVERRIDE="${3:-}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CASES="$ROOT/bench/cases.json"
RESULTS_DIR="$ROOT/bench/results"
WS="$ROOT/bench/workspace"
CACHE_ARHIT="$WS/cache/lunchHunter-arhit"
CACHE_ZERO="$WS/cache/lunchHunter-zero"
CACHE_CAVEMAN="$WS/cache/lunchHunter-caveman"
RUNS_DIR="$WS/runs"
mkdir -p "$RESULTS_DIR" "$RUNS_DIR"

# проверка, что кеш готов (создаётся через bench/prepare-cache.sh либо run-all.sh)
SRC=""
case "$MODE" in
  arhit)         SRC="$CACHE_ARHIT" ;;
  zero)          SRC="$CACHE_ZERO" ;;
  caveman)       SRC="$CACHE_CAVEMAN" ;;
  caveman-arhit) SRC="$CACHE_ARHIT" ;;
  *) echo "unknown mode: $MODE" >&2; exit 2 ;;
esac
if [[ ! -d "$SRC/.git" ]]; then
  echo "cache for mode '$MODE' not found at $SRC; run bench/prepare-cache.sh first" >&2
  exit 3
fi

# Достаём поля кейса/режима через node и сохраняем многострочные значения в tmp-файлы
TMPDIR_CASE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_CASE"' EXIT

node -e '
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const c = d.cases.find(x => x.id === process.argv[2]);
if (!c) { process.stderr.write("case not found\n"); process.exit(2); }
const m = d.modes[process.argv[3]];
if (!m) { process.stderr.write("mode not found\n"); process.exit(2); }
const out = process.argv[4];
fs.writeFileSync(out + "/prompt.txt",     c.prompt);
fs.writeFileSync(out + "/append_sp.txt",  m.append_system_prompt);
fs.writeFileSync(out + "/disallowed.txt", (m.disallowed_tools || []).join(","));
fs.writeFileSync(out + "/meta.txt",       `${c.model}\n${c.kind}\n`);
' "$CASES" "$CASE_ID" "$MODE" "$TMPDIR_CASE"

PROMPT="$(cat "$TMPDIR_CASE/prompt.txt")"
APPEND_SP="$(cat "$TMPDIR_CASE/append_sp.txt")"
DISALLOWED="$(cat "$TMPDIR_CASE/disallowed.txt")"
{ IFS= read -r MODEL; IFS= read -r KIND; } < "$TMPDIR_CASE/meta.txt"
[[ -n "$MODEL_OVERRIDE" ]] && MODEL="$MODEL_OVERRIDE"

STAMP="$(date +%Y%m%d-%H%M%S)-$$-$RANDOM"
WORKDIR="$RUNS_DIR/${CASE_ID}-${MODE}-${STAMP}"

# свежая копия из кеша (rsync быстрее cp -R и сохраняет .arhit/)
rsync -a --delete "$SRC/" "$WORKDIR/"

OUT_JSON="$RESULTS_DIR/${CASE_ID}-${MODE}-${STAMP}.json"
LOG="$RESULTS_DIR/${CASE_ID}-${MODE}-${STAMP}.log"

DISALLOWED_ARGS=()
if [[ -n "$DISALLOWED" ]]; then
  IFS=',' read -ra D <<< "$DISALLOWED"
  for t in "${D[@]}"; do DISALLOWED_ARGS+=(--disallowedTools "$t"); done
fi

START_NS=$(python3 -c 'import time; print(int(time.time()*1e9))')
set +e
( cd "$WORKDIR" && printf '%s' "$PROMPT" | claude -p \
    --model "$MODEL" \
    --output-format json \
    --append-system-prompt "$APPEND_SP" \
    --permission-mode acceptEdits \
    --no-session-persistence \
    "${DISALLOWED_ARGS[@]}" \
    --add-dir "$WORKDIR" ) > "$OUT_JSON" 2> "$LOG"
RC=$?
set -e
END_NS=$(python3 -c 'import time; print(int(time.time()*1e9))')
WALL_S=$(python3 -c "print(round(($END_NS - $START_NS)/1e9, 2))")

node -e '
const fs = require("fs");
let j = {};
try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch(e) {}
const u = j.usage || {};
const out = {
  case: process.argv[2],
  mode: process.argv[3],
  model: process.argv[4],
  kind: process.argv[5],
  wall_s: parseFloat(process.argv[6]),
  rc: parseInt(process.argv[7], 10),
  input_tokens: u.input_tokens || 0,
  output_tokens: u.output_tokens || 0,
  cache_creation_tokens: u.cache_creation_input_tokens || 0,
  cache_read_tokens: u.cache_read_input_tokens || 0,
  total_tokens: (u.input_tokens||0)+(u.output_tokens||0)+(u.cache_creation_input_tokens||0)+(u.cache_read_input_tokens||0),
  cost_usd: j.total_cost_usd || 0,
  num_turns: j.num_turns || 0,
  result_excerpt: (j.result || "").slice(0, 280),
  result_path: process.argv[1],
  log_path: process.argv[8],
  workdir: process.argv[9]
};
process.stdout.write(JSON.stringify(out));
' "$OUT_JSON" "$CASE_ID" "$MODE" "$MODEL" "$KIND" "$WALL_S" "$RC" "$LOG" "$WORKDIR"

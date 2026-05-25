#!/usr/bin/env bash
# Готовит две кеш-копии lunchHunter:
#   bench/workspace/cache/lunchHunter-zero  — чистый клон, .arhit/ удалён
#   bench/workspace/cache/lunchHunter-arhit — клон с инициализированным .arhit/
# Использование: prepare-cache.sh [--refresh]   (--refresh пересоздаёт всё с нуля)
set -euo pipefail

REPO_URL="${BENCH_REPO_URL:-https://github.com/darkClaw921/lunchHunter}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WS="$ROOT/bench/workspace"
CACHE="$WS/cache"
SRC="$CACHE/lunchHunter-src"
ZERO="$CACHE/lunchHunter-zero"
ARHIT="$CACHE/lunchHunter-arhit"

REFRESH=0
[[ "${1:-}" == "--refresh" ]] && REFRESH=1

mkdir -p "$CACHE"

if [[ $REFRESH -eq 1 ]]; then
  rm -rf "$SRC" "$ZERO" "$ARHIT"
fi

# 1) свежий клон в SRC (если ещё нет)
if [[ ! -d "$SRC/.git" ]]; then
  echo "[prepare-cache] cloning $REPO_URL → $SRC" >&2
  git clone --depth 1 "$REPO_URL" "$SRC"
else
  echo "[prepare-cache] pulling $SRC" >&2
  git -C "$SRC" fetch --depth 1 origin HEAD >/dev/null 2>&1 || true
  git -C "$SRC" reset --hard FETCH_HEAD >/dev/null 2>&1 || true
fi

# 2) копия zero — без .arhit/
if [[ ! -d "$ZERO" || $REFRESH -eq 1 ]]; then
  echo "[prepare-cache] building zero copy → $ZERO" >&2
  rm -rf "$ZERO"
  rsync -a --delete "$SRC/" "$ZERO/"
  rm -rf "$ZERO/.arhit"
fi

# 3) копия arhit — с инициализированным .arhit/
if [[ ! -d "$ARHIT" || $REFRESH -eq 1 ]]; then
  echo "[prepare-cache] building arhit copy → $ARHIT" >&2
  rm -rf "$ARHIT"
  rsync -a --delete "$SRC/" "$ARHIT/"
  ( cd "$ARHIT" && arhit arch build && arhit analyze ) >&2
fi

# 4) копия caveman — без .arhit/, с установленным плагином caveman (плагин ставится глобально)
CAVEMAN="$CACHE/lunchHunter-caveman"
if [[ ! -d "$CAVEMAN" || $REFRESH -eq 1 ]]; then
  echo "[prepare-cache] building caveman copy → $CAVEMAN" >&2
  rm -rf "$CAVEMAN"
  rsync -a --delete "$SRC/" "$CAVEMAN/"
  rm -rf "$CAVEMAN/.arhit"
fi

# Устанавливаем плагин caveman в пользовательский профиль claude (только если явно запрошено)
if [[ "${BENCH_INSTALL_CAVEMAN:-0}" == "1" ]]; then
  if ! claude plugin list 2>/dev/null | grep -qi 'caveman'; then
    echo "[prepare-cache] installing caveman plugin" >&2
    claude plugin marketplace add JuliusBrussee/caveman >&2 || true
    claude plugin install caveman@caveman >&2 || true
  else
    echo "[prepare-cache] caveman plugin already installed" >&2
  fi
else
  echo "[prepare-cache] BENCH_INSTALL_CAVEMAN!=1 → пропускаю установку caveman" >&2
fi

echo "$ZERO"
echo "$ARHIT"
echo "$CAVEMAN"

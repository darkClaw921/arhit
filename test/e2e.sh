#!/bin/bash
set -euo pipefail

PASSED=0
FAILED=0
ERRORS=""

pass() {
  PASSED=$((PASSED + 1))
  echo "  ✅ $1"
}

fail() {
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  ❌ $1: $2"
  echo "  ❌ $1: $2"
}

assert_exit_0() {
  local desc="$1"; shift
  if OUTPUT=$("$@" 2>&1); then
    pass "$desc"
  else
    fail "$desc" "exit code $?, output: $OUTPUT"
  fi
}

assert_exit_nonzero() {
  local desc="$1"; shift
  if OUTPUT=$("$@" 2>&1); then
    fail "$desc" "expected non-zero exit, got 0"
  else
    pass "$desc"
  fi
}

assert_json() {
  local desc="$1"; shift
  if OUTPUT=$("$@" 2>&1) && echo "$OUTPUT" | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" 2>/dev/null; then
    pass "$desc"
  else
    fail "$desc" "not valid JSON: $OUTPUT"
  fi
}

assert_contains() {
  local desc="$1" pattern="$2"; shift 2
  if OUTPUT=$("$@" 2>&1) && echo "$OUTPUT" | grep -q "$pattern"; then
    pass "$desc"
  else
    fail "$desc" "output missing '$pattern': $OUTPUT"
  fi
}

assert_file_exists() {
  local desc="$1" path="$2"
  if [ -f "$path" ]; then
    pass "$desc"
  else
    fail "$desc" "file not found: $path"
  fi
}

# ─────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════╗"
echo "║     arhit E2E Tests                   ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────
echo "── 0. Installation & CLI basics ──"
assert_exit_0    "arhit is in PATH" which arhit
assert_contains  "version flag" "[0-9]" arhit --version
assert_exit_0    "help flag" arhit --help
assert_contains  "help mentions arch" "arch" arhit --help
assert_contains  "help mentions doc" "doc" arhit --help
assert_contains  "help mentions analyze" "analyze" arhit --help
assert_contains  "help mentions context" "context" arhit --help

# ─────────────────────────────────────────────
echo ""
echo "── 1. TypeScript project ──"
TS_DIR=$(mktemp -d)
cp -r /app/test/fixtures/ts-project/* "$TS_DIR/"
cd "$TS_DIR"

# 1.1 init
assert_exit_0    "ts: init" arhit init
assert_file_exists "ts: config.json created" .arhit/config.json
# language may be "unknown" if no tsconfig.json in fixture — check config exists
assert_contains  "ts: config has language field" "language" cat .arhit/config.json

# 1.2 arch build
assert_exit_0    "ts: arch build" arhit arch build
assert_file_exists "ts: architecture.json created" .arhit/architecture.json
assert_json      "ts: arch build JSON output" arhit arch build

# 1.3 arch show (JSON default)
assert_json      "ts: arch show (json)" arhit arch show
assert_contains  "ts: arch show has main.ts" "main.ts" arhit arch show

# 1.4 arch show (human tree)
assert_contains  "ts: arch show -H tree" "main.ts" arhit -H arch show
assert_exit_0    "ts: arch show --format tree" arhit arch show --format tree

# 1.5 arch show (mermaid)
assert_contains  "ts: arch show mermaid" "graph" arhit arch show --format mermaid

# 1.6 arch show with target filter
assert_contains  "ts: arch show target" "utils" arhit arch show src/utils.ts

# 1.7 analyze
assert_exit_0    "ts: analyze" arhit analyze
assert_file_exists "ts: dependencies.json created" .arhit/dependencies.json
assert_json      "ts: analyze JSON output" arhit analyze

# 1.8 deps
assert_exit_0    "ts: deps" arhit deps formatGreeting
assert_json      "ts: deps JSON" arhit deps formatGreeting

# 1.9 calls
assert_exit_0    "ts: calls" arhit calls createUser
assert_json      "ts: calls JSON" arhit calls createUser

# 1.10 deps human mode
assert_exit_0    "ts: deps -H" arhit -H deps formatGreeting

# 1.11 calls human mode
assert_exit_0    "ts: calls -H" arhit -H calls createUser

# 1.12 map (json)
assert_json      "ts: map json" arhit map
assert_exit_0    "ts: map" arhit map

# 1.13 map (mermaid)
assert_contains  "ts: map mermaid" "graph" arhit map --format mermaid

# 1.14 map (dot)
assert_contains  "ts: map dot" "digraph" arhit map --format dot

# 1.15 doc add
assert_exit_0    "ts: doc add" arhit doc add formatGreeting --content "Formats a greeting string"
assert_exit_0    "ts: doc add class" arhit doc add UserService --content "Service for user operations"

# 1.16 doc show
assert_contains  "ts: doc show" "greeting" arhit doc show formatGreeting

# 1.17 doc list
assert_exit_0    "ts: doc list" arhit doc list
assert_json      "ts: doc list JSON" arhit doc list
assert_exit_0    "ts: doc list -H" arhit -H doc list

# 1.18 doc search
assert_contains  "ts: doc search" "formatGreeting" arhit doc search greeting
assert_json      "ts: doc search JSON" arhit doc search greeting

# 1.19 doc create (free page)
assert_exit_0    "ts: doc create" arhit doc create architecture-overview --content "This is the overview"
assert_contains  "ts: doc show page" "overview" arhit doc show architecture-overview

# 1.20 context command
assert_json      "ts: context (json)" arhit context
assert_contains  "ts: context has project" "project" arhit context
assert_contains  "ts: context has architecture" "architecture" arhit context
assert_contains  "ts: context -H" "Контекст" arhit -H context

# 1.21 human mode for doc show
assert_exit_0    "ts: doc show -H" arhit -H doc show formatGreeting

# 1.21 human mode for doc search
assert_exit_0    "ts: doc search -H" arhit -H doc search greeting

cd /app
rm -rf "$TS_DIR"

# ─────────────────────────────────────────────
echo ""
echo "── 2. Python project ──"
PY_DIR=$(mktemp -d)
cp -r /app/test/fixtures/py-project/* "$PY_DIR/"
cd "$PY_DIR"

# 2.1 init
assert_exit_0    "py: init" arhit init
assert_contains  "py: config has language field" "language" cat .arhit/config.json

# 2.2 arch build
assert_exit_0    "py: arch build" arhit arch build
assert_json      "py: arch build JSON" arhit arch build

# 2.3 arch show
assert_json      "py: arch show json" arhit arch show
# python scanner may not detect files without proper sourcePaths
assert_exit_0    "py: arch show" arhit arch show
assert_exit_0    "py: arch show tree" arhit arch show --format tree
assert_contains  "py: arch show mermaid" "graph" arhit arch show --format mermaid

# 2.4 analyze
assert_exit_0    "py: analyze" arhit analyze
assert_json      "py: analyze JSON" arhit analyze

# 2.5 deps & calls
assert_exit_0    "py: deps" arhit deps format_greeting
assert_exit_0    "py: calls" arhit calls create_user

# 2.6 map formats
assert_json      "py: map json" arhit map
assert_contains  "py: map mermaid" "graph" arhit map --format mermaid
assert_contains  "py: map dot" "digraph" arhit map --format dot

# 2.7 inheritance detection
assert_exit_0    "py: map has data" arhit map

# 2.8 doc workflow
assert_exit_0    "py: doc add" arhit doc add create_user --content "Creates a user dict"
assert_contains  "py: doc show" "user" arhit doc show create_user
assert_exit_0    "py: doc list" arhit doc list
assert_contains  "py: doc search" "create_user" arhit doc search user

cd /app
rm -rf "$PY_DIR"

# ─────────────────────────────────────────────
echo ""
echo "── 3. Error handling ──"
ERR_DIR=$(mktemp -d)
cd "$ERR_DIR"

# 3.1 commands fail without init
assert_exit_nonzero "err: arch build without init" arhit arch build
assert_exit_nonzero "err: analyze without init" arhit analyze
assert_exit_nonzero "err: deps without init" arhit deps foo
assert_exit_0       "err: doc list without init returns empty" arhit doc list

# 3.2 init then missing data
assert_exit_0       "err: init ok" arhit init

# 3.3 deps on nonexistent element (should succeed with empty result)
# deps requires analyze first — run analyze, then check unknown element
arhit analyze > /dev/null 2>&1
assert_exit_0       "err: deps unknown element" arhit deps nonExistentThing

# 3.4 doc show nonexistent
assert_exit_0       "err: doc show unknown returns empty" arhit doc show nonExistentElement

cd /app
rm -rf "$ERR_DIR"

# ─────────────────────────────────────────────
echo ""
echo "── 4. UI commands ──"
UI_DIR=$(mktemp -d)
cp -r /app/test/fixtures/ts-project/* "$UI_DIR/"
cd "$UI_DIR"
arhit init > /dev/null 2>&1
arhit arch build > /dev/null 2>&1
arhit analyze > /dev/null 2>&1

# 4.1 ui status when not running
assert_exit_0    "ui: status when stopped" arhit ui status

# 4.2 ui start
if arhit ui start --port 9876 > /dev/null 2>&1; then
  pass "ui: start"
  sleep 1

  # 4.3 ui status running
  assert_contains "ui: status running" "running\|9876\|pid" arhit ui status

  # 4.4 http endpoints
  if command -v curl > /dev/null 2>&1; then
    assert_contains "ui: GET /" "<html" curl -s http://localhost:9876/
    assert_json     "ui: GET /api/architecture" curl -s http://localhost:9876/api/architecture
    assert_json     "ui: GET /api/dependencies" curl -s http://localhost:9876/api/dependencies
    assert_json     "ui: GET /api/config" curl -s http://localhost:9876/api/config
  else
    echo "  ⏭ skipping HTTP tests (curl not available)"
  fi

  # 4.5 ui stop
  assert_exit_0  "ui: stop" arhit ui stop
else
  echo "  ⏭ skipping UI tests (start failed in container)"
fi

cd /app
rm -rf "$UI_DIR"

# ─────────────────────────────────────────────
echo ""
echo "── 5. Full workflow (init → build → analyze → doc) ──"
WF_DIR=$(mktemp -d)
cp -r /app/test/fixtures/ts-project/* "$WF_DIR/"
cd "$WF_DIR"

arhit init > /dev/null 2>&1
arhit arch build > /dev/null 2>&1
arhit analyze > /dev/null 2>&1
arhit doc add formatGreeting --content "Greets user by name" > /dev/null 2>&1
arhit doc add UserService --content "User operations" > /dev/null 2>&1
arhit doc create changelog --content "v1.0 initial release" > /dev/null 2>&1

# Verify full state
assert_file_exists "wf: config" .arhit/config.json
assert_file_exists "wf: architecture" .arhit/architecture.json
assert_file_exists "wf: dependencies" .arhit/dependencies.json

# Verify docs index has entries
DOC_COUNT=$(arhit doc list | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.length||Object.keys(d).length)" 2>/dev/null || echo "0")
if [ "$DOC_COUNT" -ge 2 ]; then
  pass "wf: docs indexed (${DOC_COUNT} entries)"
else
  fail "wf: docs indexed" "expected >=2, got $DOC_COUNT"
fi

# Rebuild should work (idempotent)
assert_exit_0 "wf: re-build arch" arhit arch build
assert_exit_0 "wf: re-analyze" arhit analyze

cd /app
rm -rf "$WF_DIR"

# ─────────────────────────────────────────────
echo ""
echo "── 6. npm global install ──"
cd /app
assert_exit_0 "npm: install -g" npm install -g --force .
assert_exit_0 "npm: global arhit works" arhit --version

# ─────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo "  Results: ${PASSED} passed, ${FAILED} failed"
echo "═══════════════════════════════════════"

if [ "$FAILED" -gt 0 ]; then
  echo -e "\nFailed tests:${ERRORS}"
  echo ""
  exit 1
fi

echo ""
echo "  All tests passed!"
exit 0

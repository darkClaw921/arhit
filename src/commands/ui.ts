import http from 'node:http';
import { readJson, architecturePath, dependenciesPath, configPath, docsDir } from '../storage.js';
import type { Architecture, DependencyMap, ArhitConfig, DocEntry } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';

function jsonResponse(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function htmlResponse(res: http.ServerResponse, html: string) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function getDocsIndex(): DocEntry[] {
  const indexPath = path.join(docsDir(), '_index.json');
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch {
    return [];
  }
}

function getDocContent(element: string): string | null {
  const safe = element.replace(/[^\p{L}\p{N}._-]/gu, '_');
  const base = docsDir();

  // Search in subdirectories first
  try {
    for (const dir of fs.readdirSync(base, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name.startsWith('_')) continue;
      const candidate = path.join(base, dir.name, `${safe}.md`);
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf-8');
    }
  } catch {}

  // Fallback to flat (legacy)
  try {
    return fs.readFileSync(path.join(base, `${safe}.md`), 'utf-8');
  } catch {
    return null;
  }
}

const PAGE_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>arhit — Архитектура проекта</title>
<style>
  :root {
    --bg: #0d1117; --bg2: #161b22; --bg3: #21262d;
    --text: #e6edf3; --text2: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --orange: #d29922; --red: #f85149;
    --purple: #bc8cff; --border: #30363d; --radius: 8px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); }

  .layout { display: grid; grid-template-columns: 260px 1fr; grid-template-rows: 56px 1fr; height: 100vh; }

  header { grid-column: 1 / -1; background: var(--bg2); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 20px; gap: 16px; }
  header h1 { font-size: 18px; font-weight: 600; }
  header h1 span { color: var(--accent); }
  header .stats { margin-left: auto; display: flex; gap: 16px; font-size: 13px; color: var(--text2); }
  header .stats b { color: var(--text); }

  nav { background: var(--bg2); border-right: 1px solid var(--border); padding: 12px 0; overflow-y: auto; }
  nav a { display: block; padding: 8px 20px; color: var(--text2); text-decoration: none; font-size: 14px; cursor: pointer; border-left: 3px solid transparent; }
  nav a:hover { background: var(--bg3); color: var(--text); }
  nav a.active { color: var(--accent); border-left-color: var(--accent); background: var(--bg3); }
  nav .section { padding: 12px 20px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--text2); }

  main { overflow-y: auto; padding: 24px; }

  .card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
  .card h2 { font-size: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .card h3 { font-size: 14px; margin: 12px 0 8px; color: var(--text2); }

  .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .tag-function { background: #1f3a5f; color: var(--accent); }
  .tag-class { background: #3b2f4a; color: var(--purple); }
  .tag-interface { background: #2a3a2a; color: var(--green); }
  .tag-variable { background: #3a2f1f; color: var(--orange); }
  .tag-type { background: #2a3a2a; color: var(--green); }
  .tag-enum { background: #3a2f1f; color: var(--orange); }
  .tag-file { background: var(--bg3); color: var(--text2); }
  .tag-page { background: var(--bg3); color: var(--text2); }

  .tree { font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; font-size: 13px; line-height: 1.8; }
  .tree-item { padding: 2px 0; cursor: pointer; }
  .tree-item:hover { color: var(--accent); }
  .tree-children { padding-left: 24px; border-left: 1px solid var(--border); margin-left: 8px; }

  .dep-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; font-family: monospace; }
  .dep-arrow { color: var(--accent); }
  .dep-type { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--bg3); color: var(--text2); }

  .search { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; color: var(--text); width: 100%; font-size: 14px; margin-bottom: 16px; outline: none; }
  .search:focus { border-color: var(--accent); }

  .doc-content { white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: var(--text2); }
  .doc-content h1, .doc-content h2, .doc-content h3 { color: var(--text); margin: 12px 0 8px; }

  .mermaid-box { background: #fff; border-radius: var(--radius); padding: 20px; overflow: auto; }

  .empty { color: var(--text2); font-style: italic; padding: 20px; text-align: center; }

  #mermaid-diagram { background: #fff; border-radius: var(--radius); padding: 20px; min-height: 200px; overflow: auto; }
  #mermaid-diagram svg { max-width: 100%; }

  .tab-bar { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
  .tab { padding: 8px 16px; cursor: pointer; color: var(--text2); font-size: 14px; border-bottom: 2px solid transparent; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
</style>
</head>
<body>
<div class="layout">
  <header>
    <h1><span>arhit</span> — Архитектура проекта</h1>
    <div class="stats">
      <span>Файлов: <b id="stat-files">—</b></span>
      <span>Элементов: <b id="stat-elements">—</b></span>
      <span>Зависимостей: <b id="stat-deps">—</b></span>
      <span>Документов: <b id="stat-docs">—</b></span>
    </div>
  </header>

  <nav id="sidebar">
    <div class="section">Навигация</div>
    <a onclick="showPage('arch')" id="nav-arch">Архитектура</a>
    <a onclick="showPage('deps')" id="nav-deps">Зависимости</a>
    <a onclick="showPage('diagram')" id="nav-diagram">Диаграмма</a>
    <a onclick="showPage('docs')" id="nav-docs">Документация</a>
    <div class="section" id="files-section">Файлы</div>
    <div id="file-list"></div>
  </nav>

  <main id="content"></main>
</div>

<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
mermaid.initialize({ startOnLoad: false, theme: 'dark' });

let archData = null, depsData = null, docsData = [], config = null;
let currentPage = 'arch';

async function fetchJSON(url) {
  const r = await fetch(url);
  return r.json();
}

async function loadData() {
  [archData, depsData, docsData, config] = await Promise.all([
    fetchJSON('/api/architecture'),
    fetchJSON('/api/dependencies'),
    fetchJSON('/api/docs'),
    fetchJSON('/api/config'),
  ]);

  document.getElementById('stat-files').textContent = archData?.nodes?.length || 0;
  document.getElementById('stat-elements').textContent = archData?.nodes?.reduce((s, n) => s + (n.children?.length || 0), 0) || 0;
  document.getElementById('stat-deps').textContent = depsData?.dependencies?.length || 0;
  document.getElementById('stat-docs').textContent = docsData?.length || 0;

  // Populate file list
  const fileList = document.getElementById('file-list');
  fileList.innerHTML = '';
  if (archData?.nodes) {
    for (const node of archData.nodes) {
      const a = document.createElement('a');
      a.textContent = node.name;
      a.onclick = () => showFile(node);
      fileList.appendChild(a);
    }
  }

  showPage('arch');
}

function showPage(page) {
  currentPage = page;
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');

  const c = document.getElementById('content');
  switch(page) {
    case 'arch': renderArch(c); break;
    case 'deps': renderDeps(c); break;
    case 'diagram': renderDiagram(c); break;
    case 'docs': renderDocs(c); break;
  }
}

function tagHTML(type) {
  return '<span class="tag tag-' + type + '">' + type + '</span>';
}

function renderArch(c) {
  if (!archData?.nodes?.length) { c.innerHTML = '<div class="empty">Нет данных. Запустите arhit arch build</div>'; return; }

  let html = '<input class="search" placeholder="Поиск по архитектуре..." oninput="filterArch(this.value)">';
  html += '<div id="arch-tree">';
  html += renderTree(archData.nodes);
  html += '</div>';
  c.innerHTML = html;
}

function renderTree(nodes, filter) {
  let html = '';
  for (const node of nodes) {
    if (filter && !node.name.toLowerCase().includes(filter) &&
        !node.children?.some(ch => ch.name.toLowerCase().includes(filter))) continue;

    const exports = node.exports?.length ? ' <span style="color:var(--text2);font-size:12px">(exports: ' + node.exports.join(', ') + ')</span>' : '';
    html += '<div class="tree-item" onclick="showFile(archData.nodes.find(n=>n.id===\\''+node.id+'\\'))">' + tagHTML(node.type) + ' <strong>' + node.name + '</strong>' + exports + '</div>';

    if (node.children?.length) {
      html += '<div class="tree-children">';
      for (const child of node.children) {
        if (filter && !child.name.toLowerCase().includes(filter)) continue;
        const cexp = child.exports?.length ? ' <span style="color:var(--green);font-size:11px">exported</span>' : '';
        html += '<div class="tree-item" onclick="showElement(\\''+child.id.replace(/'/g, "\\\\'")+'\\')">' + tagHTML(child.type) + ' ' + child.name + cexp + (child.line ? ' <span style="color:var(--text2);font-size:11px">:' + child.line + '</span>' : '') + '</div>';
      }
      html += '</div>';
    }
  }
  return html;
}

function filterArch(val) {
  const f = val.toLowerCase();
  document.getElementById('arch-tree').innerHTML = renderTree(archData.nodes, f);
}

function renderDeps(c) {
  if (!depsData?.dependencies?.length) { c.innerHTML = '<div class="empty">Нет данных. Запустите arhit analyze</div>'; return; }

  let html = '<input class="search" placeholder="Поиск по зависимостям..." oninput="filterDeps(this.value)">';
  html += '<div class="tab-bar"><div class="tab active" onclick="setDepFilter(this,\\'all\\')">Все</div><div class="tab" onclick="setDepFilter(this,\\'import\\')">Импорты</div><div class="tab" onclick="setDepFilter(this,\\'call\\')">Вызовы</div><div class="tab" onclick="setDepFilter(this,\\'extends\\')">Наследование</div></div>';
  html += '<div id="deps-list">';
  html += renderDepsList(depsData.dependencies);
  html += '</div>';
  c.innerHTML = html;
}

let depTypeFilter = 'all';
function setDepFilter(el, type) {
  depTypeFilter = type;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const search = document.querySelector('.search');
  filterDeps(search ? search.value : '');
}

function renderDepsList(deps, filter) {
  let html = '';
  let shown = 0;
  for (const d of deps) {
    if (depTypeFilter !== 'all' && d.type !== depTypeFilter) continue;
    if (filter) {
      const f = filter.toLowerCase();
      if (!d.from.toLowerCase().includes(f) && !d.to.toLowerCase().includes(f) &&
          !(d.fromElement||'').toLowerCase().includes(f) && !(d.toElement||'').toLowerCase().includes(f)) continue;
    }
    if (++shown > 200) { html += '<div style="color:var(--text2);padding:8px">...ещё ' + (deps.length - 200) + '</div>'; break; }
    const from = d.fromElement ? d.from + ':' + d.fromElement : d.from;
    const to = d.toElement ? d.to + ':' + d.toElement : d.to;
    html += '<div class="dep-row"><span>' + from + '</span><span class="dep-type">' + d.type + '</span><span class="dep-arrow">→</span><span>' + to + '</span></div>';
  }
  return html || '<div class="empty">Ничего не найдено</div>';
}

function filterDeps(val) {
  document.getElementById('deps-list').innerHTML = renderDepsList(depsData.dependencies, val);
}

async function renderDiagram(c) {
  if (!depsData?.dependencies?.length) { c.innerHTML = '<div class="empty">Нет данных. Запустите arhit analyze</div>'; return; }

  c.innerHTML = '<div class="tab-bar"><div class="tab active" onclick="renderMermaid(\\'deps\\',this)">Зависимости</div><div class="tab" onclick="renderMermaid(\\'arch\\',this)">Архитектура</div></div><div id="mermaid-diagram"></div>';
  renderMermaid('deps');
}

async function renderMermaid(type, el) {
  if (el) { document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); el.classList.add('active'); }
  const resp = await fetch('/api/mermaid?type=' + type);
  const data = await resp.json();
  const container = document.getElementById('mermaid-diagram');
  try {
    const { svg } = await mermaid.render('mermaid-svg', data.mermaid);
    container.innerHTML = svg;
  } catch(e) {
    container.innerHTML = '<pre style="color:#333;font-size:12px">' + data.mermaid + '</pre>';
  }
}

async function renderDocs(c) {
  let html = '<input class="search" placeholder="Поиск по документации..." oninput="filterDocs(this.value)">';
  html += '<div id="docs-list">';

  if (!docsData?.length) {
    html += '<div class="empty">Нет документации. Используйте arhit doc add</div>';
  } else {
    for (const doc of docsData) {
      html += '<div class="card" style="cursor:pointer" onclick="showDoc(\\''+doc.element.replace(/'/g, "\\\\'")+'\\')">';
      html += '<h2>' + tagHTML(doc.type) + ' ' + doc.element + '</h2>';
      html += '<div style="color:var(--text2);font-size:13px">' + (doc.path || 'Свободная страница') + '</div>';
      html += '</div>';
    }
  }

  html += '</div>';
  c.innerHTML = html;
}

function filterDocs(val) {
  const f = val.toLowerCase();
  const cards = document.querySelectorAll('#docs-list .card');
  cards.forEach(card => {
    card.style.display = card.textContent.toLowerCase().includes(f) ? '' : 'none';
  });
}

async function showDoc(element) {
  const resp = await fetch('/api/docs/' + encodeURIComponent(element));
  const data = await resp.json();
  const c = document.getElementById('content');
  c.innerHTML = '<a style="color:var(--accent);cursor:pointer;font-size:13px" onclick="showPage(\\'docs\\')">&larr; Назад к документации</a>' +
    '<div class="card" style="margin-top:12px"><h2>' + tagHTML(data.type || 'page') + ' ' + data.element + '</h2>' +
    '<div style="color:var(--text2);font-size:12px;margin-bottom:12px">' + (data.path || '') + '</div>' +
    '<div class="doc-content">' + (data.markdown || data.content || 'Нет содержимого').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div></div>';
}

function showFile(node) {
  if (!node) return;
  const c = document.getElementById('content');
  const deps = depsData?.dependencies?.filter(d => d.from === node.path || d.to === node.path) || [];

  let html = '<a style="color:var(--accent);cursor:pointer;font-size:13px" onclick="showPage(\\'arch\\')">&larr; Назад</a>';
  html += '<div class="card" style="margin-top:12px"><h2>' + tagHTML('file') + ' ' + node.name + '</h2>';
  html += '<div style="color:var(--text2);font-size:13px;margin-bottom:12px">' + node.path + '</div>';

  if (node.children?.length) {
    html += '<h3>Элементы (' + node.children.length + ')</h3>';
    for (const ch of node.children) {
      html += '<div style="padding:4px 0">' + tagHTML(ch.type) + ' ' + ch.name + (ch.line ? ' <span style="color:var(--text2);font-size:11px">строка ' + ch.line + '</span>' : '') + '</div>';
    }
  }

  if (deps.length) {
    html += '<h3>Зависимости (' + deps.length + ')</h3>';
    for (const d of deps.slice(0, 50)) {
      const from = d.fromElement ? d.from + ':' + d.fromElement : d.from;
      const to = d.toElement ? d.to + ':' + d.toElement : d.to;
      html += '<div class="dep-row"><span>' + from + '</span><span class="dep-type">' + d.type + '</span><span class="dep-arrow">→</span><span>' + to + '</span></div>';
    }
  }

  html += '</div>';
  c.innerHTML = html;
}

function showElement(id) {
  if (!archData) return;
  for (const node of archData.nodes) {
    const child = node.children?.find(c => c.id === id);
    if (child) {
      const c = document.getElementById('content');
      const deps = depsData?.dependencies?.filter(d =>
        d.fromElement === child.name || d.toElement === child.name ||
        (d.from === child.path && !d.fromElement) || (d.to === child.path && !d.toElement)
      ) || [];

      let html = '<a style="color:var(--accent);cursor:pointer;font-size:13px" onclick="showPage(\\'arch\\')">&larr; Назад</a>';
      html += '<div class="card" style="margin-top:12px"><h2>' + tagHTML(child.type) + ' ' + child.name + '</h2>';
      html += '<div style="color:var(--text2);font-size:13px">' + child.path + (child.line ? ':' + child.line : '') + '</div>';

      if (child.exports?.length) {
        html += '<div style="margin-top:8px"><span class="tag tag-function">exported</span></div>';
      }

      if (deps.length) {
        html += '<h3 style="margin-top:16px">Связи (' + deps.length + ')</h3>';
        for (const d of deps.slice(0, 50)) {
          const from = d.fromElement ? d.from + ':' + d.fromElement : d.from;
          const to = d.toElement ? d.to + ':' + d.toElement : d.to;
          html += '<div class="dep-row"><span>' + from + '</span><span class="dep-type">' + d.type + '</span><span class="dep-arrow">→</span><span>' + to + '</span></div>';
        }
      }

      html += '</div>';
      c.innerHTML = html;
      return;
    }
  }
}

loadData();
</script>
</body>
</html>`;

import { getArhitDir } from '../storage.js';
import { spawn } from 'node:child_process';

function pidFilePath(): string {
  return path.join(getArhitDir(), 'ui.pid');
}

function getRunningPid(): number | null {
  try {
    const pid = parseInt(fs.readFileSync(pidFilePath(), 'utf-8').trim(), 10);
    // Check if process is alive
    process.kill(pid, 0);
    return pid;
  } catch {
    // Clean up stale pid file
    try { fs.unlinkSync(pidFilePath()); } catch {}
    return null;
  }
}

function createServer(port: number): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const pathname = url.pathname;

    if (pathname === '/api/architecture') {
      const arch = readJson<Architecture>(architecturePath());
      return jsonResponse(res, arch || { nodes: [] });
    }

    if (pathname === '/api/dependencies') {
      const deps = readJson<DependencyMap>(dependenciesPath());
      return jsonResponse(res, deps || { dependencies: [] });
    }

    if (pathname === '/api/config') {
      const cfg = readJson<ArhitConfig>(configPath());
      return jsonResponse(res, cfg || {});
    }

    if (pathname === '/api/docs') {
      return jsonResponse(res, getDocsIndex());
    }

    if (pathname.startsWith('/api/docs/')) {
      const element = decodeURIComponent(pathname.slice('/api/docs/'.length));
      const index = getDocsIndex();
      const entry = index.find(e => e.element === element);
      const markdown = getDocContent(element);
      return jsonResponse(res, { ...entry, element, markdown });
    }

    if (pathname === '/api/mermaid') {
      const type = url.searchParams.get('type') || 'deps';
      if (type === 'arch') {
        const arch = readJson<Architecture>(architecturePath());
        if (!arch) return jsonResponse(res, { mermaid: 'graph TD\n  empty[No data]' });
        let mermaid = 'graph TD\n';
        for (const node of arch.nodes) {
          const id = node.id.replace(/[^a-zA-Z0-9_]/g, '_');
          mermaid += `  ${id}["${node.name}"]\n`;
          for (const child of node.children || []) {
            const cid = child.id.replace(/[^a-zA-Z0-9_]/g, '_');
            mermaid += `  ${id} --> ${cid}["${child.name} (${child.type})"]\n`;
          }
        }
        return jsonResponse(res, { mermaid });
      } else {
        const deps = readJson<DependencyMap>(dependenciesPath());
        if (!deps) return jsonResponse(res, { mermaid: 'graph LR\n  empty[No data]' });
        let mermaid = 'graph LR\n';
        const seen = new Set<string>();
        for (const d of deps.dependencies) {
          const from = (d.from + (d.fromElement ? '.' + d.fromElement : '')).replace(/[^a-zA-Z0-9_]/g, '_');
          const to = (d.to + (d.toElement ? '.' + d.toElement : '')).replace(/[^a-zA-Z0-9_]/g, '_');
          const key = `${from}-${d.type}-${to}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (seen.size > 100) break;
          mermaid += `  ${from} -->|${d.type}| ${to}\n`;
        }
        return jsonResponse(res, { mermaid });
      }
    }

    return htmlResponse(res, PAGE_HTML);
  });
}

// Called when running as daemon (--daemon flag)
function runDaemon(port: number): void {
  const server = createServer(port);
  server.listen(port, () => {
    fs.writeFileSync(pidFilePath(), String(process.pid));
    // Detach stdio for daemon mode
    if (process.send) {
      process.send({ status: 'started', pid: process.pid, port });
    }
  });

  process.on('SIGTERM', () => {
    server.close();
    try { fs.unlinkSync(pidFilePath()); } catch {}
    process.exit(0);
  });

  process.on('SIGINT', () => {
    server.close();
    try { fs.unlinkSync(pidFilePath()); } catch {}
    process.exit(0);
  });
}

export function uiStartCommand(options: { port?: string; human?: boolean; daemon?: boolean }) {
  const port = parseInt(options.port || '3000', 10);

  // Check if already running
  const existingPid = getRunningPid();
  if (existingPid) {
    if (options.human) {
      console.log(`UI уже запущен (PID: ${existingPid}). Остановите через: arhit ui stop`);
    } else {
      console.log(JSON.stringify({ status: 'already_running', pid: existingPid }));
    }
    return;
  }

  if (options.daemon) {
    // We are the daemon process
    runDaemon(port);
    return;
  }

  // Spawn detached daemon process
  const binPath = process.argv[1];
  const child = spawn(process.execPath, [binPath, 'ui', 'start', '--port', String(port), '--daemon'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    cwd: process.cwd(),
  });

  child.unref();

  // Wait a moment for server to start, then check pid file
  setTimeout(() => {
    const pid = getRunningPid();
    if (pid) {
      if (options.human) {
        console.log(`\n  arhit UI запущен в фоне`);
        console.log(`  URL:  http://localhost:${port}`);
        console.log(`  PID:  ${pid}`);
        console.log(`\n  Остановить: arhit ui stop\n`);
      } else {
        console.log(JSON.stringify({ status: 'started', url: `http://localhost:${port}`, pid, port }));
      }
    } else {
      if (options.human) {
        console.log('Ошибка запуска сервера. Проверьте, свободен ли порт ' + port);
      } else {
        console.log(JSON.stringify({ status: 'error', message: 'Failed to start server' }));
      }
    }
  }, 1000);
}

export function uiStopCommand(options: { human?: boolean }) {
  const pid = getRunningPid();
  if (!pid) {
    if (options.human) {
      console.log('UI не запущен.');
    } else {
      console.log(JSON.stringify({ status: 'not_running' }));
    }
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    try { fs.unlinkSync(pidFilePath()); } catch {}
    if (options.human) {
      console.log(`UI остановлен (PID: ${pid}).`);
    } else {
      console.log(JSON.stringify({ status: 'stopped', pid }));
    }
  } catch {
    try { fs.unlinkSync(pidFilePath()); } catch {}
    if (options.human) {
      console.log('Процесс не найден. PID-файл очищен.');
    } else {
      console.log(JSON.stringify({ status: 'cleaned', pid }));
    }
  }
}

export function uiStatusCommand(options: { human?: boolean }) {
  const pid = getRunningPid();
  if (pid) {
    if (options.human) {
      console.log(`UI запущен (PID: ${pid}).`);
    } else {
      console.log(JSON.stringify({ status: 'running', pid }));
    }
  } else {
    if (options.human) {
      console.log('UI не запущен.');
    } else {
      console.log(JSON.stringify({ status: 'not_running' }));
    }
  }
}

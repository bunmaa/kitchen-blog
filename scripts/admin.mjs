/**
 * 管理画面サーバー
 * 下書き記事の一覧確認・公開切り替え・Gitプッシュをブラウザから操作できる
 *
 * 使い方: node scripts/admin.mjs
 * → http://localhost:4321/admin を開く
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = path.join(__dirname, '../src/content/articles');
const PORT = 4321;

function getArticles() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(filename => {
      const content = fs.readFileSync(path.join(ARTICLES_DIR, filename), 'utf-8');
      const titleMatch = content.match(/^title:\s*"(.+)"/m);
      const statusMatch = content.match(/^status:\s*(\w+)/m);
      const dateMatch = content.match(/^pubDate:\s*(.+)/m);
      return {
        filename,
        title: titleMatch ? titleMatch[1] : filename,
        status: statusMatch ? statusMatch[1] : 'draft',
        pubDate: dateMatch ? dateMatch[1].trim() : '',
      };
    })
    .sort((a, b) => b.pubDate.localeCompare(a.pubDate));
}

function setArticleStatus(filename, status) {
  const filePath = path.join(ARTICLES_DIR, filename);
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.replace(/^status:\s*\w+/m, `status: ${status}`);
  fs.writeFileSync(filePath, content, 'utf-8');
}

function getArticleContent(filename) {
  const filePath = path.join(ARTICLES_DIR, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

function renderHTML(articles) {
  const rows = articles.map(a => `
    <tr>
      <td>${a.pubDate}</td>
      <td><a href="/admin/preview?file=${encodeURIComponent(a.filename)}">${a.title}</a></td>
      <td>
        <span class="badge ${a.status === 'published' ? 'badge-pub' : 'badge-draft'}">
          ${a.status === 'published' ? '公開中' : '下書き'}
        </span>
      </td>
      <td>
        ${a.status === 'draft'
          ? `<button onclick="setStatus('${a.filename}','published')" class="btn btn-pub">公開する</button>`
          : `<button onclick="setStatus('${a.filename}','draft')" class="btn btn-draft">下書きに戻す</button>`
        }
        <a href="/admin/edit?file=${encodeURIComponent(a.filename)}" class="btn btn-edit">編集</a>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>管理画面 | 調理家電ナビ</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hiragino Sans', sans-serif; background: #f5f5f5; }
  header { background: #2c3e50; color: white; padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 1.2rem; }
  main { max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
  .actions { margin-bottom: 1.5rem; display: flex; gap: .8rem; }
  .card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: .7rem 1rem; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f9f9f9; font-size: .85rem; color: #666; }
  td a { color: #2980b9; text-decoration: none; }
  .badge { padding: .2rem .6rem; border-radius: 20px; font-size: .8rem; }
  .badge-pub { background: #d5f5e3; color: #1e8449; }
  .badge-draft { background: #fef9e7; color: #b7950b; }
  .btn { padding: .3rem .8rem; border: none; border-radius: 4px; cursor: pointer; font-size: .85rem; text-decoration: none; }
  .btn-pub { background: #27ae60; color: white; }
  .btn-draft { background: #e67e22; color: white; }
  .btn-edit { background: #3498db; color: white; margin-left: .3rem; }
  .btn-deploy { background: #8e44ad; color: white; padding: .6rem 1.4rem; font-size: 1rem; }
  .btn-research { background: #16a085; color: white; padding: .6rem 1.4rem; font-size: 1rem; }
  #msg { margin-top: 1rem; padding: .8rem 1rem; border-radius: 6px; display: none; }
  .msg-ok { background: #d5f5e3; color: #1e8449; }
  .msg-err { background: #fadbd8; color: #922b21; }
</style>
</head>
<body>
<header>
  <h1>🍳 調理家電ナビ 管理画面</h1>
  <span style="font-size:.85rem; opacity:.7">localhost 限定</span>
</header>
<main>
  <div class="actions">
    <button class="btn btn-research" onclick="runResearch()">🔍 リサーチ実行</button>
    <button class="btn btn-deploy" onclick="deployToCF()">🚀 Cloudflare にデプロイ</button>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr><th>日付</th><th>タイトル</th><th>ステータス</th><th>操作</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:2rem;">記事がありません。リサーチ → 執筆スクリプトを実行してください</td></tr>'}</tbody>
    </table>
  </div>

  <div id="msg"></div>
</main>

<script>
async function setStatus(filename, status) {
  const res = await fetch('/admin/set-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, status }),
  });
  if (res.ok) location.reload();
  else showMsg('ステータス変更に失敗しました', false);
}

async function deployToCF() {
  showMsg('デプロイ中...', true);
  const res = await fetch('/admin/deploy', { method: 'POST' });
  const data = await res.json();
  showMsg(data.message, res.ok);
}

async function runResearch() {
  showMsg('リサーチ中（30秒ほどかかります）...', true);
  const res = await fetch('/admin/research', { method: 'POST' });
  const data = await res.json();
  showMsg(data.message, res.ok);
}

function showMsg(text, ok) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = ok ? 'msg-ok' : 'msg-err';
  el.style.display = 'block';
  if (ok) setTimeout(() => el.style.display = 'none', 4000);
}
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 管理画面トップ
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const articles = getArticles();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHTML(articles));
    return;
  }

  // ステータス変更API
  if (url.pathname === '/admin/set-status' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { filename, status } = JSON.parse(body);
        setArticleStatus(filename, status);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // デプロイAPI（git add → commit → push）
  if (url.pathname === '/admin/deploy' && req.method === 'POST') {
    try {
      const projectDir = path.join(__dirname, '..');
      execSync('git add -A', { cwd: projectDir });
      execSync(`git commit -m "記事更新 ${new Date().toLocaleDateString('ja-JP')}"`, { cwd: projectDir });
      execSync('git push', { cwd: projectDir });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '✅ デプロイ完了！Cloudflare Pages に反映されます（1〜2分）' }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `⚠️ ${e.message}` }));
    }
    return;
  }

  // リサーチ実行API
  if (url.pathname === '/admin/research' && req.method === 'POST') {
    try {
      execSync('node scripts/research.mjs', {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        timeout: 60000,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: '✅ リサーチ完了！scripts/research-results.json に保存されました' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `❌ ${e.message}` }));
    }
    return;
  }

  // プレビュー
  if (url.pathname === '/admin/preview') {
    const filename = url.searchParams.get('file');
    if (filename) {
      const content = getArticleContent(filename);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
      return;
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🍳 管理画面を起動しました`);
  console.log(`   http://localhost:${PORT}/admin\n`);
  console.log('終了するには Ctrl+C を押してください');
});

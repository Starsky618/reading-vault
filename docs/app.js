// ===== 阅读日记前端 =====
//
// 数据读写全部通过 GitHub API 完成。
// GitHub Pages 只服务 /docs 目录下的静态文件（HTML/CSS/JS），
// 仓库中的 /data 目录无法通过相对路径访问。
// 因此所有数据操作统一走以下两条通道：
//   读取：GitHub raw URL（公开仓库无需 token）
//   写入：GitHub REST API（需要 token）

// ============================================================
// 配置
// ============================================================

function getConfig() {
  return {
    token: localStorage.getItem('gh_token') || '',
    username: localStorage.getItem('gh_username') || 'Starsky618',
    repo: localStorage.getItem('gh_repo') || 'reading-vault',
  };
}

// 拼接 raw 文件 URL（公开仓库免鉴权，加时间戳破缓存）
function rawUrl(path) {
  const c = getConfig();
  return `https://raw.githubusercontent.com/${c.username}/${c.repo}/main/${path}?t=${Date.now()}`;
}

// 拼接 API URL
function apiUrl(path) {
  const c = getConfig();
  return `https://api.github.com/repos/${c.username}/${c.repo}/contents/${path}`;
}

// 带 token 的 fetch header
function authHeaders() {
  return { 'Authorization': `Bearer ${getConfig().token}` };
}

// ============================================================
// 平台图标映射
// ============================================================

const SOURCE_MAP = {
  'bilibili':    { name: 'B站', class: 'source-bilibili', icon: '📺' },
  'youtube':     { name: 'YouTube', class: 'source-youtube', icon: '▶️' },
  'weixin':      { name: '微信', class: 'source-wechat', icon: '💬' },
  'mp.weixin':   { name: '微信', class: 'source-wechat', icon: '💬' },
  'x.com':       { name: 'X', class: 'source-x', icon: '🐦' },
  'twitter':     { name: 'X', class: 'source-x', icon: '🐦' },
  'xiaohongshu': { name: '小红书', class: 'source-xiaohongshu', icon: '📕' },
  'zhihu':       { name: '知乎', class: 'source-zhihu', icon: '💡' },
};

// ============================================================
// 工具函数
// ============================================================

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateCN(str) {
  const [, m, d] = str.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}

// 解析 Markdown frontmatter
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  });
  return { meta, body: match[2] };
}

function getSourceInfo(source) {
  if (!source) return { name: '网页', class: 'source-default', icon: '🔗' };
  const lower = source.toLowerCase();
  for (const [key, info] of Object.entries(SOURCE_MAP)) {
    if (lower.includes(key)) return info;
  }
  return { name: source, class: 'source-default', icon: '🔗' };
}

function guessSource(url) {
  try {
    for (const [key, info] of Object.entries(SOURCE_MAP)) {
      if (url.includes(key)) return info;
    }
    return { name: new URL(url).hostname, class: 'source-default', icon: '🔗' };
  } catch {
    return { name: '网页', class: 'source-default', icon: '🔗' };
  }
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ============================================================
// 链接预览（Microlink 免费 API）
// ============================================================

async function fetchLinkPreview(url) {
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      return {
        title: json.data.title || '',
        description: json.data.description || '',
        image: json.data.image?.url || '',
      };
    }
  } catch {}
  return null;
}

// ============================================================
// 卡片渲染
// ============================================================

// 已总结文章的卡片
function renderCard(meta, body) {
  const sourceInfo = getSourceInfo(meta.source);

  const coreMatch = body.match(/\*\*核心观点\*\*[：:]\s*(.*)/);
  const core = coreMatch ? coreMatch[1] : '';

  const pointsMatch = body.match(/\*\*关键要点\*\*[：:]\s*\n([\s\S]*?)(?=\n\*\*|$)/);
  let pointsHtml = '';
  if (pointsMatch) {
    pointsHtml = pointsMatch[1]
      .split('\n')
      .filter(l => /^\d+\./.test(l))
      .map(l => `<li>${l.replace(/^\d+\.\s*/, '').trim()}</li>`)
      .join('');
  }

  const thoughtMatch = body.match(/\*\*我的想法\*\*[：:]\s*([\s\S]*?)$/);
  const thought = thoughtMatch ? thoughtMatch[1].trim() : '';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-header">
      <span class="card-source ${sourceInfo.class}">${sourceInfo.icon} ${sourceInfo.name}</span>
      <span class="card-date">${meta.date || ''}</span>
    </div>
    ${meta.cover ? `<img class="card-cover" src="${meta.cover}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
    <a class="card-title" href="${meta.url || '#'}" target="_blank" rel="noopener">${meta.title || '无标题'}</a>
    ${core ? `<p class="card-summary">${core}</p>` : ''}
    ${pointsHtml ? `<ul class="card-points">${pointsHtml}</ul>` : ''}
    <div class="card-footer">
      <span class="card-tag">#${meta.category || '未分类'}</span>
    </div>
    ${thought ? `<p class="card-thought">💭 ${thought}</p>` : ''}
  `;
  return card;
}

// 待处理 URL 的卡片（带预览和删除按钮）
function renderPendingCard(url, filename, preview) {
  const sourceInfo = guessSource(url);
  const title = (preview && preview.title) ? preview.title : url;
  const card = document.createElement('div');
  card.className = 'card card-pending';
  card.dataset.filename = filename;
  card.innerHTML = `
    <div class="card-header">
      <span class="card-source ${sourceInfo.class}">${sourceInfo.icon} ${sourceInfo.name}</span>
      <div>
        <span class="pending-badge">待总结</span>
        <button class="btn-delete" title="删除">✕</button>
      </div>
    </div>
    ${(preview && preview.image) ? `<img class="card-cover" src="${preview.image}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
    <a class="card-title" href="${url}" target="_blank" rel="noopener">${title}</a>
    ${(preview && preview.description) ? `<p class="card-summary">${preview.description}</p>` : ''}
    <span class="card-date">${filename.replace('.txt', '').replace('_', ' ')}</span>
  `;

  card.querySelector('.btn-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('确定删除？')) return;
    const ok = await deleteQueueFile(filename);
    if (ok) { card.remove(); showToast('已删除'); }
    else { showToast('删除失败'); }
  });

  return card;
}

// ============================================================
// GitHub API 操作
// ============================================================

// 保存 URL 到队列
async function saveUrl(url) {
  const config = getConfig();
  if (!config.token) {
    showToast('请先在设置中填写 GitHub Token');
    document.getElementById('settings-modal').classList.remove('hidden');
    return false;
  }

  const now = new Date();
  const filename = `${getTodayStr()}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}.txt`;
  const content = btoa(unescape(encodeURIComponent(url)));

  try {
    const res = await fetch(apiUrl(`data/queue/${filename}`), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `queue: ${url.slice(0, 50)}`, content }),
    });
    return res.ok;
  } catch { return false; }
}

// 删除队列文件
async function deleteQueueFile(filename) {
  const config = getConfig();
  if (!config.token) return false;
  try {
    const infoRes = await fetch(apiUrl(`data/queue/${filename}`), { headers: authHeaders() });
    if (!infoRes.ok) return false;
    const { sha } = await infoRes.json();

    const res = await fetch(apiUrl(`data/queue/${filename}`), {
      method: 'DELETE',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `delete: ${filename}`, sha }),
    });
    return res.ok;
  } catch { return false; }
}

// 保存今日随想到 GitHub
async function saveDiary(dateStr, text) {
  const config = getConfig();
  if (!config.token) { showToast('请先设置 Token'); return false; }

  const path = `data/diary/${dateStr}.txt`;
  const content = btoa(unescape(encodeURIComponent(text)));

  // 检查文件是否已存在（需要 sha 来更新）
  let sha = null;
  try {
    const existing = await fetch(apiUrl(path), { headers: authHeaders() });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
  } catch {}

  const body = { message: `diary: ${dateStr}`, content };
  if (sha) body.sha = sha;

  try {
    const res = await fetch(apiUrl(path), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch { return false; }
}

// 加载今日随想
async function loadDiary(dateStr) {
  try {
    const res = await fetch(rawUrl(`data/diary/${dateStr}.txt`));
    if (res.ok) return await res.text();
  } catch {}
  return '';
}

// ============================================================
// 数据加载
// ============================================================

async function loadDailyArticles(dateStr) {
  const container = document.getElementById('cards-container');
  const diaryTextarea = document.getElementById('diary-textarea');
  let hasContent = false;
  container.innerHTML = '';

  // 1. 加载已总结的文章（从 daily/YYYY-MM-DD.md）
  try {
    const res = await fetch(rawUrl(`data/daily/${dateStr}.md`));
    if (res.ok) {
      const text = await res.text();

      // 提取文章链接，格式：[标题](../topics/分类/文件.md)
      const articleLinks = text.match(/\[.*?\]\((\.\.\/topics\/.*?\.md)\)/g) || [];
      for (const linkMatch of articleLinks) {
        const pathMatch = linkMatch.match(/\((.*?)\)/);
        if (!pathMatch) continue;
        // ../topics/X/Y.md → data/topics/X/Y.md
        const filePath = pathMatch[1].replace('..', 'data');
        try {
          const r = await fetch(rawUrl(filePath));
          if (!r.ok) continue;
          const { meta, body } = parseFrontmatter(await r.text());
          container.appendChild(renderCard(meta, body));
          hasContent = true;
        } catch {}
      }
    }
  } catch {}

  // 2. 加载队列中的待处理 URL（仅今日视图）
  if (dateStr === getTodayStr()) {
    const config = getConfig();
    if (config.token) {
      try {
        const apiRes = await fetch(apiUrl('data/queue'), { headers: authHeaders() });
        if (apiRes.ok) {
          const files = await apiRes.json();
          // files 可能是数组（有文件）或对象（空目录/错误）
          if (Array.isArray(files)) {
            for (const file of files) {
              if (!file.name.endsWith('.txt')) continue;
              try {
                const contentRes = await fetch(apiUrl(`data/queue/${file.name}`), {
                  headers: { ...authHeaders(), 'Accept': 'application/vnd.github.raw' },
                });
                if (!contentRes.ok) continue;
                const url = (await contentRes.text()).trim();
                if (!url) continue;

                const pendingCard = renderPendingCard(url, file.name, null);
                container.appendChild(pendingCard);
                hasContent = true;

                // 异步加载预览
                fetchLinkPreview(url).then(preview => {
                  if (preview) {
                    const newCard = renderPendingCard(url, file.name, preview);
                    pendingCard.replaceWith(newCard);
                  }
                });
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  if (!hasContent) {
    container.innerHTML = '<p class="empty-state">还没有收录内容<br>在下方粘贴链接开始</p>';
  }

  // 3. 加载今日随想（独立文件 data/diary/YYYY-MM-DD.txt）
  const diaryText = await loadDiary(dateStr);
  diaryTextarea.value = diaryText;
}

// 搜索
async function searchArticles(keyword) {
  const container = document.getElementById('cards-container');
  if (!keyword.trim()) { loadDailyArticles(getTodayStr()); return; }

  try {
    const res = await fetch(rawUrl('data/archive.md'));
    if (!res.ok) { container.innerHTML = '<p class="empty-state">暂无数据。</p>'; return; }

    const text = await res.text();
    const lower = keyword.toLowerCase();
    const lines = text.split('\n').filter(l => l.startsWith('- [') && l.toLowerCase().includes(lower));
    container.innerHTML = '';

    if (lines.length === 0) {
      container.innerHTML = `<p class="empty-state">没有找到「${keyword}」相关内容。</p>`;
      return;
    }

    for (const line of lines) {
      const pathMatch = line.match(/\((.*?\.md)\)/);
      if (!pathMatch) continue;
      const filePath = pathMatch[1].replace('..', 'data');
      try {
        const r = await fetch(rawUrl(filePath));
        if (!r.ok) continue;
        const { meta, body } = parseFrontmatter(await r.text());
        container.appendChild(renderCard(meta, body));
      } catch {}
    }

    if (container.children.length === 0) {
      container.innerHTML = `<p class="empty-state">没有找到「${keyword}」相关内容。</p>`;
    }
  } catch {
    container.innerHTML = '<p class="empty-state">搜索失败。</p>';
  }
}

// ============================================================
// 侧边栏日期列表
// ============================================================

async function loadDateList() {
  const dateList = document.getElementById('date-list');
  dateList.innerHTML = '';

  // 固定添加"今日"
  const todayItem = document.createElement('div');
  todayItem.className = 'date-item active';
  todayItem.innerHTML = '<span class="date-item-label">今日</span>';
  todayItem.addEventListener('click', () => selectDate(getTodayStr(), todayItem));
  dateList.appendChild(todayItem);

  // 从 API 获取历史日期
  const config = getConfig();
  if (config.token) {
    try {
      const res = await fetch(apiUrl('data/daily'), { headers: authHeaders() });
      if (res.ok) {
        const files = await res.json();
        if (Array.isArray(files)) {
          files
            .map(f => f.name.replace('.md', ''))
            .filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n))
            .sort()
            .reverse()
            .forEach(dateStr => {
              if (dateStr === getTodayStr()) return;
              const item = document.createElement('div');
              item.className = 'date-item';
              item.innerHTML = `<span class="date-item-label">${formatDateCN(dateStr)}</span>`;
              item.addEventListener('click', () => selectDate(dateStr, item));
              dateList.appendChild(item);
            });
        }
      }
    } catch {}
  }
}

function selectDate(dateStr, element) {
  document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
  element.classList.add('active');
  document.getElementById('current-date-title').textContent =
    dateStr === getTodayStr() ? '今日' : formatDateCN(dateStr);
  loadDailyArticles(dateStr);
  closeSidebar();

  // 记住当前选择的日期，供日记保存使用
  document.getElementById('diary-textarea').dataset.date = dateStr;
}

// ============================================================
// 侧边栏开关
// ============================================================

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url-input');
  const btnSave = document.getElementById('btn-save');
  const btnMenu = document.getElementById('btn-menu');
  const btnSearch = document.getElementById('btn-search');
  const btnSearchClose = document.getElementById('btn-search-close');
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  const overlay = document.getElementById('overlay');
  const btnSettings = document.getElementById('btn-settings');
  const settingsModal = document.getElementById('settings-modal');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const diaryTextarea = document.getElementById('diary-textarea');

  // 记住当前日期
  diaryTextarea.dataset.date = getTodayStr();

  // 加载今日内容
  loadDailyArticles(getTodayStr());
  loadDateList();

  // --- 保存 URL ---
  btnSave.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      showToast('请输入有效链接');
      return;
    }

    btnSave.textContent = '...';
    btnSave.disabled = true;

    const ok = await saveUrl(url);
    if (ok) {
      showToast('已保存 ✓');
      urlInput.value = '';

      // 立即在页面上显示卡片
      const container = document.getElementById('cards-container');
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      const now = new Date();
      const fn = `${getTodayStr()}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}.txt`;
      const pendingCard = renderPendingCard(url, fn, null);
      container.appendChild(pendingCard);

      fetchLinkPreview(url).then(preview => {
        if (preview) pendingCard.replaceWith(renderPendingCard(url, fn, preview));
      });
    } else {
      showToast('保存失败，请检查设置');
    }

    btnSave.textContent = '保存';
    btnSave.disabled = false;
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSave.click();
  });

  // --- 今日随想自动保存 ---
  // 失焦时自动保存，避免每次按键都调 API
  let diaryTimer = null;
  diaryTextarea.addEventListener('input', () => {
    clearTimeout(diaryTimer);
    diaryTimer = setTimeout(async () => {
      const dateStr = diaryTextarea.dataset.date || getTodayStr();
      const text = diaryTextarea.value.trim();
      if (text) {
        const ok = await saveDiary(dateStr, text);
        if (ok) showToast('随想已保存');
      }
    }, 2000); // 停止输入 2 秒后自动保存
  });

  diaryTextarea.addEventListener('blur', async () => {
    clearTimeout(diaryTimer);
    const dateStr = diaryTextarea.dataset.date || getTodayStr();
    const text = diaryTextarea.value.trim();
    if (text) {
      const ok = await saveDiary(dateStr, text);
      if (ok) showToast('随想已保存');
    }
  });

  // --- 侧边栏 ---
  btnMenu.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);

  // --- 搜索 ---
  btnSearch.addEventListener('click', () => {
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) searchInput.focus();
  });

  btnSearchClose.addEventListener('click', () => {
    searchBar.classList.add('hidden');
    searchInput.value = '';
    loadDailyArticles(getTodayStr());
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchArticles(e.target.value);
  });

  // --- 设置 ---
  btnSettings.addEventListener('click', () => {
    const config = getConfig();
    document.getElementById('token-input').value = config.token;
    document.getElementById('username-input').value = config.username;
    document.getElementById('repo-input').value = config.repo;
    settingsModal.classList.remove('hidden');
    closeSidebar();
  });

  btnSaveSettings.addEventListener('click', () => {
    localStorage.setItem('gh_token', document.getElementById('token-input').value.trim());
    localStorage.setItem('gh_username', document.getElementById('username-input').value.trim());
    localStorage.setItem('gh_repo', document.getElementById('repo-input').value.trim());
    settingsModal.classList.add('hidden');
    showToast('设置已保存');
    // 重新加载数据
    loadDailyArticles(getTodayStr());
    loadDateList();
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
});

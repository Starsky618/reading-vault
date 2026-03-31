// ===== 阅读日记前端 =====
// 这个 JS 做两件事：
// 1. 展示已有的文章摘要（从 GitHub 仓库的 data/ 目录加载 Markdown）
// 2. 保存新 URL 到 GitHub 仓库的 data/queue/ 目录（手机粘贴链接用）
//
// 可以把它想象成一个"带投递口的展示柜"——
// 既能看已有内容，也能从手机上往里投新链接。

// --- 配置 ---
const DATA_PATH = '../data';

// 从 localStorage 读取 GitHub 配置（首次使用需在设置中填写）
function getConfig() {
  return {
    token: localStorage.getItem('gh_token') || '',
    username: localStorage.getItem('gh_username') || 'Starsky618',
    repo: localStorage.getItem('gh_repo') || 'reading-vault',
  };
}

// 平台图标映射
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

// --- 工具函数 ---

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateCN(str) {
  const [y, m, d] = str.split('-');
  return `${m}月${parseInt(d)}日`;
}

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

// 根据 URL 猜测来源平台
function guessSource(url) {
  for (const [key, info] of Object.entries(SOURCE_MAP)) {
    if (url.includes(key)) return info;
  }
  return { name: new URL(url).hostname, class: 'source-default', icon: '🔗' };
}

// 显示 Toast 提示
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

// --- 卡片渲染 ---

function renderCard(meta, body) {
  const sourceInfo = getSourceInfo(meta.source);
  const coreMatch = body.match(/\*\*核心观点\*\*[：:]\s*(.*)/);
  const core = coreMatch ? coreMatch[1] : '';

  const pointsMatch = body.match(/\*\*关键要点\*\*[：:]\s*\n([\s\S]*?)(?=\n\*\*|$)/);
  let pointsHtml = '';
  if (pointsMatch) {
    pointsHtml = pointsMatch[1]
      .split('\n')
      .filter(l => l.match(/^\d+\./))
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
      <div>
        <span class="card-date">${meta.date || ''}</span>
      </div>
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

// 获取链接预览信息（标题、描述、封面图）
// 使用免费的 Microlink API 提取网页的 Open Graph 元数据
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
  } catch { /* 预览获取失败不影响保存 */ }
  return null;
}

// 渲染待处理 URL 的卡片（还没被 AI 总结的）
// 包含链接预览（标题+配图）和删除按钮
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
    <span class="card-date">${filename.replace('.txt', '').replace('_', ' ') || ''}</span>
  `;

  // 删除按钮事件
  card.querySelector('.btn-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('确定删除这条记录？')) return;
    const ok = await deleteQueueFile(filename);
    if (ok) {
      card.remove();
      showToast('已删除');
    } else {
      showToast('删除失败');
    }
  });

  return card;
}

// 从 GitHub 删除队列文件
async function deleteQueueFile(filename) {
  const config = getConfig();
  if (!config.token) return false;
  try {
    // 先获取文件的 sha
    const infoRes = await fetch(
      `https://api.github.com/repos/${config.username}/${config.repo}/contents/data/queue/${filename}`,
      { headers: { 'Authorization': `Bearer ${config.token}` } }
    );
    if (!infoRes.ok) return false;
    const info = await infoRes.json();

    // 删除文件
    const res = await fetch(
      `https://api.github.com/repos/${config.username}/${config.repo}/contents/data/queue/${filename}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `delete: ${filename}`,
          sha: info.sha,
        }),
      }
    );
    return res.ok;
  } catch { return false; }
}

// --- 数据加载 ---

// 加载指定日期的文章
async function loadDailyArticles(dateStr) {
  const container = document.getElementById('cards-container');
  const diaryTextarea = document.getElementById('diary-textarea');

  try {
    // 加载 daily 文件
    const res = await fetch(`${DATA_PATH}/daily/${dateStr}.md`);
    let hasContent = false;
    container.innerHTML = '';

    if (res.ok) {
      const text = await res.text();
      const articleLinks = text.match(/\[.*?\]\((\.\.\/topics\/.*?\.md)\)/g) || [];

      if (articleLinks.length > 0) {
        for (const linkMatch of articleLinks) {
          const pathMatch = linkMatch.match(/\((.*?)\)/);
          if (!pathMatch) continue;
          const articlePath = pathMatch[1].replace('..', DATA_PATH);
          try {
            const r = await fetch(articlePath);
            if (!r.ok) continue;
            const { meta, body } = parseFrontmatter(await r.text());
            container.appendChild(renderCard(meta, body));
            hasContent = true;
          } catch { /* 跳过 */ }
        }
      }

      // 加载今日随想
      const diaryMatch = text.match(/## 今日随想\n\n([\s\S]*?)(?=\n---|\n$|$)/);
      if (diaryMatch) {
        const c = diaryMatch[1].trim();
        diaryTextarea.value = (c && c !== '（在此写下你的想法...）') ? c : '';
      } else {
        diaryTextarea.value = '';
      }
    } else {
      diaryTextarea.value = '';
    }

    // 如果是今天，还要加载队列中的待处理 URL
    if (dateStr === getTodayStr()) {
      try {
        const queueRes = await fetch(`${DATA_PATH}/queue/?t=${Date.now()}`);
        if (queueRes.ok) {
          // GitHub Pages 目录列表不可用，改用 API
          const config = getConfig();
          if (config.token) {
            const apiRes = await fetch(
              `https://api.github.com/repos/${config.username}/${config.repo}/contents/data/queue`,
              { headers: { 'Authorization': `Bearer ${config.token}` } }
            );
            if (apiRes.ok) {
              const files = await apiRes.json();
              for (const file of files) {
                if (!file.name.endsWith('.txt')) continue;
                const contentRes = await fetch(
                  `https://api.github.com/repos/${config.username}/${config.repo}/contents/data/queue/${file.name}`,
                  { headers: { 'Authorization': `Bearer ${config.token}`, 'Accept': 'application/vnd.github.raw' } }
                );
                if (contentRes.ok) {
                  const url = (await contentRes.text()).trim();
                  if (url) {
                    // 先用 URL 渲染卡片，然后异步获取预览并更新
                    const pendingCard = renderPendingCard(url, file.name, null);
                    container.appendChild(pendingCard);
                    hasContent = true;
                    // 异步获取链接预览，获取后替换卡片
                    fetchLinkPreview(url).then(preview => {
                      if (preview) {
                        const newCard = renderPendingCard(url, file.name, preview);
                        pendingCard.replaceWith(newCard);
                      }
                    });
                  }
                }
              }
            }
          }
        }
      } catch { /* 队列加载失败不影响主体 */ }
    }

    if (!hasContent) {
      container.innerHTML = '<p class="empty-state">还没有收录内容<br>在下方粘贴链接开始</p>';
    }
  } catch {
    container.innerHTML = '<p class="empty-state">加载失败，请刷新重试。</p>';
  }
}

// 搜索
async function searchArticles(keyword) {
  const container = document.getElementById('cards-container');
  if (!keyword.trim()) {
    loadDailyArticles(getTodayStr());
    return;
  }

  try {
    const res = await fetch(`${DATA_PATH}/archive.md`);
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
      try {
        const r = await fetch(pathMatch[1].replace('..', DATA_PATH));
        if (!r.ok) continue;
        const { meta, body } = parseFrontmatter(await r.text());
        container.appendChild(renderCard(meta, body));
      } catch { /* 跳过 */ }
    }
  } catch {
    container.innerHTML = '<p class="empty-state">搜索失败。</p>';
  }
}

// --- 保存 URL 到 GitHub ---

async function saveUrl(url) {
  const config = getConfig();

  if (!config.token) {
    showToast('请先在设置中填写 GitHub Token');
    document.getElementById('settings-modal').classList.remove('hidden');
    return false;
  }

  // 用时间戳作为文件名，避免冲突
  const now = new Date();
  const filename = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}.txt`;

  // 将 URL 进行 Base64 编码（GitHub API 要求）
  const content = btoa(unescape(encodeURIComponent(url)));

  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.username}/${config.repo}/contents/data/queue/${filename}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `queue: ${url.slice(0, 50)}`,
          content: content,
        }),
      }
    );

    if (res.ok) {
      return true;
    } else {
      const err = await res.json();
      console.error('GitHub API error:', err);
      return false;
    }
  } catch (e) {
    console.error('Save failed:', e);
    return false;
  }
}

// --- 侧边栏日期列表 ---

async function loadDateList() {
  const dateList = document.getElementById('date-list');
  const config = getConfig();

  // 先添加"今日"
  const todayItem = document.createElement('div');
  todayItem.className = 'date-item active';
  todayItem.innerHTML = `<span class="date-item-label">今日</span>`;
  todayItem.addEventListener('click', () => selectDate(getTodayStr(), todayItem));
  dateList.appendChild(todayItem);

  // 尝试从 GitHub API 获取 daily 目录下的文件列表
  if (config.token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${config.username}/${config.repo}/contents/data/daily`,
        { headers: { 'Authorization': `Bearer ${config.token}` } }
      );
      if (res.ok) {
        const files = await res.json();
        const dates = files
          .map(f => f.name.replace('.md', ''))
          .filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n))
          .sort()
          .reverse();

        dates.forEach(dateStr => {
          if (dateStr === getTodayStr()) return; // 今日已添加
          const item = document.createElement('div');
          item.className = 'date-item';
          item.innerHTML = `<span class="date-item-label">${formatDateCN(dateStr)}</span>`;
          item.addEventListener('click', () => selectDate(dateStr, item));
          dateList.appendChild(item);
        });
      }
    } catch { /* 降级：只显示今日 */ }
  }
}

function selectDate(dateStr, element) {
  // 更新侧边栏选中状态
  document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
  element.classList.add('active');

  // 更新顶栏标题
  document.getElementById('current-date-title').textContent =
    dateStr === getTodayStr() ? '今日' : formatDateCN(dateStr);

  // 加载对应日期的内容
  loadDailyArticles(dateStr);

  // 手机端关闭侧边栏
  closeSidebar();
}

// --- 侧边栏开关 ---

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// --- 初始化 ---

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

  // 加载今日内容
  loadDailyArticles(getTodayStr());
  loadDateList();

  // 保存 URL
  btnSave.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    // 简单校验是否像 URL
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
      // 立即在页面上添加一张待处理卡片
      const container = document.getElementById('cards-container');
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.remove();
      const now = new Date();
      const fn = `${getTodayStr()}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}.txt`;
      const pendingCard = renderPendingCard(url, fn, null);
      container.appendChild(pendingCard);
      // 异步获取预览
      fetchLinkPreview(url).then(preview => {
        if (preview) pendingCard.replaceWith(renderPendingCard(url, fn, preview));
      });
    } else {
      showToast('保存失败，请检查设置');
    }

    btnSave.textContent = '保存';
    btnSave.disabled = false;
  });

  // 回车也能保存
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSave.click();
  });

  // 侧边栏
  btnMenu.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);

  // 搜索
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

  // 设置弹窗
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
    loadDateList();
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
});

// ===== 阅读日记前端逻辑 =====
// 职责：从 data/ 目录加载 Markdown 数据，解析并渲染为卡片和日记区。
// 可以把它想象成一个"只读展示柜"——数据由 Claude Code 写入仓库，
// 这里只负责把数据漂亮地展示出来。

// --- 配置 ---
// GitHub Pages 部署后，site/ 是根目录，data/ 在上一级
const DATA_PATH = '../data';

// 平台图标映射：域名关键词 → 显示名称和 CSS 类名
// 像一个"翻译表"——看到 bilibili 就知道是 B站，显示对应的颜色和标签
const SOURCE_MAP = {
  'bilibili': { name: 'B站', class: 'source-bilibili', icon: '📺' },
  'youtube':  { name: 'YouTube', class: 'source-youtube', icon: '▶️' },
  'weixin':   { name: '微信', class: 'source-wechat', icon: '💬' },
  'x.com':    { name: 'X', class: 'source-x', icon: '🐦' },
  'twitter':  { name: 'X', class: 'source-x', icon: '🐦' },
  'xiaohongshu': { name: '小红书', class: 'source-xiaohongshu', icon: '📕' },
  'zhihu':    { name: '知乎', class: 'source-zhihu', icon: '💡' },
};

// --- 工具函数 ---

// 获取今天的日期字符串，格式 YYYY-MM-DD
function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 解析 Markdown frontmatter（文件头部的 --- 包裹的元数据）
// 可以把 frontmatter 想象成书的"封面信息"——标题、作者、日期都写在这里，
// 正文从第二个 --- 之后才开始
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  match[1].split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      meta[key] = val;
    }
  });
  return { meta, body: match[2] };
}

// 根据来源名称获取平台信息
function getSourceInfo(source) {
  if (!source) return { name: '网页', class: 'source-default', icon: '🔗' };
  const lower = source.toLowerCase();
  for (const [key, info] of Object.entries(SOURCE_MAP)) {
    if (lower.includes(key)) return info;
  }
  return { name: source, class: 'source-default', icon: '🔗' };
}

// --- 卡片渲染 ---

// 将一篇文章的元数据和内容渲染成一张 HTML 卡片
// 每张卡片包含：来源图标、封面图、原标题（可点击）、摘要、标签、个人想法
function renderCard(meta, body) {
  const sourceInfo = getSourceInfo(meta.source);

  // 从正文中提取核心观点——匹配 **核心观点**：后面的内容
  const coreMatch = body.match(/\*\*核心观点\*\*[：:]\s*(.*)/);
  const core = coreMatch ? coreMatch[1] : '';

  // 提取关键要点——匹配 **关键要点**：下方的有序列表
  const pointsMatch = body.match(/\*\*关键要点\*\*[：:]\s*\n([\s\S]*?)(?=\n\*\*|$)/);
  let pointsHtml = '';
  if (pointsMatch) {
    const points = pointsMatch[1]
      .split('\n')
      .filter(l => l.match(/^\d+\./))
      .map(l => l.replace(/^\d+\.\s*/, '').trim());
    pointsHtml = points.map(p => `<li>${p}</li>`).join('');
  }

  // 提取"我的想法"——用户的个人批注
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

// --- 数据加载 ---

// 加载指定日期的文章列表
// 策略：先加载 daily 文件获取文章链接，再逐篇加载完整摘要渲染卡片
async function loadDailyArticles(dateStr) {
  const container = document.getElementById('cards-container');
  const diaryTextarea = document.getElementById('diary-textarea');

  try {
    const res = await fetch(`${DATA_PATH}/daily/${dateStr}.md`);
    if (!res.ok) {
      container.innerHTML = '<p class="empty-state">这一天还没有收录内容。</p>';
      diaryTextarea.value = '';
      return;
    }
    const text = await res.text();

    // 从 daily 文件中提取文章链接（格式：[标题](../topics/分类/文件.md)）
    const articleLinks = text.match(/\[.*?\]\((\.\.\/topics\/.*?\.md)\)/g) || [];
    container.innerHTML = '';

    if (articleLinks.length === 0) {
      // 没有引用链接，尝试直接从 daily 文件内容展示
      // daily 文件本身也包含精简版摘要
      const hasEntries = text.includes('### ');
      if (!hasEntries) {
        container.innerHTML = '<p class="empty-state">这一天还没有收录内容。</p>';
      } else {
        // 降级展示：直接把 daily 文件的内容按 section 渲染为简易卡片
        const entries = text.split(/### \d+\.\s*/).filter(Boolean);
        entries.forEach(entry => {
          const lines = entry.trim().split('\n').filter(Boolean);
          if (lines.length === 0) return;
          const title = lines[0].trim();
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = `
            <a class="card-title" href="#">${title}</a>
            <p class="card-summary">${lines.slice(1).map(l => l.replace(/^-\s*/, '')).join('<br>')}</p>
          `;
          container.appendChild(card);
        });
      }
    } else {
      // 逐篇加载完整文章摘要并渲染卡片
      for (const linkMatch of articleLinks) {
        const pathMatch = linkMatch.match(/\((.*?)\)/);
        if (!pathMatch) continue;
        // 将相对路径 ../topics/... 转为基于 DATA_PATH 的路径
        const articlePath = pathMatch[1].replace('..', `${DATA_PATH}`);
        try {
          const articleRes = await fetch(articlePath);
          if (!articleRes.ok) continue;
          const articleText = await articleRes.text();
          const { meta, body } = parseFrontmatter(articleText);
          container.appendChild(renderCard(meta, body));
        } catch {
          // 单篇加载失败不影响其他文章的展示
        }
      }
    }

    if (container.children.length === 0) {
      container.innerHTML = '<p class="empty-state">这一天还没有收录内容。</p>';
    }

    // 加载今日随想——从 daily 文件中提取 ## 今日随想 下的内容
    const diaryMatch = text.match(/## 今日随想\n\n([\s\S]*?)(?=\n---|\n$|$)/);
    if (diaryMatch) {
      const diaryContent = diaryMatch[1].trim();
      if (diaryContent && diaryContent !== '（在此写下你的想法...）') {
        diaryTextarea.value = diaryContent;
      } else {
        diaryTextarea.value = '';
      }
    } else {
      diaryTextarea.value = '';
    }
  } catch {
    container.innerHTML = '<p class="empty-state">加载失败，请刷新重试。</p>';
  }
}

// 搜索功能：在 archive.md 中按关键词匹配
// archive.md 是全量索引，每行格式：- [标题](路径) — 来源 | 分类 | 日期
async function searchArticles(keyword) {
  const container = document.getElementById('cards-container');
  if (!keyword.trim()) {
    // 空搜索回到今日视图
    const datePicker = document.getElementById('date-picker');
    loadDailyArticles(datePicker.value || getTodayStr());
    return;
  }

  try {
    const res = await fetch(`${DATA_PATH}/archive.md`);
    if (!res.ok) {
      container.innerHTML = '<p class="empty-state">暂无数据。</p>';
      return;
    }
    const text = await res.text();
    const lower = keyword.toLowerCase();

    // 筛选包含关键词的索引行
    const lines = text.split('\n').filter(l =>
      l.startsWith('- [') && l.toLowerCase().includes(lower)
    );

    container.innerHTML = '';

    if (lines.length === 0) {
      container.innerHTML = `<p class="empty-state">没有找到与「${keyword}」相关的内容。</p>`;
      return;
    }

    // 逐条加载匹配文章的完整摘要
    for (const line of lines) {
      const pathMatch = line.match(/\((.*?\.md)\)/);
      if (!pathMatch) continue;
      const articlePath = pathMatch[1].replace('..', `${DATA_PATH}`);
      try {
        const articleRes = await fetch(articlePath);
        if (!articleRes.ok) continue;
        const articleText = await articleRes.text();
        const { meta, body } = parseFrontmatter(articleText);
        container.appendChild(renderCard(meta, body));
      } catch {
        // 跳过加载失败的文章
      }
    }

    if (container.children.length === 0) {
      container.innerHTML = `<p class="empty-state">没有找到与「${keyword}」相关的内容。</p>`;
    }
  } catch {
    container.innerHTML = '<p class="empty-state">搜索失败，请重试。</p>';
  }
}

// --- 事件绑定 ---

document.addEventListener('DOMContentLoaded', () => {
  const datePicker = document.getElementById('date-picker');
  const searchInput = document.getElementById('search-input');

  // 默认显示今天的内容
  datePicker.value = getTodayStr();
  loadDailyArticles(getTodayStr());

  // 切换日期时重新加载对应日期的内容
  datePicker.addEventListener('change', (e) => {
    searchInput.value = '';
    loadDailyArticles(e.target.value);
  });

  // 按回车触发搜索
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      searchArticles(e.target.value);
    }
  });
});

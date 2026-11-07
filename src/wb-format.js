/**
 * 抓取内容的格式化（把 GitHub README 那种"给开发者看"的东西，转成"给人看"的）
 *
 * ── 为什么需要 ──
 *
 * 老板明确（2026-11-02）：「抓取过来的内容格式化一下，不要显示代码」
 *
 * 实测一个 GitHub README（29702 字）里的东西：
 *   HTML 标签      53 个    ← <div align="center"> 这种，页面上显示成乱码
 *   markdown 链接 123 个    ← 十几国语言导航、相对路径链接，点不动还占地方
 *   徽章 badge     12 个    ← shields.io 那种状态图标，纯噪音
 *   表格竖线      153 个    ← 一堆参数表
 *   代码围栏       20 个    ← 只有 28 行，其实不是主要问题
 *
 * 所以真正要清的是：HTML、徽章、导航链接、巨长表格。
 * 代码块保留（那是说明怎么用的一部分），但收缩到合理长度。
 */

/** 反引号（避开某些环境里的转义问题） */
const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;

/**
 * 清洗抓取到的 README
 *
 * @param {string} raw 原始内容
 * @param {object} [opts]
 * @param {number} [opts.maxCodeLines] 单个代码块最多保留几行（默认 12）
 * @param {number} [opts.maxTotal] 全文最多多少字（默认 8000）
 * @returns {{text: string, removed: object}}
 */
export function cleanFetchedContent(raw, opts = {}) {
  const maxCodeLines = opts.maxCodeLines || 12;
  const maxTotal = opts.maxTotal || 8000;
  let s = String(raw || '');
  const removed = { html: 0, badge: 0, langNav: 0, image: 0, link: 0, codeLines: 0 };

  // ── 1. 去掉 HTML 标签（保留里面的文字）──
  // 先处理块级标签，避免文字粘在一起
  s = s.replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, function () { removed.html += 1; return ''; });

  // ── 2. 去掉徽章（shields.io / badge / 状态图标）──
  // 形如 [![xxx](https://img.shields.io/...)](...)
  s = s.replace(/\[\!\[[^\]]*\]\([^)]*(?:shields\.io|badge)[^)]*\)\]\([^)]*\)/gi,
    function () { removed.badge += 1; return ''; });
  // 单独的 shields.io 图片
  s = s.replace(/\!\[[^\]]*\]\([^)]*(?:shields\.io|badge)[^)]*\)/gi,
    function () { removed.badge += 1; return ''; });

  // ── 3. 去掉"十几国语言"那行导航 ──
  // 特征一：一行里有 5 个以上 markdown 链接，且多半指向 README_xx
  // 特征二：一行里有一堆"·"分隔的国名/语言名（清掉链接后剩下的残渣）
  s = s.split('\n').map(function (line) {
    const links = line.match(/\[[^\]]+\]\([^)]*\)/g) || [];
    const isLangNav = links.length >= 5 && /readme|README|docs\//.test(line);
    // 清掉链接后剩下的语言导航残渣：多个"·"分隔 + 短词
    const dots = (line.match(/·/g) || []).length;
    const isLangResidue = dots >= 3 && line.replace(/·/g, '').trim().length < 160
      && !/https?:/.test(line);
    if (isLangNav || isLangResidue) { removed.langNav += 1; return ''; }
    return line;
  }).join('\n');

  // ── 4. 图片换成占位说明（外链图多半打不开，还占地方）──
  s = s.replace(/\!\[([^\]]*)\]\(([^)]*)\)/g, function (m, alt) {
    removed.image += 1;
    return alt ? '（图片：' + alt + '）' : '（图片）';
  });

  // ── 5. 代码块：收缩到合理长度 ──
  // 保留（那是"怎么用"的部分），但太长就截断并说明
  const lines = s.split('\n');
  const out = [];
  let inFence = false;
  let fenceBuf = [];
  for (const line of lines) {
    const isFence = line.trim().indexOf(FENCE) === 0;
    if (isFence) {
      if (!inFence) {
        inFence = true;
        fenceBuf = [line];
      } else {
        // 收尾
        inFence = false;
        if (fenceBuf.length > maxCodeLines + 2) {
          const head = fenceBuf.slice(0, maxCodeLines + 1);
          const rest = fenceBuf.length - maxCodeLines - 1;
          removed.codeLines += rest;
          out.push.apply(out, head);
          out.push('  …（省略 ' + rest + ' 行）');
          out.push(FENCE);
        } else {
          out.push.apply(out, fenceBuf);
        }
        fenceBuf = [];
      }
      continue;
    }
    if (inFence) fenceBuf.push(line);
    else out.push(line);
  }
  if (inFence && fenceBuf.length) {
    // 围栏没闭合（抓取被截断），补上
    out.push.apply(out, fenceBuf);
    out.push(FENCE);
  }
  s = out.join('\n');

  // ── 6. 链接：保留文字，去掉 URL ──
  // 相对路径的链接（docs/xxx.md）在本地根本点不动，去了更干净
  s = s.replace(/\[([^\]]+)\]\(([^)]*)\)/g, function (m, text, href) {
    removed.link += 1;
    // 绝对地址的保留成 "文字 (地址)"，相对路径只留文字
    if (/^https?:\/\//i.test(href)) return text + '（' + href + '）';
    return text;
  });

  // ── 7. 表格：竖线太多就转成简单列表（表格在窄屏上很难看）──
  s = s.split('\n').map(function (line) {
    if (!/^\s*\|/.test(line)) return line;
    // 去掉分隔行 |---|---|
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) return '';
    // 普通行：去掉首尾竖线，单元格用 · 分隔
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')
      .map(function (c) { return c.trim(); })
      .filter(Boolean).join(' · ');
  }).join('\n');

  // ── 8. 压缩空白 ──
  s = s.replace(/[ \t]+$/gm, '');       // 行尾空格
  s = s.replace(/\n{3,}/g, '\n\n');     // 连续空行
  s = s.trim();

  // ── 9. 总量控制 ──
  if (s.length > maxTotal) {
    const cut = s.slice(0, maxTotal);
    // 尽量在段落边界截断
    const lastBreak = cut.lastIndexOf('\n\n');
    s = (lastBreak > maxTotal * 0.6 ? cut.slice(0, lastBreak) : cut) +
      '\n\n…（内容太长，后面省略了。完整内容看原文：见上方"原始地址"）';
  }

  return { text: s, removed };
}

/**
 * 把抓取结果拼成一条「人能读」的记录正文
 *
 * @param {object} r fetchGitHubReadme 的返回
 * @returns {{body: string, removed: object}}
 */
export function buildExternalBody(r) {
  const { text, removed } = cleanFetchedContent(r.readme || r.content || '');
  const parts = [];

  parts.push('## 这是什么');
  parts.push('');
  if (r.description) parts.push(String(r.description).trim());
  parts.push('');
  parts.push('| 项 | 值 |');
  parts.push('|---|---|');
  if (r.owner && r.repo) parts.push('| 项目 | ' + r.owner + '/' + r.repo + ' |');
  if (r.url) parts.push('| 原始地址 | ' + r.url + ' |');
  if (r.stars !== undefined) parts.push('| Star | ' + r.stars + ' |');
  if (r.language) parts.push('| 主要语言 | ' + r.language + ' |');
  parts.push('');

  if (text) {
    parts.push('## README 摘要');
    parts.push('');
    parts.push(text);
  }

  return { body: parts.join('\n'), removed };
}

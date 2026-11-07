/**
 * GitHub README 抓取
 *
 * 设计依据（见 docs/00-开发文档.md 5.5 与 TDR-004）：
 * 一期只保证 GitHub 仓库的 README 能抓，其它类型不抓（动态页面/反爬/登录墙）。
 *
 * 支持：
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/branch
 *   github.com/owner/repo（无协议）
 */

/**
 * 解析 GitHub 仓库地址
 * @param {string} input
 * @returns {{owner: string, repo: string} | null}
 */
export function parseGitHubUrl(input) {
  const s = String(input || '').trim();
  if (!s) return null;

  let url = s;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;

  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');

  // 过滤明显的非仓库路径
  const reserved = new Set([
    'settings', 'notifications', 'explore', 'marketplace', 'sponsors',
    'topics', 'collections', 'trending', 'about', 'pricing', 'login',
    'new', 'organizations', 'users', 'pulls', 'issues', 'codespaces',
  ]);
  if (reserved.has(owner.toLowerCase())) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;

  return { owner, repo };
}

/**
 * 抓取 GitHub 仓库的 README 和基本信息
 * @param {string} inputUrl
 * @param {object} [opts] { timeout }
 * @returns {Promise<{ok: boolean, title?: string, description?: string, body?: string, error?: string}>}
 */
export async function fetchGitHubReadme(inputUrl, opts = {}) {
  const parsed = parseGitHubUrl(inputUrl);
  if (!parsed) {
    return { ok: false, error: '不是有效的 GitHub 仓库地址' };
  }

  const { owner, repo } = parsed;
  const timeout = opts.timeout || 15000;
  const headers = {
    'User-Agent': 'lbase/0.1 (+https://lbase.com)',
    Accept: 'application/vnd.github+json',
  };

  // 1. 先取仓库信息（拿 description 和默认分支）
  let meta = null;
  try {
    const r = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, { headers }, timeout);
    if (r.ok) meta = await r.json();
  } catch {
    // 网络失败继续尝试 README
  }

  const branch = meta?.default_branch || 'HEAD';
  const description = meta?.description || '';

  // 2. 按顺序尝试取 README
  const candidates = [
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/readme.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.markdown`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.rst`,
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README`,
  ];

  for (const url of candidates) {
    try {
      const r = await fetchWithTimeout(url, {
        headers: { 'User-Agent': headers['User-Agent'] },
      }, timeout);
      if (r.ok) {
        const body = await r.text();
        if (body && body.trim().length > 10) {
          return {
            ok: true,
            title: meta?.full_name || `${owner}/${repo}`,
            description,
            body,
            stars: meta?.stargazers_count,
            url: meta?.html_url || `https://github.com/${owner}/${repo}`,
          };
        }
      }
    } catch {
      continue;
    }
  }

  // 拿不到 README，但至少返回基本信息
  if (meta) {
    return {
      ok: true,
      title: meta.full_name || `${owner}/${repo}`,
      description,
      body: `# ${meta.full_name}\n\n${description}\n\n该项目没有 README 文件。\n\n地址：${meta.html_url}`,
      stars: meta.stargazers_count,
      url: meta.html_url,
      noReadme: true,
    };
  }

  return { ok: false, error: '抓取失败（网络不通或仓库不存在）' };
}

async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

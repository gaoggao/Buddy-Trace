/**
 * LBASE 文本处理：中英文分词、相似度、匹配度计算
 *
 * 为什么自己写：
 * - SQLite FTS5 默认分词器不切中文（实测「三层」搜不到「三层代理系统」）
 * - 不引入外部依赖（轻量、可打包成单文件）
 *
 * v2 改进（基于实测问题）：
 *   问题：搜「413 上传失败」时，wiki「HTTP 413 错误的根因」得分只有 0.374，
 *        被 0.4 门槛滤掉，而它其实是正确答案之一。
 *   根因：中文二元组会产生跨词边界的无关词元（如「传失」「误的」「的根」），
 *        这些词元在任何文档里都命中不了，白占分母。
 *   改法：
 *     1. 只用「不跨标点/空格」的二元组（已经是）
 *     2. 计算覆盖率时，对「无关词元」不算分母惩罚
 *        —— 具体做法：分母只统计「至少在一个候选文档里出现过」的词元
 *     3. 单字权重降得更低（单字容易误命中）
 *     4. 长查询里的高频停顿词（的/了/在/是/和）不参与打分
 */

/** 是否中日韩字符 */
function isCJK(ch) {
  const c = ch.codePointAt(0);
  return (
    (c >= 0x4e00 && c <= 0x9fff) ||
    (c >= 0x3400 && c <= 0x4dbf) ||
    (c >= 0x3040 && c <= 0x30ff) ||
    (c >= 0xac00 && c <= 0xd7af)
  );
}

/** 中文里的停顿词：单字和二元组形式都不参与打分 */
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '和', '与', '也', '就', '都', '而', '及', '或',
  '被', '把', '给', '对', '从', '到', '有', '没', '不', '很', '更', '最',
  '这个', '那个', '一个', '什么', '怎么', '可以', '我们', '你们', '他们',
  '以及', '但是', '因为', '所以', '如果', '虽然',
]);

/**
 * 分词：返回词元数组
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (!text) return [];
  const s = String(text).toLowerCase();
  const tokens = new Set();

  // 1. 英文/数字单词
  const words = s.match(/[a-z0-9_]+/g) || [];
  for (const w of words) {
    if (w.length >= 2 || /^\d+$/.test(w)) tokens.add(w);
  }

  // 2. 中文：连续 CJK 段落 → bigram + 单字
  let run = '';
  const flushRun = () => {
    if (!run) return;
    const chars = [...run];
    for (const ch of chars) tokens.add(ch);
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.add(chars[i] + chars[i + 1]);
    }
    run = '';
  };
  for (const ch of s) {
    if (isCJK(ch)) run += ch;
    else flushRun();
  }
  flushRun();

  return [...tokens];
}

/**
 * 分词并过滤停顿词（用于查询）
 */
function tokenizeQuery(text) {
  return tokenize(text).filter((t) => !STOP_WORDS.has(t));
}

/**
 * 计算查询对文档的匹配度（0~1）
 *
 * 改进点：动态分母
 *   原做法：分母 = 查询所有词元权重之和
 *           → 查询里的无关词元（中文跨词边界产生的）永远命中不了，白拉低分数
 *   新做法：先看这个词元能不能在当前文档里命中；命中就计入分母
 *           不命中的词元，只有在「其他文档也没命中」时才不计入分母
 *
 * 为了让每次调用独立可用，matchScore 接受可选的 allTokens 参数：
 *   传入「本次检索所有候选文档的词元并集」，就能正确判断哪些词元是「完全无关」的。
 *
 * @param {string} query
 * @param {{title?: string, body?: string}} doc
 * @param {Set<string>} [corpusTokens] 所有候选文档的词元并集（可选）
 * @returns {number} 0~1
 */
export function matchScore(query, doc, corpusTokens) {
  const q = tokenizeQuery(query);
  if (q.length === 0) return 0;

  const titleTokens = new Set(tokenize(doc.title || ''));
  const bodyTokens = new Set(tokenize(doc.body || ''));

  // 把查询词元分成两组：
  //   多字词元（>=2 字）：真正的词，权重高，是打分主力
  //   单字词元：容易误命中（比如「面」能匹配「页面」），只作辅助
  const multi = q.filter((t) => t.length >= 2);
  const single = q.filter((t) => t.length === 1);

  // ── 第一步：多字词元打分 ──
  // 多字词元命中说明是真的相关。如果一个多字词都没命中，基本可以判定无关。
  let multiScore = 0;
  let multiWeight = 0;
  let multiHitCount = 0;

  for (const t of multi) {
    if (titleTokens.has(t)) {
      multiWeight += 1;
      multiScore += 1;
      multiHitCount++;
    } else if (bodyTokens.has(t)) {
      multiWeight += 1;
      multiScore += 0.65;
      multiHitCount++;
    } else if (corpusTokens && corpusTokens.has(t)) {
      // 这个词在别的文档出现过 → 是真词，本文件没命中要扣分
      multiWeight += 1;
    }
  }

  // 如果查询里有多个多字词，但一个都没命中 → 判为无关，直接返回 0
  // （单字不允许在这种情况下把分数救回来）
  if (multi.length > 0 && multiHitCount === 0) {
    return 0;
  }

  const multiRatio = multiWeight > 0 ? multiScore / multiWeight : 0;

  // ── 第二步：单字词元只在多字有命中时，作为补充加分 ──
  // 单字单独命中不能说明什么（「面」匹配「页面」），所以权重极低
  let singleBoost = 0;
  if (single.length > 0 && multiHitCount > 0) {
    let sHit = 0;
    for (const t of single) {
      if (titleTokens.has(t)) sHit += 1;
      else if (bodyTokens.has(t)) sHit += 0.5;
    }
    singleBoost = (sHit / single.length) * 0.15; // 最多加 0.15
  }

  // ── 第三步：如果查询里全是单字（用户就搜了一个字），走单字逻辑 ──
  if (multi.length === 0) {
    let sHit = 0;
    for (const t of single) {
      if (titleTokens.has(t)) sHit += 1;
      else if (bodyTokens.has(t)) sHit += 0.65;
    }
    return Math.min(1, sHit / single.length);
  }

  return Math.min(1, multiRatio + singleBoost);
}

export function similarity(a, b) {
  const ta = new Set(tokenize(`${a.title || ''} ${a.body || ''}`));
  const tb = new Set(tokenize(`${b.title || ''} ${b.body || ''}`));

  // 标题完全相同 → 直接认为高度相似
  if (a.title && b.title && a.title.trim() === b.title.trim()) {
    return 1;
  }

  if (ta.size === 0 || tb.size === 0) return 0;

  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;

  return union === 0 ? 0 : inter / union;
}

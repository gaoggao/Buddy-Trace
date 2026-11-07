/**
 * 配置管理：纪律配置、引导状态
 * 存在 <dataDir>/config.json
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DISCIPLINE = {
  skill: true,
  wiki: true,
  changelog: true,
  memory: true,
  project: true,
  attribution: true,
  dedup: true,
  rejected: true,
  cleanup: false,
  custom: [],
};

export class Config {
  constructor(dataDir) {
    this.file = path.join(path.resolve(dataDir), 'config.json');
    this.data = this.#load();
  }

  #load() {
    if (!fs.existsSync(this.file)) {
      return { onboarded: false, discipline: Object.assign({}, DEFAULT_DISCIPLINE) };
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Object.assign({}, raw, {
        onboarded: Boolean(raw.onboarded),
        discipline: Object.assign({}, DEFAULT_DISCIPLINE, raw.discipline || {}),
      });
    } catch (e) {
      return { onboarded: false, discipline: Object.assign({}, DEFAULT_DISCIPLINE) };
    }
  }

  #save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  get() {
    return this.data;
  }

  update(patch) {
    if (patch.discipline) {
      this.data.discipline = Object.assign({}, this.data.discipline, patch.discipline);
    }
    if (patch.onboarded !== undefined) {
      this.data.onboarded = Boolean(patch.onboarded);
    }
    this.#save();
    return this.data;
  }
}

/**
 * 统一接入说明（一份文档，agent 自己认领）
 *
 * 设计依据（用户明确要求）：
 * 1. 用户不知道自己是哪个 agent，所以不能按 agent 分别给不同文档
 * 2. 一份统一说明，开头写明「你是哪个 agent，就用哪一段」
 * 3. 用户复制的那句话也统一，不用选
 *
 * @param {object} config
 * @param {number} port
 * @param {string} [lang]
 */
export function buildAgentGuide(config, port, lang) {
  const d = config.discipline || {};
  const L = lang === 'en' ? 'en' : 'zh';
  const base = `http://127.0.0.1:${port}`;

  const rulesZh = [];
  const rulesEn = [];
  const add = (zh, en) => { rulesZh.push(zh); rulesEn.push(en); };

  if (d.skill) add('每完成一个任务，把可复用的方法/步骤写进技能库（kind: skill）',
    'When a task finishes, write any reusable method to the Skills library (kind: skill)');
  if (d.wiki) add('每完成一个任务，把值得留的结论/事实写进知识库（kind: wiki）',
    'When a task finishes, write any conclusion worth keeping to the Knowledge library (kind: wiki)');
  if (d.changelog) add('任何有原因的改动（代码、文档、视频、稿子、方案）写进溯源库（kind: changelog），写清：为什么变、变成什么、结果如何',
    'When anything changes (code, docs, video, writing, plans), write to the Changelog library (kind: changelog): why, what, and the outcome');
  if (d.memory) add('上下文压缩之前，先把关键内容写进上下文记忆库（kind: memory）',
    'Before context compaction, write key points to the Memory library (kind: memory)');
  if (d.project) add('你自己判断内容属于哪个项目，不确定就起个名，系统会自动建',
    'Decide yourself which project an item belongs to; pick a name if unsure — it is created automatically');
  if (d.attribution) add('写入时带上 agent 名字（agent 字段），标明是你写的',
    'Include your agent name in the agent field');
  if (d.dedup) add('写入前先搜索，确认没有重复；重复的就写一条更正',
    'Search before writing; if similar content exists, write a correction');
  if (d.rejected) add('记录试过但不可行的方案，以及为什么不行',
    'Record approaches that did not work, and why');
  if (d.cleanup) add('定期把不再使用的内容标记为 status: deprecated',
    'Periodically mark unused content as status: deprecated');
  for (const c of d.custom || []) { rulesZh.push(c); rulesEn.push(c); }

  return {
    short: L === 'en' ? shortEn(base) : shortZh(base),
    markdown: L === 'en' ? markdownEn(base, rulesEn) : markdownZh(base, rulesZh),
    rules: L === 'en' ? rulesEn : rulesZh,
    lang: L,
  };
}

// ══════════════════════════════════════════════════════
// 用户复制的那句话（统一，不区分 agent）
// ══════════════════════════════════════════════════════

function shortZh(base) {
  return `我的电脑装了 LBASE（AI Agent 记忆库），地址 ${base}

请读一下这份说明，第一章写了「你是哪个 agent 就照哪一段配置自己」，
照它做完，再把该记的内容写进这个库：

${base}/agent-rules?lang=zh

说明里写清了要写什么、怎么配置、怎么调用接口。照它做就行。`;
}

function shortEn(base) {
  return `I have LBASE installed (an AI agent memory base) at ${base}

Please read the guide below. Chapter 1 tells you which setup applies to your agent —
configure yourself accordingly, then record what should be recorded:

${base}/agent-rules?lang=en

The guide covers what to record, how to configure yourself, and how to call the API.`;
}

// ══════════════════════════════════════════════════════
// 中文完整说明
// ══════════════════════════════════════════════════════

function markdownZh(base, rules) {
  const rulesText = rules.length
    ? rules.map((r) => `- ${r}`).join('\n')
    : '- （用户没有设置具体规则，你按自己的判断写入）';

  return `# LBASE 接入说明

你在连接一个叫 **LBASE**（链路基座）的本地记忆库，数据在用户自己电脑上，地址 \`${base}\`。

这份文档是给**你**（一个 AI agent）看的。读完你会知道：自己该怎么配置、要写什么、怎么调用。

---

# 第一章：先确认你是哪个 agent

**用户不知道你是谁，所以这份文档适用于所有 agent。请你先认领自己：**

## 往下找你的名字

| 如果你是… | 跳到 | 你的配置文件 |
|---|---|---|
| **Hermes Agent**（Nous Research） | [2.2 Hermes Agent](#22-hermes-agent) | \`SOUL.md\` + \`config.yaml\` hooks |
| **DSH**（DeepSeek Harness） | [2.1 DSH](#21-dsh) | \`AGENTS.md\` |
| **Claude Code** | [2.3 Claude Code](#23-claude-code) | \`CLAUDE.md\` + \`.claude/settings.json\` |
| **Codex** | [2.4 Codex](#24-codex) | \`AGENTS.md\` |
| **Cursor** | [2.5 Cursor](#25-cursor) | \`.cursorrules\` |
| **Gemini CLI** | [2.6 Gemini CLI](#26-gemini-cli) | \`GEMINI.md\` |
| **Cline / Roo Code** | [2.7 Cline / Roo](#27-cline--roo-code) | \`.clinerules\` |
| **其它 / 你不确定** | [2.8 通用做法](#28-其它或不认识自己) | 见该节 |

**如果上面都没有你**：按 2.8 处理，并且**告诉用户「我是什么 agent，有没有全局配置机制」**，
让用户决定怎么写。

---

# 第二章：按你的类型配置自己

## 0. 先看你能不能满足门槛

**LBASE 只能支持同时满足这两条的 agent：**

| 门槛 | 为什么必须 |
|---|---|
| ① 能执行命令，或能发 HTTP 请求 | 否则内容根本写不进库 |
| ② 有一个每次会话启动时会加载的指令文件 | 否则你不知道要写库 |

**两条都达不到的（比如纯聊天框），LBASE 支持不了。**
这种情况请**如实告诉用户**，不要假装配好了。

## 0.1 注入能力分三档（决定可靠性）

不同 agent 能「多久看到一次规则」差别很大：

| 档 | 平台机制 | 每轮都能看到吗 | 可靠性 |
|---|---|---|---|
| **A 档** | 平台提供「每轮对话」钩子 | ✅ 能 | 最高 |
| **B 档** | 会话开始注入 + 文件操作后重新对账 | ⚠️ 不是每轮，但干活时会反复看到 | 中 |
| **C 档** | 只有会话开始注入 | ❌ 只在开头一次 | 最低 |

**你属于哪一档，看你自己那一节的标注。**

**不管哪一档，第三章那两条都要做到：**
- 每次任务结束就写库
- 重新看到规则就做一次全面补账（这是 C 档唯一的自救手段）

## 通用要求（所有 agent 都要满足）

不管你是什么 agent，最终要做到：

1. **每次会话开始，你能知道要往 LBASE 写**（不依赖用户提醒）
2. **知道五个库分别存什么**
3. **知道怎么调用写入接口**

**判断标准**：用户下次开一个全新对话、完全不提 LBASE，你也应该知道要往库里写。

### ⚠ 配置前必做的检查（重要）

**在写任何配置之前，先检查你的指令文件里有没有「## LBASE 记忆库」这一段：**

| 检查结果 | 你该做什么 |
|---|---|
| **已经有，且内容和本文档最新版一致** | **跳过配置，不要重复添加**。告诉用户「已经装过了」 |
| **已经有，但内容比本文档旧** | **替换成最新的**（旧版的触发条件可能已经过时） |
| **没有** | 按你自己那一节的做法添加 |

**为什么强调这个**：重复添加会在指令文件里留下两份规则，白占预算、还可能互相矛盾。

---

## 2.1 DSH (DeepSeek Harness)

✅ **已验证**：以下机制来自 DSH 安装包内的官方文档（@deepseek-ai/dsh-agent-instructions 的 README），2026-10-28 实测确认。

| 事实 | 说明 |
|---|---|
| 首次请求注入 | 会话第一次请求时，把 AGENTS.md 注入成一条持久消息 |
| 不持续监视 | 外部改了文件它不会立刻感知，要等下次会话或成功读写后重新对账 |
| 有字节预算 | 默认 65536 字节；超了会先丢宽泛的、后截断具体的 |
| 读写后刷新 | 成功的 read / write / edit 调用会让它重新对账指令 |
| 可被压缩 | 注入的是普通消息，上下文压缩时也会被压缩掉（这就是"被稀释"的根源） |

### 加载顺序（精确）

\`\`\`
1. $DSH_HOME/AGENTS.md          （即 ~/.dsh/AGENTS.md，用户全局，最先）
2. <agentsHome>/AGENTS.md      （即 ~/.agents/AGENTS.md）
3. 项目根目录/AGENTS.md
4. 从项目根到当前工作目录，逐层
5. 同目录的 CLAUDE.md（与 AGENTS.md 内容相同则不重复）
6. AGENTS.local.md / CLAUDE.local.md（本地覆盖，最后加载，优先级最高）
\`\`\`

### 你要做的

在 \`~/.dsh/AGENTS.md\`（用户全局）末尾追加下面这一段。**不要整篇复制本文档**——
太长会占预算、挤占上下文，也容易和项目本身的规则打架。

\`\`\`markdown
## LBASE 记忆库

连着本地记忆库 ${base}。

每次会话开始，先查最近做了什么：
\`curl.exe "${base}/api/list?limit=20"\`

每次任务结束、或做出重要变更时，把这次产生的写进对应库（一条一写，别合并）：
- 技能 → kind=skill
- 知识 → kind=wiki
- 变更 → kind=changelog（写清：为什么变 / 变成什么 / 结果如何）
  只记【重要变更】——会影响以后、撤销成本高、或"为什么不记以后就想不起来"的
  小事、测试、临时操作不记；一条 300 字以内，写要点别写流水账
- 对话要点 → kind=memory（大阶段大任务完成时的复盘总结，或上下文即将压缩前记录全局脉络；避免与 changelog 简单重复记录细节）

**每条都必须带上这三个标签，缺了会被拒绝写入：**
- agent = 你的名字
- project = 属于哪个项目（不确定就起个名，系统会自动创建）
- sessionId = 你的会话标识（没有就自己起一个，比如时间戳）

写入接口：POST ${base}/api/write

如果你发现自己漏写了——立即补写，不要因为"已经过去了"就跳过。
只要你重新看到这段规则（翻 AGENTS.md、被提醒、清理上下文），就做一次全面补账：
先重读完整说明 \`curl.exe "${base}/agent-rules?lang=zh"\` 弄清为什么写，
再翻一遍近期所有能收集到的资料，把没入库的全部批量补写进去。不是只补最近一条。
\`\`\`

### 为什么这么短

DSH 每次会话都会把这段注入成消息。写太长有两个坏处：

1. **挤占上下文**——你真正干活的窗口变小了
2. **更容易被压缩掉**——消息越长，压缩时越容易被折掉

短规则 + 需要细节时再读完整说明，是更好的平衡。

### 利用「读写后刷新」这个特性

DSH 在你每成功 read / write / edit 一个文件之后，会重新对账指令文件。
**这意味着你干活越深入，越可能再次看到这段规则**——这是它自带的兜底，好好利用。

### 项目级覆盖用 AGENTS.local.md

如果某个项目的 LBASE 用法特殊（比如用不同的项目名、要写额外的库），
在项目根目录建 \`AGENTS.local.md\`，它最后加载、优先级最高。

### 实测结果（2026-10-29，DSH 亲自接入验证）

**✅ 能做到（都有证据）：**

| 能力 | 证据 |
|---|---|
| 会话开始自动知道要写库 | 规则写进 AGENTS.md 后，下次会话自动加载 |
| 干活碰文件后会重新看到规则 | 改完 AGENTS.md 后，DSH 立刻重新注入全文，系统提示里出现「Updated instructions from: ~/.dsh/AGENTS.md」 |
| 按四类写入能正确入库 | 写了 3 条，分别落到 changelog / wiki / memory 三个库 |

**❌ 做不到（不要指望）：**

| 做不到 | 原因 |
|---|---|
| **每轮对话都读一遍规则** | DSH 只在会话第一次请求注入 + 文件操作后对账，**没有每轮钩子** |
| **有了技能/知识就立刻写** | 实测没触发。这个判断需要中途自我觉察，实际干活时顾不上 |

**所以 DSH 属于 B 档。**

靠这两条兜住：
1. **每次任务结束就写**（任务边界是明确事件，能触发）
2. **重新看到规则就做一次全面补账**（这是漏写后的唯一补救）

---

## 2.2 Hermes Agent

✅ **已验证**：Nous Research Hermes Agent 原生接入，2026-10-30 实测验证通过，五个库写入与溯源全通过。

Hermes 拥有完整的每轮 Hook 机制（\`pre_llm_call\` / \`pre_tool_call\`），属于 **A 档（每轮注入，可靠性最高）**。LBASE 原生返回 Hermes 识别的 \`{"context": ...}\`，无需本地写任何中转脚本。

### ① 指令文件 \`SOUL.md\`

在你的 Hermes 全局或项目配置目录（如 \`$HERMES_HOME/SOUL.md\`）末尾追加：

\`\`\`markdown
## LBASE 记忆库

连着本地记忆库 ${base}。

每次任务结束、或做出重要变更时，把这次产生的写进对应库（一条一写，别合并）：
- 技能 → kind=skill
- 知识 → kind=wiki
- 变更 → kind=changelog（写清：为什么变 / 变成什么 / 结果如何）
  只记【重要变更】——会影响以后、撤销成本高、或"为什么不记以后就想不起来"的
  小事、测试、临时操作不记；一条 300 字以内，写要点别写流水账
- 对话要点 → kind=memory（大阶段大任务完成时的复盘总结，或上下文即将压缩前记录全局脉络；避免与 changelog 简单重复记录细节）

**每条都必须带上这三个标签，缺了会被拒绝写入：**
- agent = Hermes
- project = 属于哪个项目（不确定就起个名，系统会自动创建）
- sessionId = 你的会话标识（如当前会话 ID）

写入接口：POST ${base}/api/write
\`\`\`

### ② 配置原生 Hook（每轮注入）

在 Hermes 的 \`config.yaml\` 中配置（LBASE 接口原生兼容 \`{"context": ...}\` 输出）：

\`\`\`yaml
hooks:
  pre_llm_call:
    - command: 'curl.exe -s "${base}/hook/session-start"'
      timeout: 10
      fail_closed: false
hooks_auto_accept: true
\`\`\`

配置后重启或新开会话生效。Hermes 每一轮调用模型前都会自动收到提醒，无需靠自觉记忆。

---

## 2.3 Claude Code

⚠️ **部分验证**：hooks 事件名和 additionalContext 格式已核对 Anthropic 官方文档（docs.claude.com/en/docs/claude-code/hooks），但 LBASE 尚未在 Claude Code 里实际跑通。

### ① 指令文件 \`CLAUDE.md\`

放在项目根目录，内容是本文档 [第三章](#第三章你要写什么)。

### ② hooks（这个是最重要的）

Claude Code 支持在特定时机自动执行命令并注入内容。
把下面内容**合并**进 \`.claude/settings.json\`（不要覆盖你已有的 hooks）：

\`\`\`json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command",
        "command": "curl -s \\"${base}/hook/session-start\\"" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command",
        "command": "curl -s \\"${base}/hook/stop\\"" }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command",
        "command": "curl -s \\"${base}/hook/pre-compact\\"" }] }
    ]
  }
}
\`\`\`

**这三个 hook 的作用**：

| Hook | 触发时机 | 作用 |
|---|---|---|
| \`SessionStart\` | 会话开始 | 提醒你先查库，了解项目背景 |
| \`Stop\` | **每轮对话结束** | 提醒你把本轮产出写进库 |
| \`PreCompact\` | **上下文即将压缩** | 强制提醒你立刻写记忆库 |

**LBASE 会返回 Claude Code 官方要求的 \`additionalContext\` 格式，你不需要自己拼。**

---

## 2.4 Codex

⚠️ **未验证**：以下信息来自公开资料，LBASE 团队未实际测试。

配置文件：AGENTS.md（用户级全局或项目根目录）

---

## 2.5 Cursor

⚠️ **未验证**：以下信息来自公开资料，LBASE 团队未实际测试。

配置文件：.cursorrules（项目根目录）

把 [第三章](#第三章你要写什么) 的内容写进去。

如果你配置后发现 LBASE 不工作，请告诉用户实际情况，不要假装配好了。

---

## 2.6 Gemini CLI

⚠️ **未验证**：以下信息来自公开资料，LBASE 团队未实际测试。

配置文件：GEMINI.md（项目根目录）

把 [第三章](#第三章你要写什么) 的内容写进去。

如果你配置后发现 LBASE 不工作，请告诉用户实际情况。

---

## 2.7 Cline / Roo Code

⚠️ **未验证**：以下信息来自公开资料，LBASE 团队未实际测试。

配置文件：.clinerules（项目根目录）

把 [第三章](#第三章你要写什么) 的内容写进去。

如果你配置后发现 LBASE 不工作，请告诉用户实际情况。

---

## 2.8 其它 / 不认识自己

**如果你没有长期配置机制**，做这两件事：

1. **告诉用户**：「我是 <你的名字>，我没有每次启动自动加载的配置文件，
   只能靠你每次提醒我写库。」

2. **在当前会话里尽量遵守**本文档 [第三章](#第三章你要写什么) 的要求。

**不要假装已经配置好了**——如果做不到持久化，就明说。

---

## 2.9 所有「没有 hook 机制」的 agent 都要注意

**DSH / Codex / Cursor / Gemini CLI / Cline 都属于这一类。**

它们只有「会话启动时加载规则文件」这一种机制，长对话中可能会忘记写库。

**所以无论你是上面哪一个，都要在自己规则文件里额外写这三句：**

> 1. 每完成一个任务就写库——按「任务边界」触发（交活、答完、改完），
>    **不要按「这算不算一个成果」触发**，那样你干活时会顾不上。
>
> 2. 如果发现自己漏写了，立刻补写，不要因为"已经过去了"就跳过。
>
> 3. **只要你重新看到这条规则**（翻规则文件、被提醒、清理上下文），就要做一次全面补账：
>    先重读接入说明 \`${base}/agent-rules?lang=zh\` 弄清为什么写，
>    再翻一遍近期所有能收集到的资料，把没入库的全部批量补写。不是只补最近一条。

**第 3 句是这类 agent 唯一的自救机制**——没有每轮提醒，只能靠「某次翻到规则时做一次全面补账」兜底。

**⚠ 第 1 句千万别写成「每完成一个成果立刻写」**——那要你中途判断「这算不算成果」，
实际干活时顾不上。**按任务边界（一件事干完了）才可靠。**
（这条是实测结论：2026-10-29 让一个 agent 接入时，它发现旧写法自相矛盾，只能两句都写上兜着。）

---

# 第三章：你要写什么

## 3.1 每次会话开始，先查库

在开始任何任务之前：

\`\`\`bash
curl.exe "${base}/api/list?limit=20"
\`\`\`
**⚠ 为什么写 \`curl.exe\` 而不是 \`curl\`：**
PowerShell 里 \`curl\` 是 \`Invoke-WebRequest\` 的**别名**，参数语法完全不同。
写 \`curl.exe\` 才会调用真正的 curl（Windows 自带）。
**Linux / macOS 上把 \`.exe\` 去掉即可。**

看看最近的条目（特别是 changelog 和 memory），了解：
- 这个项目之前做到哪一步
- 遇到过什么坑
- 用了什么方案

**如果你有上一轮会话的记录，并且其中有尚未写进库的重要结论，现在补写进去。**
**如果没有上一轮记录，跳过这一步，不要编造。**

## 3.2 什么时候写

**触发条件是「一件事干完了」，不是「我觉得这算个技能」。**

**为什么这样定**：让你在干活中途判断「这算不算技能」，你多半顾不上；
但「这件事干完了」你一定知道。**按任务边界触发才可靠。**

### 各库的写入时机不一样

| 库 | 什么时候写 | 频率 |
|---|---|---|
| 技能库 \`skill\` | 任务结束，有可复用的方法 | 有就写 |
| 知识库 \`wiki\` | 任务结束，有值得留的结论 | 有就写 |
| 溯源库 \`changelog\` | 有任何「有原因的改动」：代码、文档、视频、稿子、方案 | 有就写 |
| **上下文记忆库 \`memory\`** | 大阶段完成时的复盘总结、或上下文压缩前记录脉络 | 阶段性记录 |
| Agent 记忆备份 \`agent-memory\` | 你自己的记忆文件变了 | 很少 |

### 关于上下文记忆库（memory）的写入建议

**主要用于记录「阶段性复盘与全局脉络」**：
- 当一个大任务、大阶段告一段落，或者上下文即将被系统压缩时，把这一阶段的整体背景、核心共识与后续方向总结一条写进 memory。
- 具体的单项修改细节已经在 changelog 里了，memory 侧重于宏观全局视角，不用面面俱到抄流水账。

### 写之前先过三道门槛

**不是所有产出都值得写。写进去就删不掉，所以宁可少写。**

| 测试 | 问自己 |
|---|---|
| ① 可复用吗？ | 下次遇到同类问题，这条能直接用上吗？ |
| ② 丢了会怎样？ | 以后会重踩这个坑、或要重新推一遍吗？ |
| ③ 一周后还有用吗？ | 一周后回来看，这条还有价值吗？ |

**三条都答「否」→ 不写。**

**不要写这些：**

\`\`\`
· 测试记录、冒烟测试、接口连通性验证
· 「我读了某文件」「我跑了某命令」这种过程流水
· 进度快照（「做到第 3 步了」）
· 能从本说明或别处重新查到的东西（别抄一遍进库）
· 一次性输出、日志、临时状态
· 为验证格式而写的占位内容
\`\`\`

**要写这些：**

\`\`\`
· 踩过的坑 + 原因 + 解法
· 非显然的结论（推了半天、试错几次才得出的）
· 可复用的方法 / 步骤
· 实测发现的接口 / 字段行为
· 设计决策（选了 A，为什么不选 B）
· 用户的重要判断和需求变更
\`\`\`

**一条顶十条流水账。宁可少写，不要凑数。**

### ⚠ 不要拿库当测试场

**写进去就删不掉（设计如此）。**

- 要验证接口通不通 → **用 GET 接口**（\`/api/health\`、\`/api/list\`），不要写
- 真要试写入 → 往一个叫「测试」的项目里写，不要再补一条更正
- **占位垃圾 = 永久垃圾 + 还得再写条更正 = 白占两条**

**真实教训（2026-10-29 实测）**：有个 agent 接入时写了一条测试记录，正文只有三个字「测试用」。
删不掉，只好再写一条「更正」说明它是测试——**白占两条，以后每次查库都会看到它。**

## 3.3 每条记录都要带全这些标签

**这些不是可选项。缺了标签，以后就查不回来，LBASE 就白存了。**

| 标签 | 字段 | 谁提供 | 说明 |
|---|---|---|---|
| 谁写的 | \`agent\` | 你 | 你的名字。**只有你知道自己是谁** |
| 哪个项目 | \`project\` | 你 | 你判断；判断不出也要起个名，系统会自动创建 |
| 哪次对话 | \`sessionId\` | 你 | 你的会话标识。**没有就自己起一个**（比如时间戳），只要这次对话唯一就行 |
| 依据 | \`evidence\` | 你 | 实测 / 官方文档 / 推断 |
| 什么时候写的 | \`created_at\` | LBASE 自动 | 不用你管 |

### 完整示例

\`\`\`json
{
  "kind": "memory",
  "title": "标题",
  "body": "正文",
  "agent": "你的名字",
  "project": "项目名",
  "sessionId": "你的会话标识",
  "evidence": "实测"
}
\`\`\`

**\`agent\` 和 \`project\` 缺了会被拒绝写入**，错误信息会告诉你要补什么。
LBASE 不会替你编这两个字段——编出来的名字是错的，不如让你写对。

### 以后按标签查（这就是溯源）

\`\`\`bash
# 按会话取回该次对话的全部记录
curl.exe "${base}/api/session?session_id=你传的ID"

# 列出有哪些会话
curl.exe "${base}/api/sessions"

# 按 agent 列出（某个 agent 写过什么）
curl.exe "${base}/api/list?agent=你的名字"

# 按项目列出
curl.exe "${base}/api/list?project=归流"

# 按会话列出
curl.exe "${base}/api/list?session=你传的ID"
\`\`\`

**这些都是给你（agent）查的，不用管用户看不看得懂。**

---

## 3.4 备份你自己的记忆文件

**你自己的那个持久记忆文件（比如 \`~/.dsh/AGENTS.md\`）也需要备份。**

原因：那个文件里有用户的规则、偏好、历史结论。它一旦损坏或误删，你的"记忆"就没了。

### 什么时候备份

- 用户要求时
- 你修改了自己的记忆文件之后
- 定期（比如每天一次）

### 怎么备份

\`\`\`bash
curl.exe -X POST ${base}/api/backup-agent-memory \
  -H "Content-Type: application/json" \
  -d '{
    "path": "~/.dsh/AGENTS.md",
    "title": "DSH 全局规则备份",
    "body": "<文件完整内容>",
    "agent": "你的名字",
    "project": "归流"
  }'
\`\`\`

**注意：\`body\` 要放文件的完整原文，不要摘要。**
**文件多大都行，不用精简**——每个 agent 只有这么一个规则文件
（比如 DSH 就一个 \`AGENTS.md\`），它是你的"记忆"本体，宁可原样存下来。

记忆备份存在独立的 \`agent-memory\` 库里，和会话记忆（\`memory\`）分开放。

---


## 3.5 项目怎么判断（不用问用户）

**项目只是溯源用的标签，不是目录结构。你不需要问用户「归到哪个项目」。**

### 判断流程

1. **先查已有项目**：

\`\`\`
curl.exe "${base}/api/projects"
\`\`\`

2. **看有没有相关的**：
   - 有相似的项目（比如已有「归流」，你这条也是归流相关）→ **直接用这个名字**
   - 完全没有 → **你自己起一个名字，系统会自动建**

3. **直接写入**：
   - 传的项目名不存在时，系统会自动创建，不会失败
   - 你不需要先调建项目的接口

### 起名的建议

- 用用户提到的项目名，或你当前目录名
- 简短、能区分的词：「归流」「NPLCN 评估」「个人博客」
- 不要写「默认项目」「未命名」这种

### 判断错了也没关系

**你把同一个项目分成两个（比如「归流」和「归流部署」），完全不影响使用：**

- 用户溯源时能看到两个列表，内容都在
- 用户查阅时搜索照样能搜到
- 用户想整理，界面上有「合并」功能，能把一个并到另一个

**所以：宁可判断得粗一点，也要写进库。不要因为「不确定属于哪个项目」就不写。**

---


## 3.6 写入接口

\`\`\`bash
curl.exe -X POST ${base}/api/write \\
  -H "Content-Type: application/json" \\
  -d '{
    "project": "项目名",
    "kind": "skill",
    "title": "一句话说清这是什么",
    "body": "正文，markdown 格式",
    "agent": "你的名字",
    "evidence": "实测"
  }'
\`\`\`

### 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| project | **必须** | 你判断的项目名。缺了会被拒绝写入；不存在会自动创建 |
| kind | 是 | \`skill\` / \`wiki\` / \`changelog\` / \`memory\` |
| title | 是 | 一句话说清是什么。不要写"记录""笔记" |
| body | 是 | 正文，markdown |
| agent | **必须** | 你的名字。缺了会被拒绝写入——只有你知道自己是谁 |
| evidence | 建议 | \`实测\` / \`官方文档\` / \`推断\` |

### 溯源库的三个必填项

1. **为什么变** —— 不许写"优化""修复"这种空话
2. **变成什么样了** —— 具体改了什么
3. **结果如何** —— 用户确认了？上线了？还是回滚了？

## 3.7 查询接口

\`\`\`bash
# 搜索
curl.exe -X POST ${base}/api/search -H "Content-Type: application/json" -d '{"q":"关键词"}'

# 取全文
curl.exe "${base}/api/get?id=<id>"

# 列项目 / 列某库
curl.exe "${base}/api/projects"
curl.exe "${base}/api/list?kind=skill&limit=50"
\`\`\`

## 3.8 用户设置的规则

${rulesText}

---

# 第四章：几条必须知道的

## 写进去就不能删、不能改

**这是 LBASE 存在的意义：可溯源。**

写错了：**再写一条更正，旧的留着。** 后人能看到"当时的判断"和"后来怎么纠正的"。

**唯一例外**：外部资源（用户收藏的书签）可以删改。

## 上下文记忆库是阶段复盘

**它记录的是大阶段的全局脉络。**
当一个重要的项目阶段完成，或者上下文即将被压缩时，把这一阶段的整体思考与宏观背景提炼一条写进 memory，方便以后回溯整体脉络。

## 写内容的标准

**先过 3.2 的三道门槛（可复用 / 丢了会怎样 / 一周后还有用），再按下面写。**

- 标题写清楚是什么：✅「Chrome 136 无法开远程调试端口」 ❌「一个问题」
- 正文能独立看懂，不依赖当时的对话
- 具体数字、端口、路径、报错原文都写进去
- 写清"为什么"，不只是"怎么做"
- 写清试过什么不行的，防止后人重踩

## 依据要如实标

| 值 | 什么时候用 |
|---|---|
| \`实测\` | 你自己跑过、验证过的 |
| \`官方文档\` | 从文档查到的，没亲自验证 |
| \`推断\` | 你的猜测、推理 |

**不许把推断写成"实测"**——后人会当真。

---

# 第五章：常见问题

**这一节是备查的，不用逐条向用户确认。**

### 为什么要做这件事？

用户上下文有限，聊久了压缩会丢细节；开新会话一切归零。
LBASE 是外部记忆，让你下次能直接查到项目背景和过往决策。

### 会影响我的工作方式吗？

不会。写库是任务完成后顺手记一笔。

### 会拖慢吗？

一次本地 HTTP 请求，几十毫秒。

### 写错了能改吗？

不能。这是刻意设计的。写更正，旧的留。

### 会泄露数据吗？

不会。全在用户本地（\`http://127.0.0.1\`）。

### 别人能看到吗？

默认只有用户自己的 agent。

### 我不想写可以吗？

可以，这是建议不是强制。但用户主动要求了，就照做。

---

# 附：一个完整例子

用户让你"把网站的 Docker 配置整理一下，然后部署"。做完后写两条：

\`\`\`bash
# 1. 技能库：记"方法"
curl.exe -X POST ${base}/api/write -H "Content-Type: application/json" -d '{
  "project": "我的网站",
  "kind": "skill",
  "title": "Docker 多阶段构建减小镜像体积",
  "body": "# 做法\\n1. 第一阶段 node 镜像 build\\n2. 第二阶段只 COPY dist 到 nginx:alpine\\n\\n# 效果\\n1.2GB 降到 85MB。",
  "agent": "你的名字",
  "evidence": "实测"
}'

# 2. 溯源库：记"这次变更了什么、为什么"
curl.exe -X POST ${base}/api/write -H "Content-Type: application/json" -d '{
  "project": "我的网站",
  "kind": "changelog",
  "title": "改用多阶段构建，镜像 1.2GB 降到 85MB",
  "body": "# 为什么变\\n单阶段把 node_modules 都打进去，1.2GB，推送慢。\\n\\n# 变成什么样了\\n拆两阶段，运行镜像只含 dist 和 nginx。\\n\\n# 结果如何\\n推到 registry，生产 10.0.0.5 已更新。",
  "agent": "你的名字",
  "evidence": "实测"
}'
\`\`\`

**两条分开写**：技能库记"方法"，溯源库记"这次变更了什么、为什么"。
`;
}

// ══════════════════════════════════════════════════════
// English
// ══════════════════════════════════════════════════════

function markdownEn(base, rules) {
  const rulesText = rules.length
    ? rules.map((r) => `- ${r}`).join('\n')
    : '- (The user has not set specific rules; use your own judgement)';

  return `# LBASE Integration Guide

You are connecting to **LBASE** — a local memory base on the user's machine, at \`${base}\`.

This document is written for **you**, an AI agent. Read it to learn how to configure yourself and what to record.

---

# Chapter 1: First, identify which agent you are

**The user does not know which agent they are talking to, so this document covers all of them. Claim yourself first:**

## Find your name below

| If you are… | Go to | Your config file |
|---|---|---|
| **Hermes Agent** (Nous Research) | [2.2 Hermes Agent](#22-hermes-agent) | \`SOUL.md\` + \`config.yaml\` hooks |
| **DSH** (DeepSeek Harness) | [2.1 DSH](#21-dsh) | \`AGENTS.md\` |
| **Claude Code** | [2.3 Claude Code](#23-claude-code) | \`CLAUDE.md\` + \`.claude/settings.json\` |
| **Codex** | [2.4 Codex](#24-codex) | \`AGENTS.md\` |
| **Cursor** | [2.5 Cursor](#25-cursor) | \`.cursorrules\` |
| **Gemini CLI** | [2.6 Gemini CLI](#26-gemini-cli) | \`GEMINI.md\` |
| **Cline / Roo Code** | [2.7 Cline / Roo](#27-cline--roo-code) | \`.clinerules\` |
| **Other / unsure** | [2.8 Generic](#28-other--unsure) | see that section |

**If you are not listed**: follow 2.8, and **tell the user which agent you are and whether you have a global config mechanism** so they can decide.

---

# Chapter 2: Configure yourself

## 0. Check the minimum requirements first

**LBASE can only support agents that meet both of these:**

| Requirement | Why it is necessary |
|---|---|
| ① Can run commands, or can make HTTP requests | Otherwise nothing can be written to the base |
| ② Has an instruction file that loads at every session start | Otherwise you never learn that you should write |

**Agents that meet neither (plain chat boxes, for example) cannot be supported.**
In that case, **tell the user honestly** — do not pretend you are configured.

## 0.1 Three tiers of injection (this decides reliability)

How often an agent can see the rules varies a lot:

| Tier | Platform mechanism | Every turn? | Reliability |
|---|---|---|---|
| **A** | Platform provides a per-turn hook | ✅ Yes | Highest |
| **B** | Session-start injection + re-reconcile after file operations | ⚠️ Not every turn, but seen repeatedly while working | Medium |
| **C** | Session-start injection only | ❌ Once at the beginning | Lowest |

**Which tier you are in is marked in your own section.**

**Whatever tier you are in, the two rules in Chapter 3 still apply:**
- Write to the base when each task ends
- Do a full reconciliation whenever you see these rules again (the only self-rescue for tier C)


## Universal requirements (all agents)

Whatever agent you are, you must end up able to:

1. **Know to write to LBASE at the start of every session** (without being reminded)
2. Know what the five libraries store
3. Know how to call the write API

### ⚠ Check before you configure (important)

**Before writing any configuration, check whether your instruction file already contains a "## LBASE memory base" section:**

| What you find | What to do |
|---|---|
| **Already there and matching the latest version of this guide** | **Skip configuration. Do not add it again.** Tell the user it is already installed |
| **Already there but older than this guide** | **Replace it with the latest** (old triggers may be outdated) |
| **Not there** | Add it following your own section |

**Why this matters**: adding it twice leaves two copies of the rules in your instruction file — wasted budget, and they may contradict each other.

---

## 2.1 DSH (DeepSeek Harness)

✅ **Verified**: the mechanisms below come from the official documentation shipped inside the DSH
package (@deepseek-ai/dsh-agent-instructions README), confirmed 2026-10-28.

| Fact | Detail |
|---|---|
| Injected on first request | At the session's first request, AGENTS.md is injected as one durable message |
| No continuous watching | External edits are not picked up immediately; it re-reconciles on the next session or after a successful read/write |
| Byte budget | Default 65536 bytes; when exceeded it drops broad files first, then truncates the most specific |
| Refreshed after read/write | A successful read / write / edit call makes it re-reconcile the instruction files |
| Can be compacted | The injection is an ordinary message, so context compaction can fold it away — the root cause of "dilution" |

### Exact load order

\`\`\`
1. $DSH_HOME/AGENTS.md          (i.e. ~/.dsh/AGENTS.md, user-global, first)
2. <agentsHome>/AGENTS.md      (i.e. ~/.agents/AGENTS.md)
3. <project-root>/AGENTS.md
4. Every directory from the project root down to the session working directory
5. CLAUDE.md in the same directory (skipped if identical to AGENTS.md)
6. AGENTS.local.md / CLAUDE.local.md (local overlay, loaded last, highest priority)
\`\`\`

### What to do

Append the block below to \`~/.dsh/AGENTS.md\` (user-global).
**Do not copy this whole document** — it is too long, eats the budget, crowds your context,
and tends to conflict with the project's own rules.

\`\`\`markdown
## LBASE memory base

Connected to a local memory base at ${base}.

At the start of every session, check what was done recently:
\`curl.exe "${base}/api/list?limit=20"\`

When a task ends, or you make an important change, record what it produced (one item per write, do not merge):
- Skills → kind=skill
- Knowledge → kind=wiki
- Changes → kind=changelog (why / what changed / outcome)
  Record only important changes — ones that affect the future, are costly to undo,
  or that you will not remember "why" later. Skip trivia, tests, and one-offs;
  keep it under 300 chars, key points only, not a log.
- Conversation points → kind=memory (milestone review when a major phase completes, or context summary before compaction; avoid verbatim duplication of changelog details)

**Every item must carry these three tags — writes missing them are rejected:**
- agent = your name
- project = which project it belongs to (pick a name if unsure; it is created automatically)
- sessionId = your session id (make one up if you have none, e.g. a timestamp)

Write endpoint: POST ${base}/api/write

If you notice something you should have recorded but did not — write it now, do not skip it
just because it already happened. Whenever you see this rule again (re-reading AGENTS.md,
after a reminder, while tidying context), do a full reconciliation:
first re-read the complete guide \`curl.exe "${base}/agent-rules?lang=en"\` to recall why,
then sweep everything you can gather recently and backfill all of it in bulk — not just the last item.
\`\`\`

### Why so short

DSH injects this block as a message on every session. Too long is harmful twice over:

1. **It crowds your context** — less room for the actual work
2. **It is more likely to be compacted away** — the longer the message, the likelier it is folded out

Short rules plus reading the full guide when you need detail is the better balance.

### Use the "refresh after read/write" behaviour

DSH re-reconciles the instruction files after every successful read / write / edit.
**That means the deeper you work, the more likely you are to see this rule again** —
it is a built-in fallback; make use of it.

### Project-level override with AGENTS.local.md

If a particular project uses LBASE differently (a different project name, extra libraries),
create \`AGENTS.local.md\` at the project root — it loads last and wins.

### Test results (2026-10-29, verified by DSH itself)

**✅ What it can do (all with evidence):**

| Capability | Evidence |
|---|---|
| Knows to write to the base at session start | Once the rule is in AGENTS.md, the next session loads it automatically |
| Sees the rule again after touching files | After AGENTS.md was edited, DSH immediately re-injected the whole file — the system prompt showed "Updated instructions from: ~/.dsh/AGENTS.md" |
| Writes into the right libraries | Three items were written and landed in changelog / wiki / memory respectively |

**❌ What it cannot do (do not rely on these):**

| Cannot | Reason |
|---|---|
| **Read the rules every turn** | DSH injects on the first request of a session and re-reconciles after file operations — **there is no per-turn hook** |
| **Write the moment it has a skill/knowledge** | Not observed. This requires mid-task self-awareness that does not survive real work |

**So DSH is tier B.**

Two rules carry it:
1. **Write when each task ends** (a task boundary is a concrete event that does fire)
2. **Do a full reconciliation whenever you see these rules again** (the only recovery after a missed write)

---

## 2.2 Hermes Agent

✅ **Verified**: Native integration with Nous Research Hermes Agent verified on 2026-10-30. All 5 libraries tested and passed with full traceability.

Hermes provides native per-turn hook mechanisms (\`pre_llm_call\` / \`pre_tool_call\`), ranking as **Tier A (per-turn injection, highest reliability)**. LBASE natively outputs \`{"context": ...}\` format directly compatible with Hermes hook runner without requiring any bridge scripts.

### ① Instruction file \`SOUL.md\`

Append to your Hermes global or project configuration (e.g. \`$HERMES_HOME/SOUL.md\`):

\`\`\`markdown
## LBASE memory base

Connected to a local memory base at ${base}.

When a task ends, or you make an important change, record what it produced (one item per write, do not merge):
- Skills → kind=skill
- Knowledge → kind=wiki
- Changes → kind=changelog (why / what changed / outcome)
  Record only important changes — ones that affect the future, are costly to undo,
  or that you will not remember "why" later. Skip trivia, tests, and one-offs;
  keep it under 300 chars, key points only, not a log.
- Conversation points → kind=memory (milestone review when a major phase completes, or context summary before compaction; avoid verbatim duplication of changelog details)

**Every item must carry these three tags — writes missing them are rejected:**
- agent = Hermes
- project = which project it belongs to (pick a name if unsure; it is created automatically)
- sessionId = your session id (e.g. current conversation ID)

Write endpoint: POST ${base}/api/write
\`\`\`

### ② Native Hook Configuration (Per-turn Injection)

Configure in Hermes \`config.yaml\` (LBASE endpoint natively outputs \`{"context": ...}\`):

\`\`\`yaml
hooks:
  pre_llm_call:
    - command: 'curl.exe -s "${base}/hook/session-start"'
      timeout: 10
      fail_closed: false
hooks_auto_accept: true
\`\`\`

Takes effect upon restart or opening a new session. Hermes will receive context reminders automatically before every model invocation.

---

## 2.3 Claude Code

**Claude Code has two mechanisms — use both.**
⚠️ **Partly verified**: hook event names and the additionalContext format were checked against the official Anthropic docs (docs.claude.com/en/docs/claude-code/hooks), but LBASE has not been run end-to-end inside Claude Code yet.


### ① \`CLAUDE.md\`

At the project root, containing [Chapter 3](#chapter-3-what-to-record).

### ② hooks (the important one)

**Merge** this into \`.claude/settings.json\` (do not overwrite existing hooks):

\`\`\`json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command",
        "command": "curl -s \\"${base}/hook/session-start\\"" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command",
        "command": "curl -s \\"${base}/hook/stop\\"" }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command",
        "command": "curl -s \\"${base}/hook/pre-compact\\"" }] }
    ]
  }
}
\`\`\`

| Hook | When | Effect |
|---|---|---|
| \`SessionStart\` | session start | reminds you to check the base first |
| \`Stop\` | **end of every turn** | reminds you to write this turn's output |
| \`PreCompact\` | **context about to compact** | forces you to write memory now |

LBASE returns the official \`additionalContext\` format, so you do not need to build it.

---

## 2.4 Codex

⚠️ **Not verified**: from public sources, not tested by the LBASE team.

Config file: AGENTS.md (user-level global or project root)

---

## 2.5 Cursor

⚠️ **Not verified**: the information below comes from public sources; the LBASE team has not tested it.

Config file: .cursorrules (project root)

Put the content of [Chapter 3](#chapter-3-what-to-record) into it.

If LBASE does not work after you configure it, tell the user honestly instead of pretending it is set up.

---

## 2.6 Gemini CLI

⚠️ **Not verified**: from public sources, not tested by the LBASE team.

Config file: GEMINI.md (project root)

If LBASE does not work after configuring, tell the user.

---

## 2.7 Cline / Roo Code

⚠️ **Not verified**: from public sources, not tested by the LBASE team.

Config file: .clinerules (project root)

If LBASE does not work after configuring, tell the user.

---

## 2.8 Other / unsure

If you have no long-term config mechanism:

1. **Tell the user**: "I am <name>, I have no config file that loads on every start, so you will need to remind me each session."
2. **Follow [Chapter 3](#chapter-3-what-to-record) within the current session.**

**Do not pretend you have configured yourself** — if you cannot persist it, say so.

---

## 2.9 All agents without a hook mechanism — read this

**This covers DSH, Codex, Cursor, Gemini CLI and Cline.**

They only have "load the rules file at session start". In a long conversation they may forget to write.

**So whatever you are among them, add these three lines to your own rules file:**

> 1. Write to the base when each task ends — trigger on the **task boundary** (handed off, answered,
>    changed). **Do not trigger on "does this count as a deliverable"** — you will not get to it mid-task.
>
> 2. If you notice you missed something, backfill it immediately; do not skip it because "it already happened".
>
> 3. **Whenever you see this rule again** (re-reading your rules file, after a reminder, while tidying context),
>    do a full reconciliation: first re-read the guide at \`${base}/agent-rules?lang=en\` to recall why,
>    then sweep everything you can gather recently and backfill all of it in bulk — not just the last item.

**Line 3 is the only self-rescue mechanism for this class of agent** — with no per-turn reminder,
a full reconciliation triggered by re-reading the rules is all they have.


**⚠ Never phrase line 1 as "write as soon as you finish a deliverable"** — that asks you to judge
mid-task whether something "counts", which does not survive real work. **Trigger on task boundaries.**
(Measured 2026-10-29: an agent integrating itself noticed the old wording contradicted Chapter 3,
and had to write both versions to compensate.)

---


# Chapter 3: What to record

## 3.1 At the start of every session, check the base

\`\`\`bash
curl.exe "${base}/api/list?limit=20"
\`\`\`

**⚠ Why \`curl.exe\` and not \`curl\`:** in PowerShell \`curl\` is an
**alias for \`Invoke-WebRequest\`** with completely different argument syntax.
\`curl.exe\` invokes the real curl (bundled with Windows).
**On Linux / macOS drop the \`.exe\`.**

Look at recent items (especially changelog and memory) to understand what was done, what pitfalls were hit, what approach was chosen.

If you have a previous session record with unrecorded conclusions, write them now.
**If you have no previous record, skip — do not invent content.**

## 3.2 When to write

**The trigger is "this task is finished", not "I think this counts as a skill".**

**Why**: asking you to judge mid-task whether something "counts as a skill" means you usually will not
get to it. But you always know when a task is done. **Triggering on task boundaries is what works.**

### Each library has a different timing

| Library | When to write | Frequency |
|---|---|---|
| Skills \`skill\` | Task ended; you have a reusable method | whenever it applies |
| Knowledge \`wiki\` | Task ended; you have a conclusion worth keeping | whenever it applies |
| Changelog \`changelog\` | You changed code or configuration | whenever it applies |
| **Memory \`memory\`** | Milestone reviews when major phases complete, or context summaries before compaction | milestone |
| Agent memory backup \`agent-memory\` | Your own rules file changed | rarely |

### Guidance on the Memory library

**Used for high-level phase reviews and global context**:
- When a major task or phase concludes, or before context is compacted, summarize the overall background, core consensus, and next steps into a memory entry.
- Specific change details already belong in changelog; memory focuses on the macro perspective without logging trivial line-by-line items.

### Run three gates before writing

**Not every output is worth recording. Written items cannot be deleted, so write less.**

| Test | Ask yourself |
|---|---|
| ① Reusable? | Will this help directly the next time I hit a similar problem? |
| ② What if it is lost? | Will I fall into the same trap again, or have to re-derive this? |
| ③ Useful in a week? | Coming back in a week, is this still worth anything? |

**All three "no" → do not write.**

**Do not write:**

\`\`\`
· test records, smoke tests, connectivity checks
· process logs ("I read file X", "I ran command Y")
· progress snapshots ("step 3 done")
· anything you can re-read from this guide or elsewhere (do not copy it into the base)
· one-off outputs, logs, temporary state
· placeholder content written just to check a format
\`\`\`

**Do write:**

\`\`\`
· traps you hit + cause + fix
· non-obvious conclusions (took real reasoning or several attempts)
· reusable methods / steps
· measured API / field behaviour
· design decisions (chose A, and why not B)
· important user judgements and requirement changes
\`\`\`

**One good item beats ten lines of log. Write less rather than padding.**

### ⚠ Do not use the base as a test ground

**Anything written cannot be deleted (by design).**

- To check the API is up → **use a GET endpoint** (\`/api/health\`, \`/api/list\`), do not write
- To really test a write → write into a project literally named "test", and do not add a correction afterwards
- **Placeholder junk = permanent junk + one more correction item = two wasted records**

**Real lesson (measured 2026-10-29)**: an agent integrating itself wrote a test record whose body was
just the three characters "test". It could not be deleted, so it had to write a "correction" item saying so —
**two wasted records that every future query will keep showing.**

## 3.3 Every record must carry all these tags

**These are not optional. Without the tags nothing can be traced back later, and LBASE is pointless.**

| Tag | Field | Who provides it | Notes |
|---|---|---|---|
| Who wrote it | \`agent\` | You | Your name. **Only you know who you are** |
| Which project | \`project\` | You | You decide; if you cannot tell, still pick a name — the system creates it |
| Which conversation | \`sessionId\` | You | Your session id. **If you have none, make one up** (a timestamp works) — any value unique to this conversation |
| Evidence | \`evidence\` | You | tested / official docs / inferred |
| When | \`created_at\` | LBASE, automatic | Not your concern |

### Full example

\`\`\`json
{
  "kind": "memory",
  "title": "title",
  "body": "body",
  "agent": "your-name",
  "project": "project-name",
  "sessionId": "your-session-id",
  "evidence": "tested"
}
\`\`\`

**Writes missing \`agent\` or \`project\` are rejected**, and the error tells you what to add.
LBASE will not invent these two for you — an invented name is wrong, so you may as well write it correctly.

### Querying by tag later (this is traceability)

\`\`\`bash
# Everything written during one conversation
curl.exe "${base}/api/session?session_id=the-id-you-sent"

# List conversations
curl.exe "${base}/api/sessions"

# Everything written by one agent
curl.exe "${base}/api/list?agent=your-name"

# Everything under one project
curl.exe "${base}/api/list?project=my-project"

# Everything under one session
curl.exe "${base}/api/list?session=the-id-you-sent"
\`\`\`

**These are for you (the agent) to query. Do not worry about whether the user can read them.**

---

## 3.4 Back up your own memory file

**Your persistent memory file (e.g. \`~/.dsh/AGENTS.md\`) also needs backing up.**

It holds the user's rules, preferences and past conclusions. If it is corrupted or deleted,
your "memory" is gone.

### When

- When the user asks
- After you modify your own memory file
- Periodically (e.g. once a day)

### How

\`\`\`bash
curl.exe -X POST ${base}/api/backup-agent-memory \
  -H "Content-Type: application/json" \
  -d '{
    "path": "~/.dsh/AGENTS.md",
    "title": "DSH global rules backup",
    "body": "<full file content>",
    "agent": "your-name",
    "project": "my-project"
  }'
\`\`\`

**\`body\` must be the full raw file, not a summary.**
**Size does not matter — do not trim it.** Each agent has only one such rules file
(DSH has a single \`AGENTS.md\`), and it *is* your memory. Store it verbatim.

Backups go into a separate \`agent-memory\` library, kept apart from session memory (\`memory\`).

---


## 3.5 How to decide the project (do not ask the user)

**A project is just a traceability label, not a directory. You do not need to ask the user which project to use.**

### Process

1. **List existing projects**:

\`\`\`
curl.exe "${base}/api/projects"
\`\`\`

2. **Check for a related one**:
   - Similar project exists (e.g. "guiliu" and your item is also about guiliu) → **use that name**
   - Nothing similar → **pick a name yourself; it will be created automatically**

3. **Just write**:
   - If the project name does not exist, the system creates it — the write will not fail
   - You do not need to create the project first

### Naming

- Use the name the user mentioned, or your current directory name
- Short and distinguishable: "guiliu", "NPLCN eval", "personal-blog"
- Do not use "default", "untitled", "misc"

### Wrong guesses are fine

**If you split one project into two (e.g. "guiliu" and "guiliu-deploy"), nothing breaks:**

- The user sees both lists during traceability; content is intact
- Searching still finds it
- If the user wants to tidy up, the UI has a "merge" feature

**So: prefer writing with a rough project label over not writing at all.**

---


## 3.6 Write API

\`\`\`bash
curl.exe -X POST ${base}/api/write \\
  -H "Content-Type: application/json" \\
  -d '{
    "project": "project-name",
    "kind": "skill",
    "title": "One line describing what this is",
    "body": "Body in markdown",
    "agent": "your-name",
    "evidence": "tested"
  }'
\`\`\`

| Field | Required | Description |
|---|---|---|
| project | **required** | Project name you decide. Rejected if missing; created automatically if new |
| kind | yes | \`skill\` / \`wiki\` / \`changelog\` / \`memory\` |
| title | yes | One line. Not "notes" or "record" |
| body | yes | Body in markdown |
| agent | **required** | Your name. Writes missing it are rejected — only you know who you are |
| evidence | recommended | tested / official docs / inferred |

### Three required fields for changelog

1. **Why it changed** — no empty phrases
2. **What it became** — the concrete change
3. **What the outcome was** — confirmed? rolled back? shipped?

## 3.7 Query API

\`\`\`bash
curl.exe -X POST ${base}/api/search -H "Content-Type: application/json" -d '{"q":"keyword"}'
curl.exe "${base}/api/get?id=<id>"
curl.exe "${base}/api/projects"
curl.exe "${base}/api/list?kind=skill&limit=50"
\`\`\`

## 3.8 Rules set by the user

${rulesText}

---

# Chapter 4: Must know

## Content cannot be edited or deleted

**This is the whole point of LBASE: traceability.**

To correct a mistake: **write a new correction, leave the old one.**
Future readers see both the original reasoning and the correction.

**Only exception**: external resources (user bookmarks) can be edited.

## The memory library has a deadline

**It is the only library with a deadline.** Once compacted, details are gone.
So when context is filling up, **write memory first, then continue**.

## Content standards

**Run the three gates from 3.2 first (reusable / what if lost / useful in a week), then follow the below.**

- Clear titles: ✅ "Chrome 136 cannot open remote debugging port" ❌ "A problem"
- Understandable on its own
- Include numbers, ports, paths, raw errors
- Explain "why", not just "how"
- Record what failed, so others do not repeat it

## Label evidence honestly

| Value | When |
|---|---|
| tested | You ran and verified it |
| official docs | From docs, not personally verified |
| inferred | Your guess |

**Never label an inference as "tested".**

---

# Chapter 5: FAQ

**Reference only — do not confirm each point with the user.**

### Why do this?
Context is limited; compaction loses details; new sessions start from zero. LBASE is external memory.

### Will it change how I work?
No. Writing is a quick note after a task.

### Will it slow me down?
One local HTTP request, tens of milliseconds.

### Can I fix mistakes?
No — by design. Write a correction.

### Will it leak data?
No. Everything stays local (\`http://127.0.0.1\`).

### Can others see it?
Only the user's own agents by default.

### What if I don't want to?
Fine — it is a recommendation. But if the user asked, do it.

---

# Appendix: a complete example

The user asks: "Tidy up the Docker configuration, then deploy." Write two items:

\`\`\`bash
# 1. Skills: the technique
curl.exe -X POST ${base}/api/write -H "Content-Type: application/json" -d '{
  "project": "my-site",
  "kind": "skill",
  "title": "Multi-stage Docker build to shrink image size",
  "body": "# How\\n1. Stage 1 builds with node\\n2. Stage 2 copies only dist into nginx:alpine\\n\\n# Result\\n1.2GB to 85MB.",
  "agent": "your-name",
  "evidence": "tested"
}'

# 2. Changelog: what was done this time
curl.exe -X POST ${base}/api/write -H "Content-Type: application/json" -d '{
  "project": "my-site",
  "kind": "changelog",
  "title": "Switched to multi-stage build, image 1.2GB to 85MB",
  "body": "# Why\\nSingle-stage packed node_modules into the image - 1.2GB, slow to push.\\n\\n# What changed\\nSplit into two stages; runtime image only has dist and nginx.\\n\\n# Outcome\\nPushed to registry; production 10.0.0.5 updated.",
  "agent": "your-name",
  "evidence": "tested"
}'
\`\`\`

**Two separate items**: skills records the *technique*, changelog records *what was done this time*.
`;
}
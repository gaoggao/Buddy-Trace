/**
 * 各家 agent 的适配配置生成
 *
 * 设计原则：
 * 1. 不假设所有 agent 能力相同 —— 每家机制不同，分别生成
 * 2. 只做已验证有机制的 agent，其余先不列
 * 3. Claude Code 用官方 hook 的 additionalContext 机制（不是简单 echo）
 * 4. 生成的内容用户复制粘贴即可用
 *
 * 机制来源（已核对官方文档）：
 * - Claude Code hooks 文档：
 *   · 事件分三类：per session（SessionStart/SessionEnd）、
 *     per turn（UserPromptSubmit/Stop/StopFailure）、
 *     每次工具调用（PreToolUse/PostToolUse）
 *   · 注入上下文的正规方式：返回
 *     {"hookSpecificOutput":{"hookEventName":"...","additionalContext":"..."}}
 *   · 配置文件结构：{"hooks":{"事件名":[{"matcher":"...","hooks":[{"type":"command","command":"..."}]}]}}
 */

/**
 * 支持列表
 * tier:
 *   full    = 会话级 + 每轮/压缩前注入（有 hook 机制）
 *   session = 只有会话级注入（只有指令文件）
 */
export const AGENT_TARGETS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    tier: 'A',
    file: 'CLAUDE.md',
    hooksFile: '.claude/settings.json',
    note: '支持 SessionStart / Stop / PreCompact 钩子，可注入上下文',
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    tier: 'A',
    file: 'SOUL.md',
    hooksFile: 'config.yaml',
    note: '支持 pre_llm_call / pre_tool_call 钩子，A 档原生支持（已实测验证）',
  },
  {
    id: 'dsh',
    name: 'DSH (DeepSeek Harness)',
    tier: 'B',
    file: 'AGENTS.md',
    note: '会话首请求注入 + 文件操作后重新对账（已实测验证）',
  },
  {
    id: 'codex',
    name: 'Codex',
    tier: 'C',
    file: 'AGENTS.md',
    note: '每次会话自动加载 AGENTS.md',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    tier: 'C',
    file: '.cursorrules',
    note: '每次会话自动加载规则文件',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    tier: 'C',
    file: 'GEMINI.md',
    note: '每次会话自动加载 GEMINI.md',
  },
  {
    id: 'cline',
    name: 'Cline / Roo',
    tier: 'C',
    file: '.clinerules',
    note: '每次会话自动加载 .clinerules',
  },
];

/** 一句话提醒（极短，给 Stop / PreCompact 注入用） */
export function buildReminder(port, lang) {
  const base = `http://127.0.0.1:${port}`;
  if (lang === 'en') {
    return `[LBASE] A task just finished — record its output now (skill → skill, knowledge → wiki, any change → changelog), one item per write. Backfill anything you missed. ${base}/api/write`;
  }
  return `【LBASE】刚才的任务干完了，把这次产出写进库（技能→skill，知识→wiki，任何变更→changelog），一条一写别合并。有漏写的现在就补。${base}/api/write`;
}

/** 会话开始提示（给 SessionStart 注入用） */
export function buildSessionHint(port, lang) {
  const base = `http://127.0.0.1:${port}`;
  if (lang === 'en') {
    return `[LBASE] This project has a local memory base at ${base}. Before starting, check recent work: curl.exe "${base}/api/list?limit=20" — then proceed. Record each task's output when it finishes.`;
  }
  return `【LBASE】本项目连着本地记忆库 ${base}。动手前先查最近做了什么：curl.exe "${base}/api/list?limit=20"。每个任务做完把产出写进库。`;
}

/** 压缩前的强提醒（PreCompact） */
export function buildCompactReminder(port, lang) {
  const base = `http://127.0.0.1:${port}`;
  if (lang === 'en') {
    return `[LBASE] Context is about to be compacted. Write the important points of this session to the memory library NOW — after compaction they are lost forever. ${base}/api/write (kind: memory)`;
  }
  return `【LBASE】上下文即将压缩。请现在把本次会话的关键内容写进上下文记忆库（kind: memory）——压缩之后这些细节就永久丢了。${base}/api/write`;
}

/**
 * 生成某个 agent 的适配配置
 * @param {string} agentId
 * @param {number} port
 * @param {string} lang 'zh' | 'en'
 * @returns {{files: Array<{path: string, content: string, note: string}>, target?: object, error?: string}}
 */
export function buildAgentAdapter(agentId, port, lang) {
  const target = AGENT_TARGETS.find((a) => a.id === agentId);
  if (!target) return { files: [], error: '未知的 agent: ' + agentId };

  const base = `http://127.0.0.1:${port}`;
  const en = lang === 'en';
  const files = [];

  // ══════════════════════════════════════════
  // 文件 1：指令文件
  // ══════════════════════════════════════════
  const rulesBody = en
    ? `# LBASE — agent memory base

This project is connected to a local memory base at \`${base}\`.

## At the start of every session

Before starting any task, check what was done recently:

\`\`\`bash
curl "${base}/api/list?limit=20"
\`\`\`

Look at recent items (especially changelog and memory) to understand what was done before,
what pitfalls were hit, what approach was chosen.

If you have a record of a previous session with conclusions not yet recorded, write them now.
**If you have no previous record, skip that step — do not invent content.**

## While working

When a task finishes, record its output. Trigger on the task boundary, not on "is this a skill".

| Output | Library | kind |
|---|---|---|
| A reusable method / steps | Skills | \`skill\` |
| A fact, conclusion, background | Knowledge | \`wiki\` |
| Any change (code, docs, video, plans) | Changelog | \`changelog\` |
| Milestone reviews when major phases complete, or before compaction | Memory | \`memory\` |

\`\`\`bash
curl.exe -X POST ${base}/api/write \\
  -H "Content-Type: application/json" \\
  -d '{"project":"<project>","kind":"skill","title":"...","body":"...","agent":"<your name>","evidence":"tested"}'
\`\`\`

## Rules

- Write only real output, not test records or process logs (see the full guide for the quality gate).
- Content cannot be edited or deleted once shipped (traceability). To correct, write a new item.
- Search before writing; if similar content exists, write a correction.
- Label evidence honestly: tested / official docs / inferred.
- Full guide: \`${base}/agent-rules?lang=en\`
`
    : `# LBASE — agent 记忆库

本项目连接了一个本地记忆库，地址 \`${base}\`。

## 每次会话开始，先做这件事

在开始任何任务之前，先查一下最近做了什么：

\`\`\`bash
curl "${base}/api/list?limit=20"
\`\`\`

看看最近的条目（特别是 changelog 和 memory），了解之前做到哪一步、有什么坑、用了什么方案。

如果你有上一轮会话的记录，并且其中有尚未写进库的重要结论，现在补写进去。
**如果没有上一轮记录，跳过这一步，不要编造。**

## 干活过程中，按任务边界写

每完成一个任务，就把这次产出写进去。触发点是「任务干完了」，不是「这算不算技能」。

| 产出 | 写进哪个库 | kind |
|---|---|---|
| 可复用的方法 / 步骤 | 技能库 | \`skill\` |
| 事实、结论、背景 | 知识库 | \`wiki\` |
| 任何变更（代码/文档/视频/稿子/方案） | 溯源库 | \`changelog\` |
| 大阶段完成时的复盘总结、或上下文压缩前 | 上下文记忆库 | \`memory\` |

\`\`\`bash
curl.exe -X POST ${base}/api/write \\
  -H "Content-Type: application/json" \\
  -d '{"project":"<项目名>","kind":"skill","title":"...","body":"...","agent":"<你的名字>","evidence":"实测"}'
\`\`\`

## 几条规矩

- 只写真实产出，别写测试记录、过程流水（完整版说明里有「写入门槛」）。
- 写进去的内容不能删、不能改（溯源）。写错了再写一条更正。
- 写之前先搜一下，有重复的就写更正。
- 依据要如实标：实测 / 官方文档 / 推断。
- 完整说明：\`${base}/agent-rules?lang=zh\`
`;

  files.push({
    path: target.file,
    content: rulesBody,
    note: en
      ? `Put this at your project root as ${target.file}`
      : `放到项目根目录，文件名 ${target.file}`,
  });

  // ══════════════════════════════════════════
  // 文件 2：Claude Code 的 hooks（用官方 additionalContext 机制）
  // ══════════════════════════════════════════
  if (target.id === 'claude-code') {
    // 用一个小脚本输出官方要求的 JSON 格式。
    // 不用 echo 直接输出文本，因为 Claude Code 要求 hook 返回
    // {"hookSpecificOutput":{"hookEventName":"...","additionalContext":"..."}}
    const settings = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: `curl -s "${base}/hook/session-start?format=claude"`,
              },
            ],
          },
        ],
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: `curl -s "${base}/hook/stop?format=claude"`,
              },
            ],
          },
        ],
        PreCompact: [
          {
            hooks: [
              {
                type: 'command',
                command: `curl -s "${base}/hook/pre-compact?format=claude"`,
              },
            ],
          },
        ],
      },
    };

    files.push({
      path: target.hooksFile,
      content: JSON.stringify(settings, null, 2),
      note: en
        ? 'Merge these hooks into .claude/settings.json (keep existing hooks). LBASE serves the official additionalContext format.'
        : '把这些 hooks 合并进 .claude/settings.json（保留你已有的 hooks）。LBASE 会返回官方要求的 additionalContext 格式。',
    });
  }

  return { files, target };
}

/**
 * 生成 hook 要求的 JSON 输出
 * 双重兼容：
 * - context 顶层字段：Hermes Agent 等生态原生解析
 * - hookSpecificOutput 顶层字段：Claude Code 官方插件规范
 * 两个同时存在，任何一个 agent 直接 curl 该端点都能识别，不再需要写本地中转脚本
 * @param {'SessionStart'|'Stop'|'PreCompact'} eventName
 * @param {number} port
 * @param {string} lang
 */
export function buildClaudeHookOutput(eventName, port, lang) {
  let text;
  if (eventName === 'SessionStart') text = buildSessionHint(port, lang);
  else if (eventName === 'PreCompact') text = buildCompactReminder(port, lang);
  else text = buildReminder(port, lang);

  return {
    context: text,
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text,
    },
  };
}

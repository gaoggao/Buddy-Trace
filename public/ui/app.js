/**
 * Buddy Trace · 界面
 *
 * 架构：左侧分组菜单 + 顶部页签 + 右侧内容区
 * 视觉与代码全部自研，不复制任何现有项目的界面实现。
 *
 * 国际化说明：
 * - 所有界面文案集中在 I18N 对象里，通过 t() 取值
 * - 目前只提供 zh（中文）实现；en 为预留位，加英文只需补 I18N.en
 * - 布局按中英文都能正常显示设计（避免写死宽度、避免依赖中文断行）
 */

// ── 文案 ──────────────────────────────────────────────────
// 注意：只做中文。英文版留空位，二期补。

const I18N = {
  zh: {
    // 品牌与通用
    brandSub: 'WorkBuddy 记忆的延伸',
    brandSubFull: '给 WorkBuddy 的记忆做备份 —— 换账号、换会话都接得上，还能查回当初为什么这么改。',

    // 菜单分组
    groupWorkbench: '工作台',
    groupAssets: '我的库',
    groupExternal: '外部资源',
    groupSettings: '设置',

    // 菜单项
    navOverview: '概览',
    navSkills: '技能库',
    navWiki: '知识库',
    navChangelog: '溯源库',
    navMemory: '上下文记忆库',
    navAgentMemory: 'WorkBuddy 记忆备份',
    navProjects: '项目管理',
    navExternal: '外部资源',
    navSettings: '设置',
    navHelp: '帮助',

    // 库名称
    kindSkill: '技能库',
    kindWiki: '知识库',
    kindChangelog: '溯源库',
    kindMemory: '上下文记忆库',
    kindAgentMemory: 'WorkBuddy 记忆备份',
    kindExternal: '外部',

    // 库说明
    descSkill: '记录「怎么做」——WorkBuddy 学会的操作步骤、方法、经验，下次能直接复用',
    descWiki: '记录「是什么」——查到的资料、得出的结论、项目背景，随时能查',
    descChangelog: '记录每次改动 —— 为什么改、改成什么、结果怎么样。三个月后想查「当初为什么这么定」，就看这里',
    descMemory: '存放 WorkBuddy 的对话上下文，压缩之前先存这里，以后还能翻到',
    descAgentMemory: 'WorkBuddy 自己那份记忆文件的备份，防止它丢了',

    // 概览页
    overviewTitle: '概览',
    overviewDesc: 'WorkBuddy 在这个库里留下了什么',
    // 隐私说明（老板 2026-11-02 定的规则）
    notLoggedIn: '现在没有登录 WorkBuddy。登录之后，这里会显示你这个账号的记录。',
    privacyNote: '项目记忆 {memory} 条、变更记录 {changelog} 条 —— 这些内容不在这里显示，'
      + '因为一台电脑上可能登录过不同的账号，直接展示会看到别人的东西。'
      + '要看内容，让 WorkBuddy 帮你查。',
    // 隐私：项目记忆/变更记录的正文不展示
    bodyHiddenTitle: '这条内容不在这里展示',
    bodyHiddenDesc: '标题、时间、账号都存下来了，内容本身也存着 —— 但一台电脑上可能登录过不同的账号，'
      + '直接展示会看到别人的东西，所以正文只留给 WorkBuddy 去查。'
      + '你想知道这件事的细节，问 WorkBuddy 就行。',
    // 隐私：点不动的行，点一下要告诉他为什么
    clickHiddenHint: '这条内容不在这里展示。想知道细节，跟 WorkBuddy 说一声就行 —— '
      + '比如「帮我查一下我三个月前做的那个项目」，它会从库里翻出来。',
    // 备份（设置页）
    backupTitle: '备份',
    backupDesc: '把整个库打成压缩包存起来。换电脑、误删了，都能从这里恢复。',
    backupUnavailable: '备份功能暂时不可用（服务端没返回数据）。',
    backupDirLabel: '备份目录',
    backupDirPh: '留空 = 默认目录',
    backupDirSave: '保存',
    backupDirSaved: '备份目录已保存',
    backupDirIsDefault: '现在用的是默认目录（data/backup）。想换到别的盘，改上面的路径就行。',
    backupDirCustom: '已改到自定义目录',
    backupDirResetBtn: '恢复默认',
    backupDirReset: '已恢复默认目录',
    backupWeekly: '每周自动备份一次',
    backupKeepPrefix: '保留',
    backupKeepSuffix: '个月（超期自动删除）',
    backupOptSave: '保存',
    backupOptSaved: '设置已保存',
    backupStatCount: '现有 {n} 个备份，共 {size}',
    backupStatLast: '上次备份：{time}',
    backupStatNever: '还没有备份过',
    backupStatNext: '下次自动备份：{time}',
    backupMoreItems: '…还有 {n} 个更早的',
    backupNow: '立即备份',
    backupRunning: '正在备份…',
    backupDone: '备份完成：{name}（{size}）',
    // 账号清单（概览页，默认合并）
    accountsTitleOverview: '这台电脑上有 {n} 个账号',
    accountsDescOverview: '这些账号的记录都在同一个库里，WorkBuddy 能查到全部 —— 它需要什么就调什么，不用管在哪个账号里。',
    accountsItemCount: '{n} 条',
    accountsLastUsed: '最后使用 {time}',
    accountsNeverUsed: '还没用过',
    accountsSeparatedTag: '已分离',
    accountsHintAdvanced: '如果其中某个账号是别人的（比如同事临时登录过），你不想搞混，可以去「设置 → 高级选项」把它分离出去。',

    // 高级选项（设置页，分离账号）
    advancedTitle: '高级选项 · 账号分离',
    advancedDesc: '默认所有账号的记录是合在一起的 —— WorkBuddy 能查到全部。只有特殊需求才需要分离。',
    advancedStateMerged: '现在 {n} 个账号全部合并：WorkBuddy 能查所有账号的记录。',
    advancedStateSeparated: '现在 {n} 个账号里有 {s} 个被分离了：被分离的账号只查自己的记录。',
    advancedSeparateBtn: '分离',
    advancedUnseparateBtn: '取消分离',
    advancedSeparated: '已把「{name}」分离出去 —— 它的记录现在只归它自己。',
    advancedUnseparated: '已取消分离 —— 这个账号重新跟其他账号合并。',
    advancedWarnTitle: '分离是什么意思',
    advancedWarnBody: '分离之后，这个账号的记录不再跟其他账号混在一起：<br>'
      + '· 用这个账号登录时，WorkBuddy 只查它自己的记录<br>'
      + '· 用别的账号登录时，查不到这个账号的记录<br><br>'
      + '<b>什么时候需要分离：</b>这台电脑上有别人的账号（比如同事临时登录过），你不想让自己的记忆跟他的混在一起。',
    // 账号组（老板 2026-11-02 定）
    groupTitle: '我的账号组',
    groupTitleOverview: '这台电脑上有两个账号',
    groupDesc: '这台电脑上检测到 {n} 个 WorkBuddy 账号。如果都是你自己的，勾上就能互相查。没勾的，两边都看不到对方。',
    groupNeedLogin: '现在没有登录 WorkBuddy。登录之后，这里会列出这台电脑上的账号。',
    groupOnlyOne: '这台电脑上只有一个 WorkBuddy 账号，不需要合并。',
    groupInGroup: '已在一组',
    groupWhatForTitle: '合并之后能做什么',
    // 注意：账号名要用 {a} / {b} 占位符，运行时填真实账号名 —— 不能写死「张三」
    groupWhatForBody: '两个账号会被当成<b>同一个人</b>。<br>'
      + '在 WorkBuddy 里，不管你在哪个号登录，都能调用<b>两个账号里的任意资料、任意记录</b> —— '
      + '比如在「{a}」里就能翻出「{b}」做过的活，反过来也一样。',
    groupWhatForNote: '（界面上看到的仍然是打码的标题；能不能看正文，始终由 WorkBuddy 决定。）',
    groupWarnTitle: '⚠ 合并前请确认：只能勾你自己的账号',
    groupWarnBody: '这个软件默认是<b>按账号隔离</b>的 —— 不同账号的记录互相看不到。<br>'
      + '你现在要主动解除隔离，把这两个账号当成同一个人。<br><br>'
      + '<b>请确认：这些账号都是你自己注册的。</b><br>'
      + '如果这台电脑上还有别人登录过，勾上就等于把别人的记录算到自己头上 —— '
      + '<b>由此产生的一切后果，由操作者本人承担。</b>',
    groupConfirmText: '我确认：这些账号都是我自己的。如果有别人的，我承担后果。',
    groupMergeBtn: '并成一组',
    groupSplitBtn: '拆开这一组',
    groupExisting: '现在已合并的组：',
    groupMerged: '已合并 {n} 个账号 —— 现在在哪个号登录，都能查另一个号做过的事。',
    groupSplit: '已拆开 —— 两个账号恢复互不可见，原来存的内容一条都没删。',

    // 找不到 WorkBuddy 目录（老板 2026-11-03 要求）
    wbHomeNotFoundTitle: '没找到 WorkBuddy 的数据目录',
    wbHomeNotFoundDesc: '这个软件要从 WorkBuddy 的数据目录里读记录。没找到它，说明 WorkBuddy 可能还没在这台电脑上登录过，或者你把数据目录改到了别的地方。',
    wbHomeTriedTitle: '我找过这些位置：',
    wbHomePlaceholder: '例如：D:\\MyData\\.workbuddy',
    wbHomeHowToFind: '怎么找？打开 WorkBuddy，随便发一句话，然后看它有没有在运行。'
      + '如果它正常跑着，数据目录通常在 C:\\Users\\<你的用户名>\\.workbuddy。'
      + '如果你把它改到别的盘了，就到那个盘下找名为 .workbuddy 的文件夹（以点开头的隐藏文件夹）。',
    wbHomeSaveBtn: '用这个目录',
    wbHomeNeedPath: '请先填写目录路径',
    wbHomeChecking: '检查中…',
    wbHomeSaved: '已保存，正在按新目录重新读取…',

    statTotal: '内容总数',
    statProjects: '项目数',
    statAgents: '谁写的',
    recentTitle: '最近写入',
    recentEmpty: '还没有内容',
    recentEmptyHint: '',

    // 首次使用引导（避免出现"项目/API/写库/agent"这类词）
    frDoneTitle: '已经发给 WorkBuddy 了？',
    frDoneText: '那就不用管了，等它干活就行。WorkBuddy 每完成一件事，会自动把过程记到这里。回来刷新一下就能看到。',
    frNotYetTitle: '还没发，或者等了一会儿什么都没有？',
    frNotYetText: '复制下面那段话，发给你的 WorkBuddy。路径：「设置」→「WorkBuddy 接入」→ 复制。',
    frGoCopy: '去复制那段话 →',
    frSeeTitle: '你会看到什么',
    frSee1: 'WorkBuddy 做的每件事，会变成一条记录',
    frSee2: '每条记着「哪天、哪个账号做的」',
    frSee3: '时间久了，这里就是这件事的完整履历',
    searchPlaceholder: '搜索技能、知识、变更、记忆…',
    searchFound: '找到 {n} 条',
    searchNone: '没找到相关内容',
    searchNoneHint: '换个说法试试',

    // 库页面
    libEmpty: '这里还没有内容',
    libEmptyHint: '这个库还是空的。WorkBuddy 做完相关的事，会把内容自动写进来。',

    // 列表表头
    colKind: '类型',
    colTitle: '标题',
    colAgent: '账号',
    colProject: '项目',
    colTime: '时间',
    colMatch: '匹配',

    // agent 接入提醒
    installNeedTitle: '还有 {n} 个账号没接进来',
    installNeedDesc: '这些账号的 WorkBuddy 还不知道有这个记忆库 —— 换到它们时，它会想不起来你之前做过什么。',
    installHowTo: '在 WorkBuddy 里【新开一个会话】，切到上面「还没接入」的那个账号，把下面这段话发给它：',
    installGroupDone: '已接入的账号：',
    installGroupTodo: '还没接入的账号：',
    installAllOk: '✅ {n} 个账号都已接进记忆库 —— 换账号、开新会话，它都会自动来查。',

    // 库页面的项目筛选（下拉框，不是一排按钮）
    filterLabel: '看哪个项目：',
    filterAllProjects: '全部项目（{n} 个）',

    // 按钮
    btnWrite: '写入内容',
    btnNewProject: '新建项目',
    btnCancel: '取消',
    btnCreate: '创建',
    btnSave: '保存',
    btnDelete: '删除',
    btnCopy: '复制',
    btnCopied: '已复制',
    btnBack: '返回',
    btnConfirm: '知道了',

    // 写入对话框
    writeTitle: '写入内容',
    writeKind: '存到哪个库',
    writeProject: '存到哪个项目',
    writeItemTitle: '标题',
    writeItemTitlePh: '一句话说清这是什么',
    writeBody: '正文（Markdown）',
    writeBodyPh: '详细内容…',
    writeAgent: '哪个账号写的',
    writeAgentPh: '例如：你的账号昵称',
    writeEvidence: '证据等级',
    evidenceNone: '不标注',
    evidenceTested: '实测',
    evidenceDoc: '官方文档',
    evidenceInfer: '推断',
    writeNeedProject: '先建一个项目',

    // 新建项目
    newProjectTitle: '新建项目',
    newProjectName: '项目名',
    newProjectPh: '例如：我的项目',
    newProjectHint: '一个项目一个库。不同账号做同一个项目，内容归到一起。',

    // 详情
    detailAgent: '账号',
    detailEvidence: '依据',
    detailCreated: '创建于',
    detailExternalHint: '这是从外部抓取的资源，不是你自己产生的',
    detailSourceUrl: '原始地址',

    // 项目管理
    projectsTitle: '项目管理',
    projectsDesc: '一个项目一个库。不同账号做同一个项目，内容归到一起。',
    btnMerge: '合并',
    mergeTitle: '合并项目',
    mergeDesc: '把「{name}」的内容并到另一个项目下。内容本身不动，只换归属标签。',
    mergeTarget: '合并到哪个项目',
    mergeWarningTitle: '合并后无法拆分',
    mergeWarningBody: '合并只是把标签换掉，原始归属信息会丢失，所以之后无法反向拆开。如果只是想让列表整洁一点，建议先别合并。',
    mergeConfirmLabel: '我确认：合并后无法拆分',
    mergeNeedConfirm: '请先勾选确认',
    mergeNeedTwo: '至少要有两个项目才能合并',
    mergeDoing: '合并中…',
    mergeOk: '确认合并',
    mergeDone: '已合并 {n} 条内容',
    projectsEmpty: '还没有项目',
    projectsEmptyHint: '项目会由 WorkBuddy 写内容时自动建好，你不用管。想自己建也可以点右上角。',
    projectItems: '{n} 条',

    // 外部资源
    externalTitle: '外部资源',
    externalDesc: '看到好东西就存进来，像书签一样。不绑定项目——以后 WorkBuddy 需要找功能时，会从这里搜到。',
    externalAddHint: '存的是入口和 README。以后用到时，WorkBuddy 会去拉最新的给你看。',
    externalAdd: '添加链接',
    externalEmpty: '还没有外部资源',
    externalEmptyHint: '粘贴一个 GitHub 链接试试',
    externalUrl: '链接',
    externalUrlPh: 'https://github.com/owner/repo',
    externalFetch: '抓取',
    externalFetched: '已抓取 README',
    externalFetchFail: '抓取失败，你可以手动填写标题和说明',
    externalDescLabel: '说明',
    externalDescPh: '一句话说明',
    externalDeleteHint: '外部资源可以删除（不涉及溯源）',
    externalDeleteConfirm: '确认删除这条外部资源？',

    // 设置
    settingsTitle: '设置',
    settingsDiscipline: 'WorkBuddy 接入纪律',
    settingsDisciplineDesc: '告诉 WorkBuddy 该怎么往库里写。全部可选，随时能改。',
    settingsGuide: '接入指令',
    settingsGuideDesc: '把下面这段话发给你的 WorkBuddy，它就知道怎么用这个库了。',
    disciplineLibs: '各个库',
    disciplineOthers: '其他',
    disciplineCustom: '自定义',
    disciplineCustomPh: '加一条你自己要求的纪律…',
    disciplineAdd: '添加',
    disciplineSave: '保存并重新生成',
    disciplineSaved: '已保存，接入指令已更新',

    dSkill: '产生的技能要写进技能库',
    dWiki: '学到的知识要写进知识库',
    dChangelog: '有改动要写进溯源库',
    dMemory: '对话上下文要写进上下文记忆库',
    dProject: '内容要归到对应项目',
    dAttribution: '标明是哪个 WorkBuddy 账号、什么时间写的',
    dDedup: '写入前检查是否重复',
    dRejected: '记录试过但不行的方案',
    dCleanup: '定期整理过期内容',

    // 向导
    obWelcome: '这是你的 Buddy Trace',
    obPoint1: '项目自动归档',
    obPoint1Desc: 'WorkBuddy 写内容时自己判断属于哪个项目，不用你操心',
    obPoint2: '写进去就不能改',
    obPoint2Desc: '为了溯源——三个月后还能查到当时为什么这么定',
    obPoint3: '随时能搜到',
    obPoint3Desc: '按匹配度排序，中英文都能搜',
    obCreateProject: '先建一个项目',
    obCreateProjectDesc: '你所有记录都归在项目下。随便起个名，以后能加新的。',
    obCreateNext: '创建并继续',
    obLater: '稍后再说',
    obDiscipline: '让 WorkBuddy 知道去哪查',
    obDisciplineDesc: '把这句话装进 WorkBuddy，它每次会话都会看到 —— 到那天，它自己就知道来查了。',
    obCta1: '把下面这句话粘给 WorkBuddy 的聊天框，它就知道去哪查你的历史记忆了。',
    obCtaNote: '不用懂任何技术细节 —— 它会自己读说明、自己去查。',
    obSkip: '跳过',
    obNext: '下一步',
    obDone: '完成',
    obReady: '可以开始了，写第一条内容吧',

    // 提示与错误
    errRequired: '请填写必填项',
    errGeneric: '出错了',
    errDup: '发现相似内容',
    errDupHint: '下面这些看起来很像，确认不是重复再写入：',
    errDupConfirm: '确认不是重复',
    okWritten: '已写入',
    okCreated: '项目已创建',
    okDeleted: '已删除',
    okAdded: '已添加',
    copyFail: '复制失败，请手动选中复制',
  },

  // 英文预留位：二期补全。所有 key 与 zh 一一对应。
  // 补完后把底部 LANG 改成 'en' 即可切换。
  en: null,
};

// 当前界面语言。一期只做中文（en 的文案待补），
// 但代码按双语设计：补完 I18N.en 后把这里改成读取用户选择即可。
let LANG = 'zh';

/** 后端接口需要的语言参数 */
function apiLang() {
  return LANG === 'en' ? 'en' : 'zh';
}

function t(key, vars) {
  const dict = I18N[LANG] || I18N.zh;
  let s = dict[key];
  if (s === undefined) s = I18N.zh[key] !== undefined ? I18N.zh[key] : key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      // 用 split/join 而不是 replace —— replace 只换第一个，占位符出现两次会漏
      s = s.split('{' + k + '}').join(vars[k]);
    }
  }
  return s;
}

// ── 菜单结构 ──────────────────────────────────────────────
// 架构参考通用后台做法（左侧分组菜单），菜单项按本项目的库设计

const MENU = [
  {
    group: 'groupWorkbench',
    items: [{ id: 'overview', hash: '#/', labelKey: 'navOverview', icon: 'dashboard' }],
  },
  {
    group: 'groupAssets',
    items: [
      { id: 'skills', hash: '#/lib/skill', labelKey: 'navSkills', icon: 'tools', kind: 'skill' },
      { id: 'wiki', hash: '#/lib/wiki', labelKey: 'navWiki', icon: 'book', kind: 'wiki' },
      { id: 'changelog', hash: '#/lib/changelog', labelKey: 'navChangelog', icon: 'code', kind: 'changelog' },
      { id: 'memory', hash: '#/lib/memory', labelKey: 'navMemory', icon: 'chat', kind: 'memory' },
      { id: 'agent-memory', hash: '#/lib/agent-memory', labelKey: 'navAgentMemory', icon: 'shield', kind: 'agent-memory' },
    ],
  },
  {
    group: 'groupExternal',
    items: [{ id: 'external', hash: '#/external', labelKey: 'navExternal', icon: 'link' }],
  },
  {
    group: 'groupSettings',
    items: [
      { id: 'settings', hash: '#/settings', labelKey: 'navSettings', icon: 'gear' },
      { id: 'help', hash: '#/help', labelKey: 'navHelp', icon: 'book' },
    ],
  },
];

/** 图标（自绘 SVG，16px） */
const ICONS = {
  dashboard:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
  tools:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5a3 3 0 0 0-3.9 3.9L2 11v3h3l4.6-4.6a3 3 0 0 0 3.9-3.9l-2 2-1.4-1.4 1.4-1.6z"/></svg>',
  book:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2H7v12H3.5A1.5 1.5 0 0 1 2 12.5v-9z"/><path d="M14 3.5A1.5 1.5 0 0 0 12.5 2H9v12h3.5a1.5 1.5 0 0 0 1.5-1.5v-9z"/></svg>',
  code:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 4.5L2 8l3.5 3.5"/><path d="M10.5 4.5L14 8l-3.5 3.5"/></svg>',
  chat:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8.5A5.5 5.5 0 0 1 8.5 14H3l1.8-1.8A5.5 5.5 0 1 1 14 8.5z"/></svg>',
  folder:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.8l1.2 1.5h5A1.5 1.5 0 0 1 14 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4.5z"/></svg>',
  link:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5l3-3"/><path d="M8.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1"/><path d="M7.5 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1"/></svg>',
  gear:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4"/></svg>',
  shield:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l5 1.8v4.2c0 3-2.1 5.4-5 6.4-2.9-1-5-3.4-5-6.4V3.6l5-1.8z"/></svg>',
  search:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
};

// ── 隐私规则（老板 2026-11-02 定）────────────────────────
//
// 「库无法区分用户登录，那就把内容加密不允许用户看，只允许 agent 调用。」
// 「不要把整库内容隐藏，显示标题是没问题的，但是让用户点开看不到具体内容。」
//
// 所以：
//   · 所有库都显示【标题、时间、账号】—— 让人知道存了什么
//   · 技能库 / 知识库 / WorkBuddy 记忆备份 → 能点开看正文
//   · 上下文记忆库 / 溯源库           → 点开只看到"内容不在这里展示"

/** 哪些库能看正文（与服务端 wb-privacy.js 的 VISIBLE_KINDS 保持一致） */
const VIEWABLE_KINDS = [
  'skill', 'wiki', 'agent-memory',
  // 外部资源：用户在界面上自己粘贴链接抓进来的，是他自己找的东西，必须给他看
  'external-candidate', 'external-wiki', 'external-skill',
];

/** 「会话实录」例外 —— 它是提炼过的摘要，不是原始对话，给用户看 */
const VIEWABLE_PROJECTS = ['WorkBuddy 会话实录'];

function canViewKind(kind, project) {
  if (project && VIEWABLE_PROJECTS.indexOf(project) !== -1) return true;
  return VIEWABLE_KINDS.indexOf(kind) !== -1;
}

// ── API ───────────────────────────────────────────────────

const API = {
  // 当前登录的 WorkBuddy 账号 uid（界面所有请求都自动带上）
  //
  // 为什么（老板 2026-11-02 定的隐私规则）：
  //   「库无法区分用户登录，那就把内容加密不允许用户看，只允许 agent 调用。
  //     agent 有 UID，用 UID 区分。」
  //   → 服务端按 uid 过滤；界面必须告诉服务端"我是哪个账号"
  //   → 没带 uid 的请求，服务端只给全局内容（技能），拿不到任何人的隐私记录
  _uid: '',

  /** 拿到当前登录账号（启动时调一次） */
  async initUid() {
    try {
      const r = await fetch('/api/whoami');
      const d = await r.json();
      API._uid = d.uid || '';
      API._who = d;
      return d;
    } catch (e) {
      API._uid = '';
      return { ok: false, loggedIn: false, uid: '', name: '' };
    }
  },

  /** 给路径补上 uid 参数 */
  _withUid(path) {
    if (!API._uid) return path;
    const sep = path.includes('?') ? '&' : '?';
    return path + sep + 'uid=' + encodeURIComponent(API._uid);
  },

  async get(path) {
    const r = await fetch(API._withUid(path));
    return r.json();
  },
  async post(path, body) {
    const payload = Object.assign({}, body || {}, API._uid ? { uid: API._uid } : {});
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: r.status, ...(await r.json()) };
  },
  async del(path) {
    const r = await fetch(API._withUid(path), { method: 'DELETE' });
    return { status: r.status, ...(await r.json()) };
  },
};

// ── 状态 ──────────────────────────────────────────────────

const state = {
  projects: [],
  stats: null,
  tabs: [],           // [{ hash, label }]
  activeHash: '',
  itemKind: null,     // 当前详情页属于哪个库（用于菜单高亮）
  remote: null,       // 远程下发配置（云端 Gitee/GitHub，含二维码等）
};

// ── 工具 ──────────────────────────────────────────────────

function el(tag, attrs) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style') node.setAttribute('style', v);
      else node.setAttribute(k, v);
    }
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) {
      for (const x of c) if (x) node.append(x.nodeType ? x : document.createTextNode(String(x)));
    } else {
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  return node;
}

function toast(msg, type) {
  const wrap = document.getElementById('toastWrap');
  const node = el('div', { class: 'toast ' + (type || '') }, msg);
  wrap.append(node);
  setTimeout(function () {
    node.style.transition = 'opacity .2s ease-out';
    node.style.opacity = '0';
    setTimeout(function () { node.remove(); }, 200);
  }, 2800);
}


/**
 * 把内部的「依据」字段翻译成使用者能看懂的话
 *
 * 为什么：evidence 里存的是 `原始文件` / `实测` / `目录信息` 这类内部术语，
 * 使用者看不懂。界面上要换成他读得懂的表述。
 */
function evidenceLabel(v) {
  const map = {
    '原始文件': 'WorkBuddy 的原始记录',
    '实测': '当时实测过',
    '目录信息': '只有登记信息，内容在手机上',
    '官方文档': '官方文档',
    '推断': '推测',
  };
  return map[v] || v;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 列表用的短日期：只有月-日（完整时间放 title 里，悬停可见） */
function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = function (n) { return String(n).padStart(2, '0'); };
  return p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** 字节数 → 人能读的大小（1.5 MB / 512 KB / 3.2 GB） */
function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

/** 某个 kind 的详情页应该返回到哪个列表 */
function backHashForKind(kind) {
  if (!kind) return '#/';
  if (kind.indexOf('external') === 0) return '#/external';
  return '#/lib/' + kind;
}

function kindLabel(kind) {
  if (kind.indexOf('external') === 0) return t('kindExternal');
  const m = { skill: 'kindSkill', wiki: 'kindWiki', changelog: 'kindChangelog', memory: 'kindMemory', 'agent-memory': 'kindAgentMemory' };
  return t(m[kind] || kind);
}

function kindClass(kind) {
  return kind.indexOf('external') === 0 ? 'external' : kind;
}

/** 极简 markdown 渲染 */
function renderMarkdown(md) {
  if (!md) return '';
  let s = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  const esc = function (x) {
    return x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const blocks = [];
  s = s.replace(/```([\s\S]*?)```/g, function (_, code) {
    blocks.push('<pre><code>' + esc(code.trim()) + '</code></pre>');
    return '\u0000B' + (blocks.length - 1) + '\u0000';
  });

  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  s = s.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  s = s.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/^---+$/gm, '<hr>');
  s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  s = s.replace(/((?:^\|.*\|\s*$\n?)+)/gm, function (block) {
    const rows = block.trim().split('\n').map(function (r) { return r.trim(); });
    if (rows.length < 2) return block;
    const cells = function (r) {
      return r.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
    };
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    let out = '<table><thead><tr>' + head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (const row of body) {
      out += '<tr>' + row.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }
    return out + '</tbody></table>';
  });

  s = s.replace(/(?:^- .+$\n?)+/gm, function (block) {
    const items = block.trim().split('\n').map(function (l) { return l.replace(/^- /, ''); });
    return '<ul>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>';
  });
  s = s.replace(/(?:^\d+\. .+$\n?)+/gm, function (block) {
    const items = block.trim().split('\n').map(function (l) { return l.replace(/^\d+\. /, ''); });
    return '<ol>' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ol>';
  });

  s = s.split(/\n{2,}/).map(function (chunk) {
    const c = chunk.trim();
    if (!c) return '';
    if (/^<(h\d|ul|ol|pre|table|blockquote|hr)/.test(c)) return c;
    if (/^\u0000B\d+\u0000$/.test(c)) return c;
    return '<p>' + c.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  s = s.replace(/\u0000B(\d+)\u0000/g, function (_, i) { return blocks[Number(i)]; });
  return s;
}

// ── 对话框 ────────────────────────────────────────────────

function openModal(content, wide, compact) {
  const mask = document.getElementById('modalMask');
  const modal = document.getElementById('modal');
  modal.className = 'modal' + (wide ? ' wide' : '') + (compact ? ' compact' : '');
  modal.innerHTML = '';
  modal.append(content);
  mask.hidden = false;

  const onKey = function (e) { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  mask._onKey = onKey;
  mask.onclick = function (e) { if (e.target === mask) closeModal(); };
}

function closeModal() {
  const mask = document.getElementById('modalMask');
  mask.hidden = true;
  if (mask._onKey) document.removeEventListener('keydown', mask._onKey);
}

function cmdBox(text) {
  const box = el('div', { class: 'cmd-box' }, text);
  const btn = el('button', { class: 'copy-btn' }, t('btnCopy'));
  btn.onclick = async function () {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = t('btnCopied');
      setTimeout(function () { btn.textContent = t('btnCopy'); }, 1600);
    } catch (e) {
      toast(t('copyFail'), 'error');
    }
  };
  box.append(btn);
  return box;
}

// ── 左侧菜单渲染 ──────────────────────────────────────────

function renderSider() {
  const sider = document.getElementById('sider');
  sider.innerHTML = '';
  const active = currentPageId();

  for (const g of MENU) {
    const group = el('div', { class: 'menu-group' });
    group.append(el('div', { class: 'menu-group-title' }, t(g.group)));
    for (const item of g.items) {
      const a = el('a', {
        class: 'menu-item' + (active === item.id ? ' active' : ''),
        href: item.hash,
      });
      a.innerHTML = '<span class="ico">' + (ICONS[item.icon] || '') + '</span>' +
        '<span class="label">' + t(item.labelKey) + '</span>';
      // 数量 —— 用 counts（含隐私库），不是 stats.byKind（那个是过滤后的）
      //
      // 老板要求：菜单栏也要显示条数，不然用户不知道这个库存了多少东西。
      if (item.kind && state.counts) {
        const n = state.counts[item.kind];
        if (n !== undefined && n !== null) {
          a.append(el('span', { class: 'count' }, String(n)));
        }
      }
      group.append(a);
    }
    sider.append(group);
  }

  // ── 加入交流群入口（远程下发配置，点击弹窗显示二维码大图）──
  const grp = state.remote && state.remote.qr;
  if (grp && grp.enabled && grp.image) {
    const box = el('div', { style: 'padding:10px 16px 0;text-align:center' });
    const btn = el('button', {
      class: 'btn',
      style: 'width:100%;padding:7px 0;font-size:12px',
      onclick: function () {
        const qr = el('img', {
          src: '/api/remote-image?file=' + encodeURIComponent(grp.image),
          alt: grp.title || '二维码',
          style: 'max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:8px',
        });
        openModal(el('div', { style: 'text-align:center' },
          el('div', { style: 'margin-bottom:12px;font-size:15px;font-weight:600' }, grp.title || '加入交流群'),
          qr,
          el('div', { style: 'margin-top:10px;font-size:12px;color:var(--text-mute)' }, '用微信扫一扫，进群交流'),
        ), false, true);
      },
    }, grp.title || '加入交流群');
    box.append(btn);
    sider.append(box);
  }

  // ── 底部版权 ──
  //
  // 老板要求（2026-11-05）：
  //   「左边的菜单栏底部加入一个版权所有的提示。LBASE 版权所有。」
  const footer = el('div', {
    style: 'margin-top:auto;padding:14px 12px 16px;border-top:1px solid var(--line-soft);' +
      'font-size:11px;color:var(--text-mute);line-height:1.6;text-align:center',
  });
  footer.append(el('div', {}, 'LBASE 版权所有'));
  footer.append(el('div', {
    style: 'margin-top:3px;font-size:10.5px;opacity:0.75',
  }, '© 2026 Buddy Trace'));
  footer.append(el('div', {
    style: 'margin-top:6px;font-size:10px;opacity:0.6',
  }, '仅供个人学习使用 · 免责见设置页'));
  sider.append(footer);
}

function currentPageId() {
  const h = location.hash || '#/';
  if (h === '#/' || h === '' || h === '#') return 'overview';
  if (h.indexOf('#/lib/skill') === 0) return 'skills';
  if (h.indexOf('#/lib/wiki') === 0) return 'wiki';
  if (h.indexOf('#/lib/changelog') === 0) return 'changelog';
  if (h.indexOf('#/lib/agent-memory') === 0) return 'agent-memory';
  if (h.indexOf('#/lib/memory') === 0) return 'memory';
  if (h.indexOf('#/external') === 0) return 'external';
  if (h.indexOf('#/item/') === 0) {
    // 详情页：高亮它所属的库，而不是项目管理
    const k = state.itemKind;
    if (k === 'skill') return 'skills';
    if (k === 'wiki') return 'wiki';
    if (k === 'changelog') return 'changelog';
    if (k === 'memory') return 'memory';
    if (k === 'agent-memory') return 'agent-memory';
    if (k && k.indexOf('external') === 0) return 'external';
    return 'projects';
  }
  if (h.indexOf('#/settings') === 0) return 'settings';
  if (h.indexOf('#/help') === 0) return 'help';
  return 'overview';
}

// ── 顶部页签 ──────────────────────────────────────────────

function renderTabs() {
  const bar = document.getElementById('tabbar');
  bar.innerHTML = '';
  if (!state.tabs.length) return;
  for (const tab of state.tabs) {
    const isActive = tab.hash === state.activeHash;
    const node = el('a', {
      class: 'tab' + (isActive ? ' active' : ''),
      href: tab.hash,
    }, tab.label);
    if (state.tabs.length > 1) {
      const close = el('button', { class: 'close', title: '关闭' }, '×');
      close.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        state.tabs = state.tabs.filter(function (x) { return x.hash !== tab.hash; });
        if (isActive) {
          const last = state.tabs[state.tabs.length - 1];
          location.hash = last ? last.hash : '#/';
        } else {
          renderTabs();
        }
      };
      node.append(close);
    }
    bar.append(node);
  }
}

function addTab(hash, label) {
  state.activeHash = hash;
  const exist = state.tabs.find(function (x) { return x.hash === hash; });
  if (!exist) state.tabs.push({ hash: hash, label: label });
  renderTabs();
}

// ── 页面：概览 ────────────────────────────────────────────

/**
 * 概览页顶部的品牌展示区
 *
 * 老板要求（2026-11-04）：
 *   「上面如果太空的话，就写一些我们的理念或者是宣传词什么之类的」
 *
 * 内容：
 *   ① 横版图（图形 + 溯源 · Buddy Trace + 副标题）
 *   ② 一句话理念
 *   ③ 四个功能点
 *
 * 为什么不放顶栏：
 *   横版图是 4.8:1 的长条，放顶栏会缩得很小、字看不清。
 *   顶栏只放 26px 小图标 + 文字，横版图放这里。
 */
function buildHero() {
  const points = [
    { k: '跨账号接续', v: '换账号登录，照样接着上次干' },
    { k: '全量留档', v: '对话、推理、搜索、命令，一字不落' },
    { k: '溯源可查', v: '几个月前改过什么、为什么改' },
    { k: '后台自动', v: '每 30 分钟自动收，不用你管' },
  ];

  const box = el('div', { class: 'hero' });

  box.append(el('img', {
    class: 'hero-lockup',
    src: '/img/logo-horizontal.png',
    alt: '溯源 · Buddy Trace',
  }));

  box.append(el('div', { class: 'hero-line' }, 'WorkBuddy 记忆的延伸'));

  // ── 适用范围声明（老板 2026-11-05 要求）──
  //
  // 老板原话：
  //   「我们这个系统仅仅适应于 workbuddy，不适用于其他的 agent。
  //     你不写，他们不知道。」
  box.append(el('div', {
    style: 'display:inline-block;margin-bottom:10px;padding:5px 11px;' +
      'background:rgba(199,123,31,0.09);border:1px solid rgba(199,123,31,0.32);' +
      'border-radius:5px;font-size:11.5px;font-weight:600;color:#a8620f;line-height:1.5',
  }, '⚠ 本系统仅适用于 WorkBuddy，不适用于其他 AI 工具或 Agent'));
  box.append(el('div', { class: 'hero-sub' },
    'WorkBuddy 干过的活，它自己不一定会记。换账号、开新会话、上下文被压缩过，'
    + '之前做过什么就想不起来了。这个库替它存一份 —— 需要的时候，它自己会来查。'));

  const pts = el('div', { class: 'hero-points' });
  for (const p of points) {
    pts.append(el('div', { class: 'hero-point' },
      el('div', { class: 'hero-point-k' }, p.k),
      el('div', { class: 'hero-point-v' }, p.v),
    ));
  }
  box.append(pts);

  return box;
}

async function renderOverview(main) {
  main.innerHTML = '';

  // ── 顶部 banner：品牌展示 + 理念 + 四个功能点 ──
  //
  // 老板要求（2026-11-04）：
  //   「上面如果太空的话，就写一些我们的理念或者是宣传词什么之类的」
  main.append(buildHero());

  // 搜索
  const input = el('input', { type: 'text', placeholder: t('searchPlaceholder') });
  const results = el('div');
  main.append(
    el('div', { class: 'page-head' },
      el('h1', {}, t('overviewTitle')),
      el('div', { class: 'desc' }, t('overviewDesc')),
    ),
    el('div', { class: 'searchbar' },
      el('span', { class: 'ico', html: ICONS.search }),
      input,
    ),
    results,
  );

  const body = el('div');
  main.append(body);

  let timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) {
      results.innerHTML = '';
      body.hidden = false;
      return;
    }
    body.hidden = true;
    timer = setTimeout(async function () {
      const r = await API.post('/api/search', { q: q, limit: 30 });
      results.innerHTML = '';
      if (!r.ok || r.total === 0) {
        results.append(emptyBlock(t('searchNone'), t('searchNoneHint')));
        return;
      }
      results.append(
        el('div', { class: 'page-head' }, el('div', { class: 'desc' }, t('searchFound', { n: r.total }))),
        itemList(r.items, true),
      );
    }, 220);
  });

  // 统计
  //
  // 隐私规则（老板 2026-11-02）：
  //   隐私库（项目记忆 / 变更记录）只显示【条数】，不显示内容。
  //   技能、知识库、WorkBuddy 记忆备份可以看内容。
  const stats = await API.get('/api/health');
  const list = await API.get('/api/list?limit=200');
  const counts = (stats.ok && stats.counts) || {};

  const byKind = {};
  if (stats.ok && stats.stats.byKind) {
    for (const b of stats.stats.byKind) byKind[b.kind] = b.c;
  }

  // 没登录 WorkBuddy 时，什么都看不到 —— 要明确告诉用户
  if (!API._uid) {
    body.append(el('div', {
      style: 'margin-top:20px;padding:14px 16px;background:rgba(199,123,31,0.09);' +
        'border:1px solid rgba(199,123,31,0.35);border-radius:8px;font-size:13px;' +
        'color:var(--text);line-height:1.7',
    }, t('notLoggedIn')));
  }

  body.append(statRow([
    { label: t('statTotal'), value: stats.ok ? stats.stats.total : 0 },
    { label: t('statProjects'), value: stats.ok ? stats.stats.projects : 0 },
    { label: t('kindSkill'), value: counts.skill || 0 },
    { label: t('kindWiki'), value: counts.wiki || 0 },
    { label: t('kindMemory'), value: counts.memory || 0 },
    { label: t('kindChangelog'), value: counts.changelog || 0 },
  ]));

  // 说明哪些库只给条数（免得用户以为"内容丢了"）
  if (counts.memory || counts.changelog) {
    body.append(el('div', {
      style: 'margin-top:14px;font-size:12.5px;color:var(--text-mute);line-height:1.7',
    }, t('privacyNote', { memory: counts.memory || 0, changelog: counts.changelog || 0 })));
  }

  // ── 没找到 WorkBuddy 数据目录：提示用户手动指定 ──
  //
  // 老板明确（2026-11-03）：「如果是扫不到，就提醒用户，让用户手动指定目录。」
  const wh = await API.get('/api/wb-home').catch(function () { return null; });
  if (wh && wh.ok && !wh.found) {
    body.append(await buildWbHomeNotice(wh));
  }

  // ── 账号清单（默认合并，只展示信息）──
  //
  // 老板定（2026-11-03）：
  //   「我们只是标识有不同的账号。这样的话可以让用户看到有多个账号。
  //     其中一个账号是他同事的，他不想搞混了，那他手动分离。」
  //
  // 所以概览页只【展示】有几个账号，不做合并操作（默认就是合并的）。
  // 分离藏在设置页的「高级选项」里。
  const grp = await API.get('/api/account-groups').catch(function () { return null; });
  if (grp && grp.ok && (grp.accounts || []).length > 1) {
    body.append(buildAccountsInfo(grp));
  }

  // ── 提醒：agent 还没接进来（或接进来后被清掉了）──
  // 我们【不写 WorkBuddy 的文件】（法律风险），改成让 agent 自己写。
  // 所以这里只负责「检测 + 提醒用户再发一次」，不替它写。
  const inst = await API.get('/api/install-status').catch(function () { return null; });
  if (inst && inst.ok && inst.needAttention) {
    body.append(installNotice(inst));
  }
  if (inst && inst.ok && inst.total > 0 && !inst.needAttention) {
    body.append(el('div', {
      style: 'margin-top:20px;padding:9px 13px;background:rgba(8,200,160,0.07);' +
        'border:1px solid rgba(8,200,160,0.28);border-radius:6px;font-size:12.5px;color:var(--text-dim)',
    }, t('installAllOk', { n: inst.total })));
  }

  if (list.ok && list.items.length > 0) {
    body.append(
      el('div', { style: 'margin-top:32px' },
        el('div', { class: 'page-head' }, el('h1', { style: 'font-size:15px' }, t('recentTitle'))),
        itemList(list.items, false),
      ),
    );
  } else {
    body.append(firstRunGuide());
  }
}

function statRow(items) {
  const row = el('div', {
    style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px',
  });
  for (const it of items) {
    row.append(el('div', {
      style: 'background:var(--bg-card);border:1px solid var(--line-soft);border-radius:10px;padding:14px 16px',
    },
      el('div', { style: 'font-size:22px;font-weight:650;line-height:1.2;font-variant-numeric:tabular-nums' }, String(it.value)),
      el('div', { style: 'font-size:12px;color:var(--text-mute);margin-top:4px' }, it.label),
    ));
  }
  return row;
}

/**
 * 界面提醒：还有账号没把 agent 接进来
 *
 * 设计依据（用户明确）：
 *   「如果检测到 memory 里边没有我们的内容了，然后在我们的界面上提醒用户
 *     需要再给你的 workbuddy 发这一条引导语」
 *
 * 我们不替它写（法律风险），只提醒 + 给一句话让用户去发。
 */
function installNotice(inst) {
  const box = el('div', {
    style: 'margin-top:20px;padding:14px 16px;background:rgba(199,123,31,0.09);' +
      'border:1px solid rgba(199,123,31,0.35);border-radius:8px',
  });

  box.append(
    el('div', { style: 'font-size:14px;font-weight:650;margin-bottom:6px' },
      t('installNeedTitle', { n: inst.missing.length })),
    el('p', { style: 'font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:10px' },
      t('installNeedDesc')),
  );

  // 账号进度：明确写「已接入 / 未接入」，不用勾和点让用户猜
  // （用户明确：光一个勾一个点，用户得动脑筋才知道什么意思）
  const prog = el('div', { style: 'margin-bottom:12px' });

  if (inst.installed.length) {
    prog.append(el('div', {
      style: 'font-size:12.5px;color:var(--text-mute);margin-bottom:3px',
    }, t('installGroupDone')));
    for (const x of inst.installed) {
      prog.append(el('div', {
        style: 'font-size:12.5px;color:var(--accent-deep);padding:1px 0 1px 10px',
      }, x.name));
    }
  }

  if (inst.missing.length) {
    prog.append(el('div', {
      style: 'font-size:12.5px;color:var(--text-mute);margin:6px 0 3px',
    }, t('installGroupTodo')));
    for (const x of inst.missing) {
      prog.append(el('div', {
        style: 'font-size:12.5px;color:var(--text);padding:1px 0 1px 10px;font-weight:600',
      }, x.name));
    }
  }
  box.append(prog);

  // 一句话说清怎么做（写多了用户觉得复杂）
  box.append(el('div', {
    style: 'font-size:13px;color:var(--text);line-height:1.6;margin-bottom:8px',
  }, t('installHowTo')));

  box.append(cmdBox(inst.sentence));

  return box;
}

/**
 * 列表行（主显示方式）
 *
 * 设计依据（用户明确）：
 * - 界面是给「确定感」用的，不是给用户溯源查资料的（溯源交给 agent）
 * - 数据只会越积越多 → 卡片一屏显示太少，必须用紧凑列表
 * - 摘要不显示：用户不看，占地方
 * - 列顺序按「对小白有用」排：类型 → 标题 → 谁写的 → 哪个项目 → 时间
 */
/**
 * 标题遮蔽：隐私库只露前几个字
 *
 * 老板明确（2026-11-02）：
 *   「展示出来的标题不能点击，只能展示标题。我建议这个标题只取前三个字
 *     或者前五个字，后面要么是省略号，要么就用个什么把它遮蔽。
 *     不然的话人家从标题里也可以看出来你做了些什么东西。」
 *
 * 老板又指出（2026-11-03）：
 *   「上下文记忆库里大量的 2026-••••••。如果只取前几个字符，取到日期，
 *     是不是就没意义了？你不能让他光看着 2026-。」
 *
 * 所以：**先剥掉日期前缀，再取前几个字。**
 *   「2026-11-03 接入 LBase 自定义模型」 → 剥日期 → 「接入 LBase 自定义模型」
 *                                        → 露前 5 字 → 「接入 LB••••••」
 *
 * 这样既保住了"看得出这是什么类型的事"，又保住了隐私。
 */
function maskTitle(title, kind, project) {
  if (canViewKind(kind, project)) return title;      // 能看正文的库，标题正常显示

  let s = String(title || '').trim();

  // ① 剥掉开头的日期（2026-11-03 / 2026-10-16 / 2026-11-02 10:23 之类）
  s = s.replace(/^\d{4}-\d{2}-\d{2}\s*/,'');
  // ② 剥掉开头的"第N天""第N轮"这类序号
  s = s.replace(/^第\s*\d+\s*[天轮次]\s*/,'');
  // ③ 剥掉开头的时间（10:23 / 10:23:45）
  s = s.replace(/^\d{1,2}:\d{2}(:\d{2})?\s*/,'');

  // 剥完如果空了（标题原本只有日期），就退回原标题
  if (!s) s = String(title || '').trim();

  const N = 5;
  if (s.length <= N) return s;
  return s.slice(0, N) + '••••••';
}

/**
 * 列表行（主显示方式）
 *
 * 设计依据（用户明确）：
 * - 界面是给「确定感」用的，不是给用户溯源查资料的（溯源交给 agent）
 * - 数据只会越积越多 → 卡片一屏显示太少，必须用紧凑列表
 * - 摘要不显示：用户不看，占地方
 * - 列顺序按「对小白有用」排：类型 → 标题 → 谁写的 → 时间
 * - 项目列去掉（老板 2026-11-02：项目管理已去掉，这一列没用了）
 */
function itemRow(item, showMatch) {
  const viewable = canViewKind(item.kind, item.project);
  const shown = maskTitle(item.title, item.kind, item.project);

  // 能看正文的才给链接；隐私库不给链接
  // 老板明确（2026-11-02）：「点不开还是得有个提示，
  //   不然用户又不理解为什么点不开。」
  //   → 隐私库的行点一下弹提示，告诉他去 WorkBuddy 里查。
  let row;
  if (viewable) {
    row = el('a', { class: 'list-row', href: '#/item/' + item.id, title: item.title });
  } else {
    row = el('div', { class: 'list-row', style: 'cursor:help' });
    row.addEventListener('click', function () {
      toast(t('clickHiddenHint'), 'info');
    });
  }

  row.append(
    el('span', { class: 'c-kind' },
      el('span', { class: 'tag ' + kindClass(item.kind) }, kindLabel(item.kind)),
    ),
    el('span', { class: 'c-title' }, shown),
    // 列名是「账号」，所以优先显示 account
    // （agent 是"谁写的记录"，account 才是"哪个账号"。
    //   2026-11-05 踩过：只显示 agent，抓不到账号名时显示成 WorkBuddy，
    //   用户以为多了一个叫 WorkBuddy 的账号）
    el('span', { class: 'c-agent' }, item.account || item.agent || '—'),
    el('span', { class: 'c-time', title: item.created_at || '' }, fmtDateShort(item.created_at)),
  );
  if (showMatch) {
    row.append(el('span', { class: 'c-match' },
      item.match !== undefined ? Math.round(item.match * 100) + '%' : ''));
  }
  return row;
}

/** 列表容器（带表头） */
function itemList(items, showMatch) {
  const box = el('div', { class: 'list' });
  const head = el('div', { class: 'list-head' },
    el('span', { class: 'c-kind' }, t('colKind')),
    el('span', { class: 'c-title' }, t('colTitle')),
    el('span', { class: 'c-agent' }, t('colAgent')),
    el('span', { class: 'c-time' }, t('colTime')),
  );
  if (showMatch) head.append(el('span', { class: 'c-match' }, t('colMatch')));
  box.append(head);
  for (const it of items) box.append(itemRow(it, showMatch));
  return box;
}

function itemCard(item, showMatch) {
  const isExt = item.source_type === 'external';
  const top = el('div', { class: 'card-top' },
    el('h3', {}, item.title),
    el('span', { class: 'tag ' + kindClass(item.kind) }, kindLabel(item.kind)),
  );
  const card = el('a', { class: 'card', href: '#/item/' + item.id }, top);
  if (item.summary) card.append(el('div', { class: 'desc' }, item.summary));
  const meta = el('div', { class: 'meta' });
  if (isExt) meta.append(el('span', { class: 'tag external' }, t('kindExternal')));
  if (item.agent) meta.append(el('span', {}, item.agent));
  meta.append(el('span', {}, fmtDate(item.created_at)));
  // 会话标签：让同一次对话的多条记忆能看出来是一组的
  if (item.session_id) {
    meta.append(el('span', {
      class: 'tag',
      title: item.session_id,
      style: 'font-family:var(--mono);font-size:11px;opacity:0.75',
    }, item.session_id.slice(0, 10)));
  }
  if (showMatch && item.match !== undefined) {
    meta.append(el('span', { class: 'tag match' }, Math.round(item.match * 100) + '%'));
  }
  card.append(meta);
  return card;
}

/**
 * 首次使用的引导区
 *
 * 设计依据（站在完全不懂技术的新用户角度）：
 * 1. 用户刚走完向导，看到空页面会有疑问：我漏了什么？要不要手动建？
 * 2. 不能给他「新建项目」按钮——他不知道项目是什么，点进去也不知道干什么
 * 3. 主行动只有一个：等。其它都是补救路径
 * 4. 避免出现项目 / API / 写库 / agent 这些词，用「AI」「记到这里」代替
 */
function firstRunGuide() {
  const box = el('div', { class: 'first-run' });

  // ── 情况一：已经发过了，等着就行 ──
  box.append(
    el('div', { class: 'first-run-block' },
      el('div', { class: 'first-run-title ok' },
        el('span', { class: 'first-run-icon' }, '✓'),
        t('frDoneTitle'),
      ),
      el('p', { class: 'first-run-text' }, t('frDoneText')),
    ),
  );

  // ── 情况二：还没发 / 没反应，去重新复制 ──
  const link = el('a', { href: '#/settings', class: 'first-run-link' }, t('frGoCopy'));
  box.append(
    el('div', { class: 'first-run-block' },
      el('div', { class: 'first-run-title' }, t('frNotYetTitle')),
      el('p', { class: 'first-run-text' }, t('frNotYetText')),
      link,
    ),
  );

  // ── 会看到什么 ──
  const list = el('div', { class: 'first-run-list' });
  for (const key of ['frSee1', 'frSee2', 'frSee3']) {
    list.append(el('div', { class: 'first-run-item' }, t(key)));
  }
  box.append(
    el('div', { class: 'first-run-block' },
      el('div', { class: 'first-run-title' }, t('frSeeTitle')),
      list,
    ),
  );

  return box;
}

function emptyBlock(title, hint, action) {
  const box = el('div', { class: 'empty' }, el('h2', {}, title));
  if (hint) box.append(el('p', {}, hint));
  if (action) box.append(action);
  return box;
}

// ── 页面：某个库 ──────────────────────────────────────────

async function renderLib(main, kind) {
  main.innerHTML = '';

  const descKey = { skill: 'descSkill', wiki: 'descWiki', changelog: 'descChangelog', memory: 'descMemory', 'agent-memory': 'descAgentMemory' }[kind];

  const headRow = el('div', { class: 'page-head-row' },
    el('div', {},
      el('h1', {}, kindLabel(kind)),
      el('div', { class: 'desc' }, descKey ? t(descKey) : ''),
    ),
  );
  main.append(el('div', { class: 'page-head' }, headRow));

  // 项目筛选已去掉（老板 2026-11-02：项目管理去掉后，项目这个概念对用户没意义）
  const listWrap = el('div');
  main.append(listWrap);

  async function loadList() {
    const r = await API.get('/api/list?kind=' + encodeURIComponent(kind) + '&limit=200');
    listWrap.innerHTML = '';
    if (!r.ok || !r.items || r.items.length === 0) {
      listWrap.append(emptyBlock(t('libEmpty'), t('libEmptyHint')));
      return;
    }
    listWrap.append(itemList(r.items, false));
  }

  await loadList();
}

// ── 页面：内容详情 ────────────────────────────────────────

async function renderItem(main, id) {
  main.innerHTML = '';
  const r = await API.get('/api/get?id=' + encodeURIComponent(id));
  if (!r.ok) {
    main.append(emptyBlock(t('searchNone'), ''));
    return;
  }
  const it = r.item;
  const isExt = it.source_type === 'external';

  // 记录来源库，供菜单高亮和返回按钮使用
  state.itemKind = it.kind;

  const meta = el('div', { class: 'detail-meta' },
    el('span', { class: 'tag ' + kindClass(it.kind) }, kindLabel(it.kind)),
  );
  if (isExt) meta.append(el('span', { class: 'tag external' }, t('kindExternal')));
  if (it.agent) meta.append(el('span', {}, t('detailAgent') + ': ' + it.agent));
  if (it.evidence) meta.append(el('span', {}, t('detailEvidence') + ': ' + evidenceLabel(it.evidence)));
  meta.append(el('span', {}, t('detailCreated') + ' ' + fmtDate(it.created_at)));

  main.append(
    el('div', { class: 'detail-head' },
      el('a', { class: 'back', href: backHashForKind(it.kind) }, '← ' + t('btnBack')),
      el('h1', {}, it.title),
      meta,
    ),
  );

  if (isExt) {
    const warn = el('div', {
      style: 'margin-bottom:16px;padding:10px 14px;background:rgba(240,183,77,0.08);border:1px solid rgba(240,183,77,0.25);border-radius:8px;font-size:13px;color:var(--amber)',
    }, t('detailExternalHint'));
    main.append(warn);
    if (it.external_url) {
      main.append(el('div', { style: 'margin-bottom:16px;font-size:13px;color:var(--text-mute)' },
        t('detailSourceUrl') + ': ',
        el('a', { href: it.external_url, target: '_blank', rel: 'noopener', style: 'color:var(--accent-lite)' }, it.external_url),
      ));
    }
  }

  // 正文区
  //
  // 隐私库（项目记忆 / 变更记录）：正文不展示，但也不能显示成空白
  // 老板要求：「点击看不到具体内容」—— 要明确告诉他为什么看不到
  if (it.bodyHidden) {
    main.append(el('div', {
      style: 'padding:20px 18px;background:var(--bg-side);border:1px solid var(--line-soft);' +
        'border-radius:10px;font-size:13px;color:var(--text-dim);line-height:1.9',
    },
      el('div', { style: 'font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px' },
        t('bodyHiddenTitle')),
      el('div', {}, t('bodyHiddenDesc')),
    ));
  } else {
    main.append(el('div', { class: 'content-box', html: renderMarkdown(it.content) }));
  }

  if (isExt) {
    const delBtn = el('button', { class: 'btn danger', style: 'margin-top:24px' }, t('btnDelete'));
    delBtn.onclick = async function () {
      if (!confirm(t('externalDeleteConfirm'))) return;
      const d = await API.del('/api/item?id=' + it.id);
      if (d.ok) {
        toast(t('okDeleted'), 'ok');
        location.hash = '#/external';
      } else {
        toast(d.error || t('errGeneric'), 'error');
      }
    };
    main.append(delBtn);
  }
}

// ── 页面：外部资源 ────────────────────────────────────────

async function renderExternal(main) {
  main.innerHTML = '';

  main.append(el('div', { class: 'page-head' },
    el('div', { class: 'page-head-row' },
      el('div', {},
        el('h1', {}, t('externalTitle')),
        el('div', { class: 'desc' }, t('externalDesc')),
      ),
      el('button', { class: 'btn primary', onclick: function () { showAddExternal(); } }, t('externalAdd')),
    ),
  ));

  // 全局书签，不按项目筛选
  const r = await API.get('/api/list?sourceType=external&limit=200');
  const items = r.items || [];

  if (items.length === 0) {
    main.append(emptyBlock(t('externalEmpty'), t('externalEmptyHint'),
      el('button', { class: 'btn primary', onclick: function () { showAddExternal(); } }, t('externalAdd'))));
    return;
  }

  main.append(itemList(items, false));
}

async function showAddExternal() {
  // 外部资源是全局书签，不归属项目，所以不需要先建项目
  const urlInput = el('input', { type: 'text', placeholder: t('externalUrlPh') });
  const titleInput = el('input', { type: 'text', placeholder: t('writeItemTitlePh') });
  const descInput = el('input', { type: 'text', placeholder: t('externalDescPh') });

  const status = el('div', { style: 'font-size:12.5px;margin-top:8px;color:var(--text-mute)' });
  let fetchedBody = null;

  const fetchBtn = el('button', { class: 'btn' }, t('externalFetch'));
  fetchBtn.onclick = async function () {
    const url = urlInput.value.trim();
    if (!url) {
      toast(t('errRequired'), 'error');
      return;
    }
    fetchBtn.disabled = true;
    status.textContent = '抓取中…';
    status.style.color = 'var(--text-mute)';
    const r = await API.post('/api/fetch-readme', { url: url });
    fetchBtn.disabled = false;
    if (r.ok) {
      // 用【格式化后】的正文存库 —— 去掉了 HTML、徽章、语言导航、长链接
      // 老板明确（2026-11-02）：「抓取过来的内容格式化一下，不要显示代码」
      fetchedBody = r.cleaned || r.body;
      if (!titleInput.value && r.title) titleInput.value = r.title;
      if (!descInput.value && r.description) descInput.value = r.description;
      status.style.color = 'var(--green)';
      status.textContent = t('externalFetched') + '（' + Math.round((fetchedBody || '').length / 1024) + ' KB）';
    } else {
      status.style.color = 'var(--amber)';
      status.textContent = t('externalFetchFail');
    }
  };

  const content = el('div', {},
    el('h2', {}, t('externalAdd')),
    el('p', { class: 'sub' }, t('externalAddHint')),
    el('div', { class: 'field' },
      el('label', {}, t('externalUrl')),
      el('div', { style: 'display:flex;gap:8px' }, urlInput, fetchBtn),
      status,
    ),
    el('div', { class: 'field' }, el('label', {}, t('writeItemTitle')), titleInput),
    el('div', { class: 'field' }, el('label', {}, t('externalDescLabel')), descInput),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn', onclick: closeModal }, t('btnCancel')),
      el('button', {
        class: 'btn primary',
        onclick: async function (e) {
          const url = urlInput.value.trim();
          const title = titleInput.value.trim();
          if (!url || !title) {
            toast(t('errRequired'), 'error');
            return;
          }
          e.target.disabled = true;
          const body = fetchedBody || ('# ' + title + '\n\n' + descInput.value + '\n\n[' + url + '](' + url + ')\n');
          const r = await API.post('/api/write', {
            kind: 'external-candidate',
            title: title,
            body: body,
            summary: descInput.value || null,
            externalUrl: url,
            allowDuplicate: true,
          });
          e.target.disabled = false;
          if (!r.ok) {
            toast(r.error || t('errGeneric'), 'error');
            return;
          }
          closeModal();
          toast(t('okAdded'), 'ok');
          refreshShell();
          navigate();
        },
      }, t('btnSave')),
    ),
  );

  openModal(content, true);
  setTimeout(function () { urlInput.focus(); }, 60);
}

// ── 页面：设置 ────────────────────────────────────────────

const DISCIPLINE_DEFS = [
  { key: 'skill', labelKey: 'dSkill', def: true },
  { key: 'wiki', labelKey: 'dWiki', def: true },
  { key: 'changelog', labelKey: 'dChangelog', def: true },
  { key: 'memory', labelKey: 'dMemory', def: true },
  { key: 'project', labelKey: 'dProject', def: true },
  { key: 'attribution', labelKey: 'dAttribution', def: true },
  { key: 'dedup', labelKey: 'dDedup', def: true },
  { key: 'rejected', labelKey: 'dRejected', def: true },
  { key: 'cleanup', labelKey: 'dCleanup', def: false },
];

/**
 * 账号组区块（设置页）
 *
 * 老板明确（2026-11-02）：
 *   「控制电脑的人有权利在自己电脑上合并任何账号。但是提醒用户，
 *     这个账号有可能不是你的，你合并了以后你得承担责任，你只能合并你自己的账号。」
 *   「合并了以后在 WorkBuddy 里就可以调用两个账号里的任意资料或者任意资源。」
 *   「否则他不知道合并了有什么用。」
 *
 * 所以这个区块的顺序是：
 *   ① 先说有什么用（不然用户不知道为什么合并）
 *   ② 再警告风险（默认隔离，你在主动解除）
 *   ③ 强制勾选确认（不勾按钮点不动）
 */
/**
 * 概览页：账号清单（只展示，不操作）
 *
 * 老板定（2026-11-03）：
 *   「我们只是标识有不同的账号。这样的话可以让用户看到有多个账号。
 *     其中一个账号是他同事的，他不想把他的记忆跟他同事的记忆搞混了，
 *     那他手动分离，我们只做一个分离功能就行了。」
 *
 * 默认就是合并的 —— 所以这里只告诉用户"有几个账号"，不做任何合并操作。
 */
function buildAccountsInfo(st) {
  const box = el('div', {
    class: 'content-box',
    style: 'margin-top:22px',
  });

  box.append(el('h3', { style: 'font-size:15px;font-weight:650;margin-bottom:6px' },
    t('accountsTitleOverview', { n: st.count })));

  box.append(el('p', { style: 'font-size:12.5px;color:var(--text-mute);margin-bottom:12px;line-height:1.7' },
    t('accountsDescOverview')));

  // 账号清单（名称 + 条数 + 最后使用时间）
  //
  // 老板纠正（2026-11-03）：
  //   「只显示最后登录时间就行了，不要显示当前，因为它没有当前啊，
  //     我当前一个也没开，你给我显示这是当前，这啥意思？」
  // → 不标「当前」，只显示最后一次使用时间
  for (const a of (st.accounts || [])) {
    box.append(el('div', {
      style: 'display:flex;align-items:center;gap:10px;padding:9px 12px;' +
        'border:1px solid var(--line-soft);border-radius:5px;margin-bottom:6px;' +
        'background:' + (a.separated ? 'rgba(199,123,31,0.05)' : '#fff'),
    },
      el('span', { style: 'flex:1;font-size:13px;font-weight:600' }, a.name),
      el('span', { style: 'font-size:11.5px;color:var(--text-mute)' },
        t('accountsItemCount', { n: a.total || 0 })),
      el('span', { style: 'font-size:11.5px;color:var(--text-mute)' },
        a.lastUsed ? t('accountsLastUsed', { time: fmtDateShort(a.lastUsed) }) : t('accountsNeverUsed')),
      a.separated
        ? el('span', { style: 'font-size:11px;padding:2px 8px;border-radius:10px;' +
            'background:rgba(199,123,31,0.15);color:#a8620f' }, t('accountsSeparatedTag'))
        : null,
    ));
  }

  // 指向设置页的说明（分离藏在高级选项里）
  box.append(el('div', { style: 'margin-top:10px;font-size:11.5px;color:var(--text-mute);line-height:1.7' },
    t('accountsHintAdvanced')));

  return box;
}

/**
 * 设置页「高级选项」：分离账号
 *
 * 老板定（2026-11-03）：
 *   「前期默认就是合并的，在设置里有一个高级选项，这个高级选项放一些很特殊的功能。」
 *   「其中一个账号是他同事的，他不想把他的记忆跟他同事的记忆搞混了，
 *     那他手动分离，我们只做一个分离功能就行了。」
 *
 * 所以这里只做「分离 / 取消分离」，不做「合并」—— 因为合并是默认状态。
 */
async function buildAccountGroupPanel(opts) {
  const panel = el('div', { class: 'content-box', style: 'margin-bottom:20px' });

  const st = await API.get('/api/account-groups').catch(function () { return null; });

  panel.append(el('h3', { style: 'font-size:15px;font-weight:650;margin-bottom:6px' },
    t('advancedTitle')));
  panel.append(el('p', { style: 'font-size:12.5px;color:var(--text-mute);margin-bottom:16px;line-height:1.75' },
    t('advancedDesc')));

  if (!st || !st.ok || !st.currentUid) {
    panel.append(el('p', { style: 'font-size:13px;color:var(--text-mute);line-height:1.7' },
      t('groupNeedLogin')));
    return panel;
  }

  const accounts = (st.accounts || []);
  if (accounts.length <= 1) {
    panel.append(el('p', { style: 'font-size:13px;color:var(--text-mute);line-height:1.7' },
      t('groupOnlyOne')));
    return panel;
  }

  // ── 说明当前状态 ──
  panel.append(el('div', {
    style: 'margin-bottom:14px;padding:11px 13px;background:rgba(8,200,160,0.06);' +
      'border:1px solid rgba(8,200,160,0.3);border-radius:6px;font-size:12.5px;' +
      'line-height:1.8;color:var(--text-dim)',
  }, t(st.allMerged ? 'advancedStateMerged' : 'advancedStateSeparated', {
    n: accounts.length,
    s: st.separatedCount,
  })));

  // ── 每个账号一行，带「分离 / 取消分离」按钮 ──
  // 不标「当前」（老板 2026-11-03 纠正：没有当前，只显示最后使用时间）
  for (const a of accounts) {
    const btn = el('button', {
      class: 'btn sm ' + (a.separated ? 'ghost' : ''),
      style: 'font-size:12px;padding:4px 11px',
    }, a.separated ? t('advancedUnseparateBtn') : t('advancedSeparateBtn'));

    btn.onclick = async function () {
      btn.disabled = true;
      const path = a.separated ? '/api/account-groups/unseparate' : '/api/account-groups/separate';
      const r = await API.post(path, { uid: a.uid });
      btn.disabled = false;
      if (!r.ok) {
        toast(r.error || t('errGeneric'), 'error');
        return;
      }
      toast(a.separated ? t('advancedUnseparated') : t('advancedSeparated', { name: a.name }), 'ok');
      const fresh = await buildAccountGroupPanel();
      panel.replaceWith(fresh);
      await refreshShell();
    };

    panel.append(el('div', {
      style: 'display:flex;align-items:center;gap:10px;padding:10px 12px;' +
        'border:1px solid var(--line-soft);border-radius:5px;margin-bottom:7px;' +
        'background:' + (a.separated ? 'rgba(199,123,31,0.05)' : '#fff'),
    },
      el('span', { style: 'flex:1;font-size:13px;font-weight:600' }, a.name),
      el('span', { style: 'font-size:11.5px;color:var(--text-mute)' },
        t('accountsItemCount', { n: a.total || 0 })),
      el('span', { style: 'font-size:11.5px;color:var(--text-mute);margin-right:4px' },
        a.lastUsed ? t('accountsLastUsed', { time: fmtDateShort(a.lastUsed) }) : t('accountsNeverUsed')),
      a.separated
        ? el('span', { style: 'font-size:11px;padding:2px 8px;border-radius:10px;' +
            'background:rgba(199,123,31,0.15);color:#a8620f' }, t('accountsSeparatedTag'))
        : null,
      btn,
    ));
  }

  // ── 分离是什么意思（说清楚，不然用户不敢点）──
  panel.append(el('div', {
    style: 'margin-top:14px;padding:11px 13px;background:rgba(199,123,31,0.06);' +
      'border:1px solid rgba(199,123,31,0.3);border-radius:6px;font-size:12px;' +
      'line-height:1.8;color:var(--text-dim)',
  },
    el('div', { style: 'font-weight:650;color:#a8620f;margin-bottom:5px;font-size:12.5px' },
      t('advancedWarnTitle')),
    el('div', { html: t('advancedWarnBody') }),
  ));

  return panel;
}

/**
 * 没找到 WorkBuddy 数据目录 → 提示用户手动指定
 *
 * 老板明确（2026-11-03）：
 *   「如果是扫不到，就提醒用户，让用户手动指定目录。」
 *
 * 设计要求：
 *   ① 告诉用户"我找过了"，并列出找过哪些位置（不然用户以为我们没找）
 *   ② 给一个输入框让他填路径
 *   ③ 给一句怎么找的提示（普通人不知道怎么找）
 */
async function buildWbHomeNotice(info) {
  const box = el('div', {
    style: 'margin-top:20px;padding:14px 16px;background:rgba(199,123,31,0.09);' +
      'border:1px solid rgba(199,123,31,0.4);border-radius:8px',
  });

  box.append(
    el('div', { style: 'font-size:14px;font-weight:650;margin-bottom:6px;color:#a8620f' },
      t('wbHomeNotFoundTitle')),
    el('p', { style: 'font-size:13px;color:var(--text-dim);line-height:1.7;margin-bottom:10px' },
      t('wbHomeNotFoundDesc')),
  );

  // 列出找过的位置
  if (info.tried && info.tried.length) {
    const list = el('div', {
      style: 'font-size:12px;color:var(--text-mute);line-height:1.9;margin-bottom:12px;' +
        'padding:9px 11px;background:rgba(255,255,255,0.6);border-radius:5px',
    });
    list.append(el('div', { style: 'margin-bottom:4px' }, t('wbHomeTriedTitle')));
    for (const p of info.tried) {
      list.append(el('div', { style: 'padding-left:8px' }, '· ' + p));
    }
    box.append(list);
  }

  // 输入框
  const input = el('input', {
    type: 'text',
    placeholder: t('wbHomePlaceholder'),
    style: 'width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:5px;' +
      'font-size:13px;font-family:var(--sans);margin-bottom:10px',
  });
  box.append(input);

  // 提示怎么找
  box.append(el('div', {
    style: 'font-size:12px;color:var(--text-mute);line-height:1.8;margin-bottom:12px',
  }, t('wbHomeHowToFind')));

  const btn = el('button', { class: 'btn primary' }, t('wbHomeSaveBtn'));
  const status = el('span', { style: 'font-size:12.5px;margin-left:10px;color:var(--text-mute)' });

  btn.onclick = async function () {
    const p = input.value.trim();
    if (!p) {
      toast(t('wbHomeNeedPath'), 'error');
      return;
    }
    btn.disabled = true;
    status.textContent = t('wbHomeChecking');
    const r = await API.post('/api/wb-home', { path: p });
    btn.disabled = false;
    if (!r.ok) {
      status.style.color = 'var(--red)';
      status.textContent = r.error || t('errGeneric');
      return;
    }
    status.style.color = 'var(--green)';
    status.textContent = t('wbHomeSaved');
    toast(t('wbHomeSaved'), 'ok');
    // 重新加载页面（数据会按新目录重扫）
    setTimeout(function () { navigate(); }, 600);
  };

  box.append(el('div', { style: 'display:flex;align-items:center' }, btn, status));

  return box;
}

/**
 * 设置页：备份
 *
 * 老板定的规则（2026-11-04）：
 *   「每周备份一次也没问题……每三个月删除 3 个月以前的，这样还可以。」
 *   「备份到哪儿？就像你说的备份到 data 下的 backup 目录。
 *     在设置里面允许用户修改。」
 *
 * 界面：
 *   · 备份目录（显示当前，可改；改完立即校验能不能写）
 *   · 自动备份开关（每周一次）
 *   · 保留月数
 *   · 现有几个包、共多大、上次/下次时间
 *   · [立即备份] 按钮
 */
async function buildBackupPanel() {
  const panel = el('div', { class: 'content-box', style: 'margin-bottom:20px' });

  const st = await API.get('/api/backup').catch(function () { return null; });
  const b = (st && st.ok && st.backup) || null;

  panel.append(el('h3', { style: 'font-size:15px;font-weight:650;margin-bottom:6px' },
    t('backupTitle')));
  panel.append(el('p', { style: 'font-size:12.5px;color:var(--text-mute);margin-bottom:16px;line-height:1.75' },
    t('backupDesc')));

  if (!b) {
    panel.append(el('p', { style: 'font-size:13px;color:var(--text-mute)' },
      t('backupUnavailable')));
    return panel;
  }

  // ── 备份目录 ──
  panel.append(el('div', {
    style: 'font-size:12.5px;font-weight:650;color:var(--text-dim);margin-bottom:7px',
  }, t('backupDirLabel')));

  const dirInput = el('input', {
    type: 'text',
    value: b.dir,
    placeholder: t('backupDirPh'),
    style: 'flex:1;font-family:ui-monospace,Consolas,monospace;font-size:12px',
  });

  const saveDirBtn = el('button', { class: 'btn', style: 'white-space:nowrap' },
    t('backupDirSave'));

  saveDirBtn.onclick = async function () {
    saveDirBtn.disabled = true;
    const r = await API.post('/api/backup/config', { dir: dirInput.value.trim() });
    saveDirBtn.disabled = false;
    if (!r.ok) {
      toast(r.error || t('errGeneric'), 'error');
      return;
    }
    toast(t('backupDirSaved'), 'ok');
    const fresh = await buildBackupPanel();
    panel.replaceWith(fresh);
  };

  panel.append(el('div', { style: 'display:flex;gap:8px;margin-bottom:6px' },
    dirInput, saveDirBtn));

  if (b.isDefaultDir) {
    panel.append(el('div', { style: 'font-size:11.5px;color:var(--text-mute);margin-bottom:16px' },
      t('backupDirIsDefault')));
  } else {
    panel.append(el('div', { style: 'display:flex;gap:10px;margin-bottom:16px;align-items:center' },
      el('span', { style: 'font-size:11.5px;color:var(--accent-deep)' }, t('backupDirCustom')),
      el('button', {
        class: 'btn ghost',
        style: 'font-size:11px;padding:3px 9px',
        onclick: async function () {
          const r = await API.post('/api/backup/config', { dir: '' });
          if (!r.ok) { toast(r.error || t('errGeneric'), 'error'); return; }
          toast(t('backupDirReset'), 'ok');
          const fresh = await buildBackupPanel();
          panel.replaceWith(fresh);
        },
      }, t('backupDirResetBtn')),
    ));
  }

  // ── 自动备份开关 + 保留月数 ──
  const weeklyCb = el('input', { type: 'checkbox' });
  weeklyCb.checked = Boolean(b.weekly);

  const keepInput = el('input', {
    type: 'number',
    value: String(b.keepMonths),
    min: '1',
    max: '120',
    style: 'width:70px;text-align:center',
  });

  const saveOptBtn = el('button', { class: 'btn', style: 'margin-left:auto' }, t('backupOptSave'));

  saveOptBtn.onclick = async function () {
    saveOptBtn.disabled = true;
    const r = await API.post('/api/backup/config', {
      weekly: weeklyCb.checked,
      keepMonths: Number(keepInput.value) || b.keepMonths,
    });
    saveOptBtn.disabled = false;
    if (!r.ok) {
      toast(r.error || t('errGeneric'), 'error');
      return;
    }
    toast(t('backupOptSaved'), 'ok');
    const fresh = await buildBackupPanel();
    panel.replaceWith(fresh);
  };

  panel.append(el('div', {
    style: 'display:flex;align-items:center;gap:10px;padding:11px 13px;' +
      'background:var(--bg);border-radius:6px;margin-bottom:16px;flex-wrap:wrap',
  },
    el('label', { style: 'display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer' },
      weeklyCb, el('span', {}, t('backupWeekly'))),
    el('span', { style: 'font-size:12px;color:var(--text-mute)' }, t('backupKeepPrefix')),
    keepInput,
    el('span', { style: 'font-size:12px;color:var(--text-mute)' }, t('backupKeepSuffix')),
    saveOptBtn,
  ));

  // ── 现状 ──
  const info = el('div', {
    style: 'padding:11px 13px;background:rgba(8,200,160,0.05);' +
      'border:1px solid rgba(8,200,160,0.22);border-radius:6px;' +
      'font-size:12px;color:var(--text-dim);line-height:1.85;margin-bottom:16px',
  });

  info.append(el('div', {},
    t('backupStatCount', { n: b.count, size: fmtSize(b.totalSize) })));

  if (b.lastAt) {
    info.append(el('div', {}, t('backupStatLast', { time: fmtDateShort(b.lastAt) })));
  } else {
    info.append(el('div', {}, t('backupStatNever')));
  }

  if (b.weekly && b.nextAt) {
    info.append(el('div', {}, t('backupStatNext', {
      time: b.nextAt === '下次扫描时' ? b.nextAt : fmtDateShort(b.nextAt),
    })));
  }

  panel.append(info);

  // ── 备份列表（最多显示 5 条）──
  if (b.items && b.items.length) {
    const listBox = el('div', { style: 'margin-bottom:16px' });
    for (const it of b.items.slice(0, 5)) {
      listBox.append(el('div', {
        style: 'display:flex;align-items:center;gap:10px;padding:6px 10px;' +
          'font-size:11.5px;color:var(--text-mute);border-bottom:1px solid var(--line-soft)',
      },
        el('span', { style: 'flex:1;font-family:ui-monospace,Consolas,monospace' }, it.name),
        el('span', {}, fmtSize(it.size)),
      ));
    }
    if (b.items.length > 5) {
      listBox.append(el('div', {
        style: 'padding:6px 10px;font-size:11.5px;color:var(--text-mute)',
      }, t('backupMoreItems', { n: b.items.length - 5 })));
    }
    panel.append(listBox);
  }

  // ── 立即备份 ──
  const nowBtn = el('button', { class: 'btn primary' }, t('backupNow'));
  nowBtn.onclick = async function () {
    nowBtn.disabled = true;
    nowBtn.textContent = t('backupRunning');
    const r = await API.post('/api/backup/now', {});
    nowBtn.disabled = false;
    nowBtn.textContent = t('backupNow');
    if (!r.ok) {
      toast(r.error || t('errGeneric'), 'error');
      return;
    }
    toast(t('backupDone', { name: r.name, size: fmtSize(r.size) }), 'ok');
    const fresh = await buildBackupPanel();
    panel.replaceWith(fresh);
  };
  panel.append(nowBtn);

  return panel;
}

/**
 * 帮助页（使用说明书）
 *
 * 老板要求（2026-11-05）：
 *   「在我们平台设置一个栏目 help 帮助，把说明书放到我们平台上」
 *
 * 结构：
 *   左侧：章节目录（可点击跳转）
 *   右侧：当前章节内容
 *
 * 为什么不直接渲染 markdown：
 *   零依赖（没有 markdown 解析器），而且我们需要按块类型做定制样式
 *   （流程图、代码块、问答、表格、ASCII 图示各有各的样式）
 */
async function renderHelp(main) {
  main.innerHTML = '';

  const r = await API.get('/api/help').catch(function () { return null; });
  if (!r || !r.ok || !r.help) {
    main.append(el('div', { class: 'content-box' }, '帮助文档加载失败。'));
    return;
  }
  const help = r.help;

  // ── 页头 ──
  main.append(el('div', { class: 'page-head' },
    el('h1', {}, help.title),
    el('div', { class: 'desc' }, help.subtitle),
  ));

  // ── 搜索框 ──
  //
  // 老板要求（2026-11-05）：
  //   「在网站应该有一个栏目叫帮助，里面可以搜索某一个章节」
  //
  // 搜索逻辑：
  //   · 搜章节标题 → 匹配的章节高亮显示，其他隐藏
  //   · 搜正文内容 → 把包含关键词的块高亮，并自动滚到第一个命中处
  //   · 清空 → 全部显示
  const searchBox = el('div', {
    style: 'display:flex;align-items:center;gap:9px;margin-bottom:16px;' +
      'padding:10px 13px;background:var(--bg-top);border:1px solid var(--line-soft);' +
      'border-radius:8px',
  });
  searchBox.append(el('span', { style: 'color:var(--text-mute)', html: ICONS.search }));

  const searchInput = el('input', {
    type: 'text',
    placeholder: '搜一下：比如「卸载」「备份」「账号」「手机版」…',
    style: 'flex:1;border:none;background:transparent;font-size:13px;' +
      'outline:none;color:var(--text)',
  });

  const searchStat = el('span', {
    style: 'font-size:11.5px;color:var(--text-mute);white-space:nowrap',
  }, '');

  const clearBtn = el('button', {
    class: 'btn ghost',
    style: 'font-size:11px;padding:3px 9px;display:none',
  }, '清空');

  searchBox.append(searchInput, searchStat, clearBtn);
  main.append(searchBox);

  // ── 布局：左目录 + 右内容 ──
  const wrap = el('div', { style: 'display:flex;gap:22px;align-items:flex-start' });

  // 左侧目录
  const toc = el('div', {
    style: 'flex:0 0 168px;position:sticky;top:14px;padding:13px;' +
      'background:var(--bg-top);border:1px solid var(--line-soft);border-radius:8px',
  });
  toc.append(el('div', {
    style: 'font-size:11.5px;font-weight:700;color:var(--text-mute);' +
      'letter-spacing:0.04em;margin-bottom:9px',
  }, '目录'));

  const content = el('div', { style: 'flex:1;min-width:0' });

  const tocLinks = {};
  help.sections.forEach(function (sec, i) {
    const link = el('a', {
      href: 'javascript:void(0)',
      style: 'display:block;padding:6px 8px;font-size:12.5px;color:var(--text-dim);' +
        'border-radius:5px;text-decoration:none;line-height:1.5;margin-bottom:2px',
    }, (i + 1) + '. ' + sec.title);

    link.onmouseenter = function () { link.style.background = 'var(--accent-soft)'; };
    link.onmouseleave = function () {
      link.style.background = tocLinks[sec.id] && tocLinks[sec.id].active
        ? 'var(--accent-soft)' : 'transparent';
    };
    link.onclick = function () {
      // 高亮
      for (const k in tocLinks) {
        tocLinks[k].el.style.background = 'transparent';
        tocLinks[k].el.style.color = 'var(--text-dim)';
        tocLinks[k].el.style.fontWeight = '400';
        tocLinks[k].active = false;
      }
      link.style.background = 'var(--accent-soft)';
      link.style.color = 'var(--accent-deep)';
      link.style.fontWeight = '650';
      tocLinks[sec.id].active = true;

      // 滚到内容
      secEls[sec.id].scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    tocLinks[sec.id] = { el: link, active: false };
    toc.append(link);
  });

  // 右侧：所有章节依次排列（滚动浏览，不是分页）
  const secEls = {};
  const blockEls = [];   // 每个块的 { el, text, secId }，给搜索用

  help.sections.forEach(function (sec, i) {
    const box = el('div', {
      style: 'margin-bottom:34px;scroll-margin-top:14px',
      id: 'help-' + sec.id,
    });

    box.append(el('h2', {
      style: 'font-size:17px;font-weight:700;color:var(--brand-ink);' +
        'margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid rgba(8,200,160,0.22)',
    }, (i + 1) + '. ' + sec.title));

    for (const b of sec.blocks) {
      const blockEl = renderHelpBlock(b);
      blockEls.push({ el: blockEl, text: blockPlainText(b), secId: sec.id });
      box.append(blockEl);
    }

    secEls[sec.id] = box;
    content.append(box);
  });

  wrap.append(toc, content);
  main.append(wrap);

  // ── 搜索逻辑 ──
  let searchTimer = null;

  function doSearch() {
    const q = searchInput.value.trim().toLowerCase();

    // 清空 → 全部显示
    if (!q) {
      for (const k in secEls) {
        secEls[k].style.display = '';
        secEls[k].style.opacity = '1';
        secEls[k].style.background = '';
      }
      for (const b of blockEls) {
        b.el.style.display = '';
        b.el.style.background = '';
        b.el.style.outline = '';
      }
      for (const k in tocLinks) {
        tocLinks[k].el.style.opacity = '1';
      }
      searchStat.textContent = '';
      clearBtn.style.display = 'none';
      return;
    }

    clearBtn.style.display = '';

    let hits = 0;
    let firstHit = null;
    const hitSecs = new Set();

    for (const b of blockEls) {
      if (b.text.toLowerCase().includes(q)) {
        hits += 1;
        hitSecs.add(b.secId);
        b.el.style.display = '';
        b.el.style.background = 'rgba(8,200,160,0.10)';
        b.el.style.outline = '1px solid rgba(8,200,160,0.30)';
        b.el.style.borderRadius = '4px';
        if (!firstHit) firstHit = b;
      } else {
        b.el.style.display = 'none';
        b.el.style.background = '';
        b.el.style.outline = '';
      }
    }

    // 章节：有命中的显示，没命中的整块隐藏
    for (const k in secEls) {
      if (hitSecs.has(k)) {
        secEls[k].style.display = '';
        secEls[k].style.opacity = '1';
      } else {
        secEls[k].style.display = 'none';
      }
    }

    // 目录：有命中的章节正常，没命中的变淡
    for (const k in tocLinks) {
      tocLinks[k].el.style.opacity = hitSecs.has(k) ? '1' : '0.35';
    }

    // 统计
    if (hits === 0) {
      searchStat.textContent = '没找到';
      searchStat.style.color = '#c77b1f';
    } else {
      searchStat.textContent = hits + ' 处匹配 · ' + hitSecs.size + ' 个章节';
      searchStat.style.color = 'var(--accent-deep)';
      // 滚到第一个命中
      if (firstHit) {
        firstHit.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 180);
  });

  clearBtn.onclick = function () {
    searchInput.value = '';
    doSearch();
    searchInput.focus();
  };

  // 默认高亮第一个
  const first = help.sections[0];
  if (first && tocLinks[first.id]) {
    tocLinks[first.id].el.style.background = 'var(--accent-soft)';
    tocLinks[first.id].el.style.color = 'var(--accent-deep)';
    tocLinks[first.id].el.style.fontWeight = '650';
    tocLinks[first.id].active = true;
  }
}

/**
 * 把一个内容块转成纯文本（给搜索用）
 *
 * 要把所有可能的文字都拼进去 —— 标题、正文、表格单元格、列表项…
 * 否则用户搜「卸载」搜不到卸载那节的表格内容
 */
function blockPlainText(b) {
  const parts = [];

  function push(x) {
    if (x === null || x === undefined) return;
    if (typeof x === 'string') {
      // 去掉 HTML 标签，只留文字
      parts.push(x.replace(/<[^>]+>/g, ' '));
    } else if (Array.isArray(x)) {
      x.forEach(push);
    }
  }

  push(b.v);
  push(b.title);
  push(b.rows);
  push(b.items);
  push(b.head);

  return parts.join(' ');
}


/** 渲染帮助文档里的一个内容块 */
function renderHelpBlock(b) {
  const P = 'font-size:13px;line-height:1.9;color:var(--text-dim);margin-bottom:12px';

  switch (b.t) {
    case 'lead':
      return el('div', {
        style: 'font-size:14.5px;font-weight:650;color:var(--accent-deep);' +
          'line-height:1.7;margin-bottom:18px',
      }, b.v);

    case 'h':
      return el('h3', {
        style: 'font-size:14px;font-weight:700;color:var(--text);' +
          'margin:20px 0 10px',
      }, b.v);

    case 'p':
      return el('div', { style: P, html: b.v });

    case 'quote':
      return el('div', {
        style: 'padding:12px 16px;margin-bottom:14px;background:var(--bg);' +
          'border-left:3px solid var(--accent);border-radius:0 6px 6px 0;' +
          'font-size:12.5px;line-height:1.9;color:var(--text-dim)',
        html: b.v,
      });

    case 'note':
      return el('div', {
        style: 'padding:12px 14px;margin-bottom:14px;background:rgba(8,200,160,0.06);' +
          'border:1px solid rgba(8,200,160,0.28);border-radius:6px;' +
          'font-size:12.5px;line-height:1.85;color:var(--text-dim)',
        html: b.v,
      });

    case 'warn':
      return el('div', {
        style: 'padding:12px 14px;margin-bottom:14px;background:rgba(199,123,31,0.07);' +
          'border:1px solid rgba(199,123,31,0.32);border-radius:6px;' +
          'font-size:12.5px;line-height:1.85;color:var(--text-dim)',
        html: b.v,
      });

    case 'flow': {
      const box = el('div', { style: 'margin-bottom:16px' });
      b.v.forEach(function (line, i) {
        box.append(el('div', {
          style: 'display:flex;gap:10px;align-items:flex-start;padding:9px 12px;' +
            'background:var(--bg);border-radius:6px;margin-bottom:6px;' +
            'font-size:12.5px;line-height:1.75;color:var(--text-dim)',
        },
          el('span', {
            style: 'flex:0 0 20px;height:20px;border-radius:50%;background:var(--accent);' +
              'color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:20px',
          }, String(i + 1)),
          el('span', { style: 'flex:1', html: line }),
        ));
      });
      return box;
    }

    case 'step':
      return el('div', {
        style: 'padding:14px 16px;margin-bottom:12px;background:var(--bg-top);' +
          'border:1px solid var(--line-soft);border-radius:8px',
      },
        el('div', { style: 'display:flex;align-items:center;gap:9px;margin-bottom:7px' },
          el('span', {
            style: 'width:24px;height:24px;border-radius:6px;background:var(--accent);' +
              'color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:24px',
          }, b.n),
          el('span', { style: 'font-size:14px;font-weight:700;color:var(--text)' }, b.title),
        ),
        el('div', { style: 'font-size:12.5px;line-height:1.85;color:var(--text-dim)', html: b.v }),
      );

    case 'code':
      return el('pre', {
        style: 'padding:13px 15px;margin-bottom:14px;background:#16211f;color:#c8f5e8;' +
          'border-radius:6px;font-size:12px;line-height:1.75;overflow-x:auto;' +
          'font-family:ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word',
      }, b.v);

    case 'ascii':
      return el('pre', {
        style: 'padding:14px;margin-bottom:16px;background:var(--bg);' +
          'border:1px solid var(--line-soft);border-radius:6px;' +
          'font-size:11.5px;line-height:1.5;overflow-x:auto;' +
          'font-family:ui-monospace,Consolas,monospace;color:var(--text-dim)',
      }, b.v.join('\n'));

    case 'list': {
      const box = el('div', { style: 'margin-bottom:14px' });
      b.v.forEach(function (line) {
        box.append(el('div', {
          style: 'display:flex;gap:8px;padding:4px 0;font-size:12.5px;' +
            'line-height:1.8;color:var(--text-dim)',
        },
          el('span', { style: 'color:var(--accent);flex-shrink:0' }, '·'),
          el('span', { style: 'flex:1', html: line }),
        ));
      });
      return box;
    }

    case 'kv': {
      const box = el('div', { style: 'margin-bottom:16px' });
      b.rows.forEach(function (row) {
        box.append(el('div', {
          style: 'display:flex;gap:12px;padding:8px 11px;border-bottom:1px solid var(--line-soft);' +
            'font-size:12.5px;line-height:1.7',
        },
          el('span', { style: 'flex:0 0 130px;font-weight:650;color:var(--text)' }, row[0]),
          el('span', { style: 'flex:1;color:var(--text-dim)', html: row[1] }),
        ));
      });
      return box;
    }

    case 'table': {
      const box = el('div', { style: 'margin-bottom:16px;overflow-x:auto' });
      const tb = el('table', {
        style: 'width:100%;border-collapse:collapse;font-size:12px',
      });
      const hr = el('tr');
      b.head.forEach(function (h) {
        hr.append(el('th', {
          style: 'padding:9px 11px;text-align:left;background:var(--bg);' +
            'font-weight:700;color:var(--text);border-bottom:2px solid var(--line-soft);' +
            'white-space:nowrap',
        }, h));
      });
      tb.append(hr);
      b.rows.forEach(function (row) {
        const tr = el('tr');
        row.forEach(function (c) {
          tr.append(el('td', {
            style: 'padding:9px 11px;border-bottom:1px solid var(--line-soft);' +
              'color:var(--text-dim);line-height:1.65;vertical-align:top',
            html: c,
          }));
        });
        tb.append(tr);
      });
      box.append(tb);
      return box;
    }

    case 'menu': {
      const box = el('div', {
        style: 'margin-bottom:16px;padding:11px 14px;background:var(--bg);border-radius:6px',
      });
      b.items.forEach(function (it) {
        box.append(el('div', {
          style: 'display:flex;gap:10px;padding:5px 0;font-size:12.5px;line-height:1.7',
        },
          el('span', { style: 'flex:1;color:var(--text)' }, it.name),
          it.note ? el('span', { style: 'color:var(--text-mute);font-size:11.5px' }, it.note) : null,
        ));
      });
      return box;
    }

    case 'case': {
      const box = el('div', {
        style: 'padding:14px 16px;margin-bottom:16px;background:rgba(8,200,160,0.05);' +
          'border:1px solid rgba(8,200,160,0.26);border-radius:8px',
      });
      box.append(el('div', {
        style: 'font-size:13px;font-weight:700;color:var(--accent-deep);margin-bottom:9px',
      }, b.title));
      box.append(el('div', {
        style: 'font-size:12.5px;line-height:1.85;color:var(--text-dim);margin-bottom:9px',
        html: b.v,
      }));
      for (const it of b.items) {
        box.append(el('div', {
          style: 'display:flex;gap:8px;padding:3px 0 3px 8px;font-size:12px;' +
            'line-height:1.75;color:var(--text-dim)',
        },
          el('span', { style: 'color:var(--accent);flex-shrink:0' }, '→'),
          el('span', { style: 'flex:1', html: it }),
        ));
      }
      if (b.after) {
        box.append(el('div', {
          style: 'margin-top:9px;font-size:12.5px;line-height:1.85;color:var(--text-dim)',
          html: b.after,
        }));
      }
      return box;
    }

    case 'qa': {
      const box = el('div');
      b.items.forEach(function (it) {
        const item = el('div', {
          style: 'margin-bottom:10px;padding:12px 14px;background:var(--bg-top);' +
            'border:1px solid var(--line-soft);border-radius:7px',
        });
        item.append(el('div', {
          style: 'font-size:13px;font-weight:700;color:var(--text);margin-bottom:7px;' +
            'line-height:1.6',
        }, it.q));
        item.append(el('div', {
          style: 'font-size:12.5px;line-height:1.9;color:var(--text-dim)',
          html: it.a,
        }));
        box.append(item);
      });
      return box;
    }

    default:
      return el('div', { style: P }, b.v || '');
  }
}

async function renderSettings(main) {
  main.innerHTML = '';

  main.append(el('div', { class: 'page-head' }, el('h1', {}, t('settingsTitle'))));

  // 账号组区块放在最前面（这是用户最可能需要的功能）
  main.append(await buildAccountGroupPanel());

  // 备份（老板 2026-11-04 要求：默认 data/backup，设置里可改）
  main.append(await buildBackupPanel());

  const cfg = await API.get('/api/config');
  const discipline = (cfg.config && cfg.config.discipline) || {};
  let customList = (discipline.custom || []).slice();

  const panel = el('div', { class: 'content-box', style: 'margin-bottom:20px' });
  panel.append(
    el('h3', { style: 'font-size:15px;font-weight:650;margin-bottom:6px' }, t('settingsDiscipline')),
    el('p', { style: 'font-size:13px;color:var(--text-mute);margin-bottom:16px' }, t('settingsDisciplineDesc')),
  );

  const boxes = {};
  const grid = el('div', { class: 'check-grid' });
  for (const d of DISCIPLINE_DEFS) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = discipline[d.key] !== undefined ? discipline[d.key] : d.def;
    boxes[d.key] = cb;
    grid.append(el('label', { class: 'check-card' }, cb, el('span', { class: 'check-card-text' }, t(d.labelKey))));
  }
  panel.append(grid);

  // 自定义
  panel.append(el('div', { style: 'font-size:13px;color:var(--text-dim);font-weight:500;margin:20px 0 8px' }, t('disciplineCustom')));
  const customWrap = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
  function renderCustom() {
    customWrap.innerHTML = '';
    customList.forEach(function (c, i) {
      const row = el('div', {
        style: 'display:flex;align-items:center;gap:8px;padding:8px 11px;background:var(--bg);border-radius:6px;font-size:13px',
      }, el('span', { style: 'flex:1' }, c));
      const rm = el('button', {
        style: 'background:none;border:none;color:var(--text-mute);cursor:pointer;font-size:16px;line-height:1',
      }, '×');
      rm.onclick = function () { customList.splice(i, 1); renderCustom(); };
      row.append(rm);
      customWrap.append(row);
    });
  }
  renderCustom();
  panel.append(customWrap);

  const customInput = el('input', { type: 'text', placeholder: t('disciplineCustomPh') });
  const addBtn = el('button', { class: 'btn' }, t('disciplineAdd'));
  addBtn.onclick = function () {
    const v = customInput.value.trim();
    if (!v) return;
    customList.push(v);
    customInput.value = '';
    renderCustom();
  };
  panel.append(el('div', { style: 'display:flex;gap:8px;margin-top:8px' }, customInput, addBtn));

  const saveBtn = el('button', { class: 'btn primary', style: 'margin-top:20px' }, t('disciplineSave'));
  saveBtn.onclick = async function () {
    const next = { custom: customList };
    for (const d of DISCIPLINE_DEFS) next[d.key] = boxes[d.key].checked;
    const r = await API.post('/api/config', { discipline: next });
    if (!r.ok) {
      toast(r.error || t('errGeneric'), 'error');
      return;
    }
    toast(t('disciplineSaved'), 'ok');
    await renderSettings(main);
  };
  panel.append(saveBtn);
  main.append(panel);

  // 接入指令（老板 2026-11-07：固定英文，挡住刨根问底的普通用户；agent-rules 文件仍保持中文）
  const guide = await API.get('/api/agent-guide?lang=en');
  const guideBox = el('div', { class: 'content-box' });
  guideBox.append(
    el('h3', { style: 'font-size:15px;font-weight:650;margin-bottom:6px' }, t('settingsGuide')),
    el('p', { style: 'font-size:13px;color:var(--text-mute);margin-bottom:16px' }, t('settingsGuideDesc')),
    cmdBox(guide.text || ''),
  );
  main.append(guideBox);

  // 免责声明（老板 2026-11-07：引导页关掉后，设置里也要能看到）
  const disc = el('div', { class: 'content-box', style: 'opacity:0.88' });
  disc.append(
    el('h3', { style: 'font-size:15px;font-weight:650;margin-bottom:8px' }, '免责声明'),
    el('p', { style: 'font-size:12.5px;color:var(--text-mute);line-height:1.8;margin-bottom:6px' },
      '1. 本软件是 WorkBuddy 记忆的辅助备份工具，仅供参考，不保证数据的完整性、准确性或时效性。因使用本软件造成的任何直接或间接损失，作者不承担任何责任。'),
    el('p', { style: 'font-size:12.5px;color:var(--text-mute);line-height:1.8;margin-bottom:6px' },
      '2. 本软件只读取 WorkBuddy 的数据，不修改其任何文件。你的数据始终在你自己的电脑上，请自行做好重要数据的备份。'),
    el('p', { style: 'font-size:12.5px;color:var(--text-mute);line-height:1.8' },
      '3. 本软件仅供个人学习、研究使用。商业部署请联系作者获得授权。'),
  );
  main.append(disc);
}

// ── 首次启动向导 ──────────────────────────────────────────

async function showOnboarding() {
  let step = 0;
  const dots = el('div', { class: 'steps' });
  const scroller = el('div', { class: 'onboard-scroll' });
  const footer = el('div', { class: 'onboard-footer' });
  const inner = el('div', { class: 'onboard-inner' }, dots, scroller, footer);
  openModal(inner, false, true);

  function updateDots() {
    dots.innerHTML = '';
    // 两步：0=欢迎，2=纪律（原 step 1 的建项目已去掉，用 2 保持编号不冲突）
    const steps = [0, 2];
    for (const s of steps) {
      dots.append(el('div', { class: 'step-dot ' + (step > s ? 'done' : step === s ? 'active' : '') }));
    }
  }

  async function finish() {
    try { await API.post('/api/config', { onboarded: true }); } catch (e) {}
    closeModal();

    // 向导结束后回概览页（项目管理页已去掉，不再跳项目页）
    if (location.hash === '#/' || location.hash === '' || location.hash === '#') {
      await navigate();
    } else {
      location.hash = '#/';
      setTimeout(function () { navigate(); }, 60);
    }

    toast(t('obReady'), 'ok');
  }

  async function render() {
    updateDots();
    scroller.innerHTML = '';
    footer.innerHTML = '';
    scroller.scrollTop = 0;

    // 第 1 步
    if (step === 0) {
      // 免责声明完整三条 + 同意复选框（老板 2026-11-07：内容必须先显示出来，才能让人勾选"已阅读"）
      const discBox = el('div', {
        style: 'margin-top:16px;padding:12px 14px;background:var(--bg);' +
          'border:1px solid var(--line-soft);border-radius:8px;' +
          'font-size:12.5px;color:var(--text-mute);line-height:1.7',
      },
        el('div', {}, '1. 本软件是 WorkBuddy 记忆的辅助备份工具，仅供参考，不保证数据的完整性、准确性或时效性。因使用本软件造成的任何直接或间接损失，作者不承担任何责任。'),
        el('div', { style: 'margin-top:6px' }, '2. 本软件只读取 WorkBuddy 的数据，不修改其任何文件。你的数据始终在你自己的电脑上，请自行做好重要数据的备份。'),
        el('div', { style: 'margin-top:6px' }, '3. 本软件仅供个人学习、研究使用。商业部署请联系作者获得授权。'),
      );
      const agreeBox = el('input', { type: 'checkbox' });
      const agreeLabel = el('label', { class: 'check-card', style: 'margin-top:10px' },
        agreeBox,
        el('span', { class: 'check-card-text' }, '我已阅读并同意以上免责声明'),
      );
      scroller.append(
        el('h2', {}, t('obWelcome')),
        el('p', { class: 'sub' }, t('brandSubFull')),
        el('div', { class: 'onboard-points' },
          point(t('obPoint1'), t('obPoint1Desc')),
          point(t('obPoint2'), t('obPoint2Desc')),
          point(t('obPoint3'), t('obPoint3Desc')),
        ),
        discBox,
        agreeLabel,
      );
      const nextBtn = el('button', {
        class: 'btn primary', disabled: true,
        onclick: function () { step = 2; render(); },
      }, t('obNext'));
      agreeBox.onchange = function () { nextBtn.disabled = !agreeBox.checked; };
      footer.append(nextBtn);
      return;
    }

    // 第 3 步
    const cfg = await API.get('/api/config').catch(function () { return null; });
    const discipline = (cfg && cfg.config && cfg.config.discipline) || {};

    const boxes = {};
    const grid = el('div', { class: 'check-grid' });
    for (const d of DISCIPLINE_DEFS) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = discipline[d.key] !== undefined ? discipline[d.key] : d.def;
      boxes[d.key] = cb;
      grid.append(el('label', { class: 'check-card' }, cb, el('span', { class: 'check-card-text' }, t(d.labelKey))));
    }

    const guide = await API.get('/api/agent-guide?lang=en').catch(function () { return { text: '' }; });

    scroller.append(
      el('h2', {}, t('obDiscipline')),
      el('p', { class: 'sub' }, t('obDisciplineDesc')),
      grid,
      el('div', { class: 'onboard-cta' },
        el('div', { class: 'onboard-cta-num' }, '1'),
        el('div', {},
          el('div', { class: 'onboard-cta-title' }, t('obCta1')),
          el('div', { class: 'onboard-cta-note' }, t('obCtaNote')),
        ),
      ),
    );

    const copyBox = el('div', { class: 'onboard-copy' });
    const copyBtn = el('button', { class: 'copy-btn' }, t('btnCopy'));
    copyBtn.onclick = async function () {
      try {
        await navigator.clipboard.writeText(guide.text || '');
        copyBtn.textContent = t('btnCopied');
        setTimeout(function () { copyBtn.textContent = t('btnCopy'); }, 1600);
      } catch (e) {
        toast(t('copyFail'), 'error');
      }
    };
    copyBox.append(el('div', { class: 'onboard-copy-body' }, guide.text || ''), copyBtn);
    scroller.append(copyBox);

    footer.append(
      el('button', { class: 'btn ghost', onclick: finish }, t('obSkip')),
      el('button', {
        class: 'btn primary',
        onclick: async function (e) {
          const next = { custom: discipline.custom || [] };
          for (const d of DISCIPLINE_DEFS) next[d.key] = boxes[d.key].checked;
          e.target.disabled = true;
          await API.post('/api/config', { discipline: next }).catch(function () {});
          await finish();
        },
      }, t('obDone')),
    );
  }

  function point(title, desc) {
    return el('div', { class: 'onboard-point' },
      el('div', { class: 'onboard-point-title' }, title),
      el('div', { class: 'onboard-point-desc' }, desc),
    );
  }

  await render();
}

// ── 路由 ──────────────────────────────────────────────────

function parseHash() {
  const h = location.hash || '#/';
  const parts = h.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'overview' };
  if (parts[0] === 'lib') return { name: 'lib', kind: parts[1] };
  if (parts[0] === 'projects') return { name: 'projects' };
  if (parts[0] === 'project') return { name: 'project', id: parts[1] };
  if (parts[0] === 'item') return { name: 'item', id: parts[1] };
  if (parts[0] === 'external') return { name: 'external' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'help') return { name: 'help' };
  return { name: 'overview' };
}

function tabLabelFor(r, fallbackTitle) {
  if (r.name === 'overview') return t('navOverview');
  if (r.name === 'lib') return kindLabel(r.kind);
  if (r.name === 'item') return fallbackTitle || '内容';
  if (r.name === 'external') return t('navExternal');
  if (r.name === 'settings') return t('navSettings');
  if (r.name === 'help') return t('navHelp');
  return 'Buddy Trace';
}

let navToken = 0;

async function navigate() {
  const main = document.getElementById('app');
  const r = parseHash();
  const myToken = ++navToken;

  renderSider();

  // 渲染到临时容器
  const staging = document.createElement('div');
  let pageTitle = '';

  try {
    if (r.name === 'overview') await renderOverview(staging);
    else if (r.name === 'lib') await renderLib(staging, r.kind);
    else if (r.name === 'item') {
      const it = await API.get('/api/get?id=' + encodeURIComponent(r.id));
      pageTitle = (it && it.ok && it.item) ? it.item.title : '';
      await renderItem(staging, r.id);
    } else if (r.name === 'external') await renderExternal(staging);
    else if (r.name === 'settings') await renderSettings(staging);
        else if (r.name === 'help') await renderHelp(staging);
    else await renderOverview(staging);
  } catch (e) {
    if (myToken !== navToken) return;
    staging.innerHTML = '';
    staging.append(emptyBlock(t('errGeneric'), String(e && e.message ? e.message : e)));
  }

  if (myToken !== navToken) return;

  // 替换 DOM（不依赖 replaceChildren，兼容旧浏览器）
  while (main.firstChild) main.removeChild(main.firstChild);
  while (staging.firstChild) main.appendChild(staging.firstChild);

  // 页签
  const hash = location.hash || '#/';
  if (r.name !== 'settings') {
    addTab(hash, tabLabelFor(r, pageTitle));
  } else {
    state.activeHash = hash;
    renderTabs();
  }

  // 进场动效
  main.classList.remove('page-in');
  void main.offsetWidth;
  main.classList.add('page-in');

  document.querySelector('.page-frame').scrollTop = 0;

  // 再次渲染菜单：详情页渲染时才设置 state.itemKind，
  // 所以要等渲染完成后刷新高亮，否则高亮会停在上一个页面。
  renderSider();
}

/** 刷新菜单计数和顶栏统计 */
async function refreshShell() {
  try {
    const h = await API.get('/api/health');
    if (h.ok) {
      state.stats = h.stats;
      // 各库条数 —— 左侧菜单要显示（老板要求：菜单栏也要有条数）
      state.counts = h.counts || {};
      const right = document.getElementById('topbarRight');
      if (right) {
        right.innerHTML = '';
        right.append(el('span', {}, s_stat(h.stats)));
      }
    }
  } catch (e) {}
  renderSider();
}

function s_stat(stats) {
  let agents = 0;
  return stats.total + ' 条内容 · ' + stats.projects + ' 个项目';
}

// ── 启动 ──────────────────────────────────────────────────

window.addEventListener('hashchange', navigate);

(async function boot() {
  // 先确认"当前登录的是哪个 WorkBuddy 账号" —— 后面所有请求都要带这个 uid
  await API.initUid();
  // 远程下发配置（云端 Gitee/GitHub；失败就 null，不渲染二维码入口）
  try {
    const r = await API.get('/api/remote');
    if (r && r.remote) state.remote = r.remote;
  } catch (e) {}
  await refreshShell();
  await navigate();

  // 首次使用引导
  try {
    const cfg = await API.get('/api/config');
    if (cfg && cfg.config && !cfg.config.onboarded) {
      setTimeout(function () { showOnboarding(); }, 450);
    }
  } catch (e) {}
})();

/** 云端有新内容 → 弹窗，用户选「立即更新」或「暂不更新」 */
function showRemoteUpdatePrompt() {
  const content = el('div', {},
    el('div', { style: 'font-size:15px;font-weight:600;margin-bottom:10px' }, '发现新内容'),
    el('div', { style: 'font-size:13px;color:var(--text-mute);margin-bottom:18px' },
      '云端发布了新内容，是否立即更新？'),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', onclick: closeModal }, '暂不更新'),
      el('button', {
        class: 'btn',
        onclick: async function () {
          closeModal();
          const r = await API.get('/api/remote-update').catch(function () { return null; });
          if (r && r.ok) {
            location.reload();
          } else {
            toast('更新失败，请稍后再试', 'error');
          }
        },
      }, '立即更新'),
    ),
  );
  openModal(content, false, true);
}

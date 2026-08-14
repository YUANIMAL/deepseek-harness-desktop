'use strict';

// Control Center i18n. Loaded before control.js; exposes window.I18N,
// window.t(key) and window.applyI18n(lang).

window.I18N = {
  en: {
    'app.title': 'DeepSeek Control Center',
    'chip.backend': 'backend',
    'chip.git': 'git',
    'status.running': 'running',
    'status.stopped': 'stopped',
    'status.owned': '(owned by this app)',
    'status.external': '(external)',

    'tab.overview': 'Overview',
    'tab.updates': 'Updates',
    'tab.plugins': 'Community Plugins',
    'tab.agents': 'Local Agents',
    'tab.settings': 'Settings',

    'overview.harness': 'Harness source',
    'overview.checkout': 'Checkout path',
    'overview.cli': 'Built CLI',
    'overview.commit': 'Branch / commit',
    'overview.sync': 'Sync',
    'overview.openGithub': 'Open GitHub repo',
    'overview.openWeb': 'Open web UI',
    'overview.backend': 'Backend (dsh web)',
    'overview.url': 'URL',
    'overview.status': 'Status',
    'overview.profile': 'Plugin profile',
    'btn.start': 'Start',
    'btn.stop': 'Stop',
    'btn.restart': 'Restart',
    'overview.notFound': '(not found)',
    'overview.unavailable': '(unavailable)',
    'overview.missingCli': '(missing — run pnpm run build)',
    'overview.noHarness': '(no harness checkout found)',
    'sync.behind': 'behind {b}, ahead {a}',
    'sync.clean': 'clean',
    'sync.dirty': 'dirty',
    'git.unavailable': 'git: unavailable',
    'status.done': '(done)',
    'status.failed': '(failed)',

    'updates.title': 'App updates',
    'updates.current': 'Current version',
    'updates.check': 'Check for updates',
    'updates.install': 'Restart & install',
    'updates.hint': 'Auto-update checks GitHub Releases on launch and every 4 hours. It requires a signed build — unsigned builds can\u2019t self-update on macOS.',
    'updates.checking': 'checking\u2026',
    'updates.uptodate': 'up to date',
    'updates.available': 'new version {v} \u2014 downloading\u2026',
    'updates.progress': 'downloading\u2026 {p}%',
    'updates.downloaded': 'version {v} ready \u2014 restart to install',
    'updates.unavailable': 'auto-update unavailable ({m})',
    'updates.unavailable.short': 'unavailable: {m}',

    'plugins.search': 'Search plugins\u2026',
    'plugins.allCategories': 'All categories',
    'plugins.profile': 'profile: {p}',
    'plugins.count': '{n} / {t} plugins',
    'plugins.installed': 'installed',
    'plugins.install': 'Install',
    'plugins.remove': 'Remove',
    'plugins.fetchLive': 'Fetch latest from GitHub',
    'plugins.fetching': 'fetching\u2026',
    'plugins.liveCount': '{n} new from GitHub',
    'plugins.liveFailed': 'fetch failed: {m}',
    'plugins.live': 'live',
    'plugins.liveHint': 'Live plugins come from the GitHub dsh-plugin topic; the bundled catalog is the verified set. Some live entries may fail to install.',

    'agents.title': 'Run a local agent team',
    'agents.goal': 'Goal / task',
    'agents.goalPlaceholder': 'e.g. Research three ways to do X and pick the best',
    'agents.workers': 'Workers',
    'agents.broadcast': 'broadcast (same goal to all)',
    'agents.workspace': 'workspace dir (optional)',
    'agents.run': 'Run one agent',
    'agents.team': 'Run team (auto-split)',
    'agents.list': 'List agents',
    'agents.stop': 'Stop all',
    'agents.hint': 'Agents are real local DeepSeek Harness runtimes (deepseek-v4). "Run team" auto-splits the goal into N subtasks with a coordinator, then runs them in parallel and merges the results. Progress streams to the log panel below.',
    'agents.none': 'no agents running',
    'agents.runningDots': 'running\u2026',

    'settings.title': 'API credentials',
    'settings.hint': 'Keys are masked; base URLs show in full. Leave a key blank to keep the current value. New keys apply to the next agent run.',
    'settings.urlNote': '(optional, OpenAI-compatible)',
    'settings.other': 'Other API keys',
    'settings.otherNote': '(one KEY=value per line)',
    'settings.save': 'Save',
    'settings.saved': 'saved to {file}',
    'settings.current': 'current: {m}',
    'settings.language': 'Language',
    'settings.langHint': 'Switch the interface language (applies immediately).',
    'error': 'error: {m}',

    'log.title': 'Log',
    'log.clear': 'Clear',
  },

  zh: {
    'app.title': 'DeepSeek 控制中心',
    'chip.backend': '后端',
    'chip.git': 'git',
    'status.running': '运行中',
    'status.stopped': '已停止',
    'status.owned': '（本应用管理）',
    'status.external': '（外部）',

    'tab.overview': '总览',
    'tab.updates': '更新',
    'tab.plugins': '社区插件',
    'tab.agents': '本地 Agent',
    'tab.settings': '设置',

    'overview.harness': 'Harness 源码',
    'overview.checkout': '源码路径',
    'overview.cli': '内置 CLI',
    'overview.commit': '分支 / 提交',
    'overview.sync': '同步状态',
    'overview.openGithub': '打开 GitHub 仓库',
    'overview.openWeb': '打开 Web 界面',
    'overview.backend': '后端（dsh web）',
    'overview.url': '地址',
    'overview.status': '状态',
    'overview.profile': '插件 profile',
    'btn.start': '启动',
    'btn.stop': '停止',
    'btn.restart': '重启',
    'overview.notFound': '（未找到）',
    'overview.unavailable': '（不可用）',
    'overview.missingCli': '（缺失 — 请运行 pnpm run build）',
    'overview.noHarness': '（未找到 harness 源码）',
    'sync.behind': '落后 {b}，领先 {a}',
    'sync.clean': '干净',
    'sync.dirty': '有改动',
    'git.unavailable': 'git：不可用',
    'status.done': '（完成）',
    'status.failed': '（失败）',

    'updates.title': '应用更新',
    'updates.current': '当前版本',
    'updates.check': '检查更新',
    'updates.install': '重启并安装',
    'updates.hint': '自动更新会在启动时和每 4 小时检查一次 GitHub Releases。它需要签名构建——未签名版本无法在 macOS 上自动更新。',
    'updates.checking': '检查中\u2026',
    'updates.uptodate': '已是最新',
    'updates.available': '发现新版本 {v} \u2014 正在下载\u2026',
    'updates.progress': '下载中\u2026 {p}%',
    'updates.downloaded': '版本 {v} 已就绪 \u2014 重启后安装',
    'updates.unavailable': '自动更新不可用（{m}）',
    'updates.unavailable.short': '不可用：{m}',

    'plugins.search': '搜索插件\u2026',
    'plugins.allCategories': '全部分类',
    'plugins.profile': 'profile：{p}',
    'plugins.count': '{n} / {t} 个插件',
    'plugins.installed': '已安装',
    'plugins.install': '安装',
    'plugins.remove': '卸载',
    'plugins.fetchLive': '从 GitHub 获取最新',
    'plugins.fetching': '获取中\u2026',
    'plugins.liveCount': '来自 GitHub 新增 {n} 个',
    'plugins.liveFailed': '获取失败：{m}',
    'plugins.live': '实时',
    'plugins.liveHint': '实时插件来自 GitHub 的 dsh-plugin topic；内置目录是已验证集合。部分实时条目可能安装失败。',

    'agents.title': '运行本地 agent 团队',
    'agents.goal': '目标 / 任务',
    'agents.goalPlaceholder': '例如：调研三种做 X 的方案并选最优',
    'agents.workers': 'Worker 数量',
    'agents.broadcast': '广播（所有 worker 同一目标）',
    'agents.workspace': '工作目录（可选）',
    'agents.run': '运行单个 agent',
    'agents.team': '运行团队（自动拆分）',
    'agents.list': '列出 agent',
    'agents.stop': '停止全部',
    'agents.hint': 'Agent 是真实的本地 DeepSeek Harness 运行时（deepseek-v4）。"运行团队"会用协调 agent 把目标拆成 N 个子任务并行执行，再合并结果。进度会实时输出到下方日志区。',
    'agents.none': '无运行中的 agent',
    'agents.runningDots': '运行中\u2026',

    'settings.title': 'API 凭据',
    'settings.hint': '密钥会打码，base URL 明文显示。留空则保持原值。新密钥对下次运行生效。',
    'settings.urlNote': '（可选，OpenAI 兼容）',
    'settings.other': '其他 API key',
    'settings.otherNote': '（每行一个 KEY=value）',
    'settings.save': '保存',
    'settings.saved': '已保存到 {file}',
    'settings.current': '当前：{m}',
    'settings.language': '语言',
    'settings.langHint': '切换界面语言（立即生效）。',
    'error': '错误：{m}',

    'log.title': '日志',
    'log.clear': '清空',
  },
};

window.__lang = 'en';
window.t = function (key, vars) {
  let s = (window.I18N[window.__lang] || window.I18N.en)[key];
  if (s === undefined) s = window.I18N.en[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
  }
  return s;
};

window.applyI18n = function (lang) {
  window.__lang = lang || 'en';
  const dict = window.I18N[window.__lang] || window.I18N.en;
  document.documentElement.lang = window.__lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n');
    if (dict[k] !== undefined) el.textContent = dict[k];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const k = el.getAttribute('data-i18n-placeholder');
    if (dict[k] !== undefined) el.placeholder = dict[k];
  });
};

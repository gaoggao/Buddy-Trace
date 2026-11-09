/**
 * Buddy Trace · 版本号（唯一来源）
 *
 * 为什么单独一个文件（2026-11-08）：
 *   版本号原来散在 package.json / server.js / help-data.js / installer.iss 四处，
 *   一处改漏就会"健康检查报 2.1.0，帮助页写 2.0.0"这种不一致。
 *   现在代码里的版本号统一从这里 import，改版本只改这一个文件
 *   （package.json 和 installer.iss 是构建/安装元数据，也保持同步）。
 *
 * 增量更新时，code/src/version.js 会随 code 包一起被替换，
 * 所以 /api/health 返回的版本号能正确反映外部 code 的版本。
 */

export const VERSION = '2.1.0';

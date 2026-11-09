/**
 * Buddy Trace · 端口统一来源
 *
 * 为什么单独一个文件（2026-11-08 修）：
 *   端口列表原来散在 index.js / server.js / wb-open.js / wb-watchdog.js / cli.js
 *   五处，其中 cli.js 还是老的一套 [41829,41830,41831]，跟别处不一致。
 *   一处改漏就会出现"服务跑在 42307，但探针只试 41829"这种错。
 *   现在统一从这里 import，改端口只改这一个文件。
 *
 * 端口选择（老板 2026-11-03 定的）：
 *   41829 首选，后面跳跃分布，避开常见服务默认端口，被占就顺延下一个。
 */

export const DEFAULT_PORTS = [
  41829,   // 首选（LBASE 约定的 WorkBuddy 端口）
  42307,   // 跳跃 +478
  44159,   // 跳跃 +1852
  46309,   // 跳跃 +2150
  48733,   // 跳跃 +2424
];

/**
 * 由命令行 --port / 环境变量 BT_PORTS / 默认值 三选一，得到最终端口列表。
 * 规则与之前一致，只是把默认值收敛到 DEFAULT_PORTS。
 */
export function resolvePorts({ portArg, env = process.env }) {
  if (portArg) return [Number(portArg)];
  if (env.BT_PORTS) {
    return env.BT_PORTS.split(';')
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  return DEFAULT_PORTS.slice();
}

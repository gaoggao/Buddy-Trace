/**
 * Buddy Trace · 同步扫描 Worker
 *
 * 3.0.4 新增：把 wb-sync.js 的 scan() 放进 worker 线程跑。
 *
 * 为什么（老板 2026-11-22 实测提问：为什么 BuddyTrace 打不开、过一会又好了）：
 *   scan() 是同步函数，扫 8.1 万个文件 / 2.5GB 要 6 秒。
 *   它跑在主线程时，Node 单线程被占住，6 秒内 /api/health 完全不响应 ——
 *   用户看到的就是"网页打不开，过一会自己好了"。
 *   LBASE 服务没这个后台扫描，所以一直顺畅。
 *
 * 实测依据：冷扫 5973ms，扫到 463 条（scanned=58, bytes=2MB）。
 *
 * 这个 worker 只做一件事：收到参数 → 跑 scan() → 把结果（含 Map）序列化后 post 回去。
 * Map 通过 structured clone 原样传递，主线程拿回来写库。
 */

import { parentPort, workerData } from 'node:worker_threads';
import { scan } from './wb-sync.js';

try {
  const opts = workerData || {};
  // 主线程传进来的 Map 被 structured clone 后仍是 Map，scan 直接能用
  const result = scan({
    dataDir: opts.dataDir,
    mtimeCache: opts.mtimeCache instanceof Map ? opts.mtimeCache : new Map(),
    sessCache: opts.sessCache instanceof Map ? opts.sessCache : new Map(),
  });
  parentPort.postMessage({ ok: true, result });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e && e.message || e) });
}

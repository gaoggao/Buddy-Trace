/**
 * LBASE 索引层（JSON 文件实现）
 *
 * 为什么不用 SQLite：
 * - node:sqlite 在 Node 22 是实验性 API，每次运行都打警告，用户会以为是错误
 * - 引入 better-sqlite3 等原生模块会破坏「单文件可执行」的打包
 * - 实测 1 万条索引：2.26 MB、读取 31ms、查询 1ms，完全够用
 *
 * 特点：
 * - 零依赖、无警告、用户能直接打开看
 * - 内存中操作，落盘用原子写（先写临时文件再 rename）
 */

import fs from 'node:fs';
import path from 'node:path';

export class Index {
  /**
   * @param {string} filePath index.json 的路径
   */
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.items = [];
    this.#load();
  }

  #load() {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      // 索引损坏不影响内容文件，重建即可
      this.items = [];
    }
  }

  /** 原子写盘 */
  #save() {
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, items: this.items }), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  /** 新增一条 */
  insert(item) {
    this.items.push(item);
    this.#save();
    return item;
  }

  /**
   * 更新一条索引记录的字段
   * 用于合并项目时改 project_id，不碰正文文件
   * @param {string} id
   * @param {object} patch 要覆盖的字段
   * @returns {object|null}
   */
  update(id, patch) {
    const item = this.items.find((x) => x.id === id);
    if (!item) return null;
    Object.assign(item, patch);
    this.#save();
    return item;
  }

  /** 按 id 取 */
  getById(id) {
    return this.items.find((i) => i.id === id) || null;
  }

  /** 按 id 删 */
  removeById(id) {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    const changed = this.items.length !== before;
    if (changed) this.#save();
    return changed;
  }

  /**
   * 查询
   * @param {object} [filter]
   * @param {string} [filter.projectId]
   * @param {string} [filter.kind]
   * @param {string} [filter.sourceType]
   * @returns {object[]}
   */
  query(filter = {}) {
    let out = this.items;
    if (filter.projectId) out = out.filter((i) => i.project_id === filter.projectId);
    if (filter.kind) out = out.filter((i) => i.kind === filter.kind);
    if (filter.sourceType) out = out.filter((i) => i.source_type === filter.sourceType);
    return out;
  }

  /** 全部 */
  all() {
    return this.items.slice();
  }

  /** 总数 */
  count() {
    return this.items.length;
  }
}

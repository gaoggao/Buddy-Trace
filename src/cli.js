#!/usr/bin/env node
/**
 * LBASE CLI
 *
 * 用法：
 *   buddy serve                     启动服务
 *   buddy project add <名字>         建项目
 *   buddy project list              列项目
 *   buddy write --kind <类型> --project <项目> --title <标题> [--file <正文文件>] [--text <正文>] [--agent <名>] [--evidence <依据>]
 *   buddy search <关键词> [--project <项目>] [--kind <类型>]
 *   buddy get <id>
 *   buddy list [--project <项目>] [--kind <类型>]
 *   buddy delete <id>               删除（开发模式任意；只读模式仅外部库）
 *   buddy kinds                     列出库类型
 *   buddy doctor                    健康检查
 *   buddy backup [--out <文件>]      备份
 *   buddy restore <文件>             恢复
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, KINDS } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);
const flags = parseFlags(rest);
const positional = rest.filter((a) => !a.startsWith('--') && rest.indexOf(a) !== rest.indexOf('--'));

const dataDir = path.resolve(flags.data || './data');

function usage() {
  console.log(`
溯源 · Buddy Trace — WorkBuddy 记忆的延伸

用法:
  buddy serve                             启动服务
  buddy doctor                            健康检查
  buddy kinds                             列出所有库类型

  buddy project add <名字>                新建项目
  buddy project list                      列出项目

  buddy write --kind skill --project 归流 --title "架构说明" --file ./a.md
  buddy write --kind wiki --project 归流 --title "背景" --text "正文" --agent dsh
  选项: --evidence 实测|官方文档|推断  --tags a,b  --allow-duplicate

  buddy search <关键词> [--project 归流] [--kind skill] [--limit 20]
  buddy get <id>
  buddy list [--project 归流] [--kind skill]
  buddy delete <id>                       删除（开发模式可删任意；只读模式仅外部库）

  buddy backup [--out ./lbase-backup.zip]
  buddy restore <文件.zip>

全局选项:
  --data <目录>                           数据目录（默认 ./data）

库类型:
${Object.entries(KINDS).map(([k, m]) => `  ${k.padEnd(20)} ${m.label}（${m.sourceType === 'external' ? '可删改' : '不可删改'}）`).join('\n')}
`);
}

async function main() {
  if (!cmd || cmd === 'help' || flags.help) {
    usage();
    return;
  }

  if (cmd === 'serve') {
    // 转交给 index.js 的启动逻辑
    const { spawn } = await import('node:child_process');
    const entry = path.join(__dirname, 'index.js');
    const child = spawn(process.execPath, [entry, ...rest], { stdio: 'inherit' });
    return new Promise((resolve) => child.on('exit', resolve));
  }

  const store = new Store(dataDir);
  try {
    switch (cmd) {
      case 'kinds': {
        for (const [k, m] of Object.entries(KINDS)) {
          const mark = m.sourceType === 'external' ? '可删改' : '不可删改';
          console.log(`  ${k.padEnd(20)} ${m.label.padEnd(14)} ${mark}`);
        }
        break;
      }

      case 'project': {
        const sub = rest[0];
        if (sub === 'add') {
          const name = rest[1];
          if (!name) throw new Error('缺少项目名');
          const p = store.createProject(name);
          console.log(`✓ 项目已就绪: ${p.name} (${p.id})`);
        } else if (sub === 'list' || !sub) {
          const list = store.listProjects();
          if (list.length === 0) {
            console.log('还没有项目。用 buddy project add <名字> 创建。');
          } else {
            for (const p of list) {
              const stat = store.list({ project: p.id, limit: 0 });
              console.log(`  ${p.name.padEnd(20)} ${p.id}  ${stat.total} 条`);
            }
          }
        } else {
          throw new Error(`未知子命令: project ${sub}`);
        }
        break;
      }

      case 'write': {
        const { kind, project, title } = flags;
        if (!kind) throw new Error('缺少 --kind（用 buddy kinds 查看）');
        if (!project) throw new Error('缺少 --project');
        if (!title) throw new Error('缺少 --title');
        if (!flags.agent && !process.env.BT_AGENT) {
          throw new Error('缺少 --agent（谁写的，溯源用）。也可以设环境变量 BT_AGENT');
        }

        let body = flags.text || '';
        if (flags.file) {
          if (!fs.existsSync(flags.file)) throw new Error(`文件不存在: ${flags.file}`);
          body = fs.readFileSync(flags.file, 'utf8');
        }
        if (!body && !process.stdin.isTTY) {
          body = fs.readFileSync(0, 'utf8');
        }
        if (!body) throw new Error('缺少正文（--text / --file / 或从 stdin 管道输入）');

        const result = store.write({
          project,
          kind,
          title,
          body,
          agent: flags.agent || process.env.BT_AGENT || null,
          evidence: flags.evidence || null,
          tags: flags.tags ? String(flags.tags).split(',').map((s) => s.trim()) : [],
          status: flags.status || 'active',
          allowDuplicate: Boolean(flags['allow-duplicate']),
          externalUrl: flags['external-url'] || null,
        });

        if (!result.ok) {
          console.error(`✗ ${result.error}`);
          if (result.duplicates) {
            console.error('  相似内容：');
            for (const d of result.duplicates) {
              console.error(`    ${d.id}  ${d.title}  相似度 ${d.similarity}`);
            }
            console.error('  确认要新建，加 --allow-duplicate');
          }
          process.exitCode = 1;
        } else {
          console.log(`✓ 已写入 ${result.item.id}`);
          console.log(`  ${result.item.file_path}`);
        }
        break;
      }

      case 'search': {
        const q = positional[0];
        if (!q) throw new Error('缺少查询词');
        const r = store.search(q, {
          project: flags.project,
          kinds: flags.kind ? [flags.kind] : undefined,
          limit: Number(flags.limit || 20),
        });
        if (r.total === 0) {
          console.log(`未找到与「${q}」相关的内容。`);
        } else {
          console.log(`找到 ${r.total} 条（按匹配度排序）：\n`);
          for (const it of r.items) {
            const ext = it.source_type === 'external' ? '🔗外部 ' : '';
            console.log(`  [${(it.match * 100).toFixed(0)}%] ${ext}${it.title}`);
            console.log(`        ${it.kind} · ${it.agent || '-'} · ${it.created_at.slice(0, 10)} · ${it.id}`);
            if (it.summary) console.log(`        ${it.summary.slice(0, 70)}`);
            console.log('');
          }
        }
        break;
      }

      case 'get': {
        const id = positional[0];
        if (!id) throw new Error('缺少 id');
        const item = store.get(id);
        if (!item) throw new Error(`内容不存在: ${id}`);
        console.log(item.content);
        break;
      }

      case 'list': {
        const r = store.list({
          project: flags.project,
          kind: flags.kind,
          limit: Number(flags.limit || 50),
        });
        console.log(`共 ${r.total} 条：`);
        for (const it of r.items) {
          const ext = it.source_type === 'external' ? '🔗外部 ' : '';
          console.log(`  ${ext}${it.title.padEnd(30)} ${it.kind.padEnd(12)} ${it.agent || '-'}  ${it.created_at.slice(0, 10)}`);
        }
        break;
      }

      case 'delete': {
        const id = positional[0];
        if (!id) throw new Error('缺少 id');
        const r = store.remove(id);
        if (!r.ok) {
          console.error(`✗ ${r.error}`);
          process.exitCode = 1;
        } else {
          console.log(`✓ 已删除 ${id}`);
        }
        break;
      }

      case 'doctor': {
        console.log('Buddy Trace 健康检查\n');
        let ok = true;

        // 数据目录
        if (fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory()) {
          try {
            fs.accessSync(dataDir, fs.constants.W_OK);
            console.log(`  ✓ 数据目录可写: ${dataDir}`);
          } catch {
            console.log(`  ✗ 数据目录不可写: ${dataDir}`);
            ok = false;
          }
        } else {
          console.log(`  ⚠ 数据目录不存在（首次运行会自动创建）: ${dataDir}`);
        }

        // 数据库
        try {
          const s = store.stats();
          console.log(`  ✓ 数据库正常: ${s.total} 条内容，${s.projects} 个项目`);
        } catch (e) {
          console.log(`  ✗ 数据库异常: ${e.message}`);
          ok = false;
        }

        // 端口
        const net = await import('node:net');
        for (const port of [41829, 41830, 41831]) {
          const free = await new Promise((resolve) => {
            const srv = net.createServer();
            srv.once('error', () => resolve(false));
            srv.once('listening', () => srv.close(() => resolve(true)));
            srv.listen(port, '127.0.0.1');
          });
          console.log(`  ${free ? '✓' : '·'} 端口 ${port} ${free ? '可用' : '被占用'}`);
        }

        // 磁盘
        try {
          const st = fs.statfsSync(dataDir);
          const freeGB = (st.bavail * st.bsize) / 1024 ** 3;
          console.log(`  ✓ 磁盘剩余: ${freeGB.toFixed(1)} GB`);
        } catch {
          console.log('  · 磁盘信息不可用');
        }

        console.log(ok ? '\n状态: 正常' : '\n状态: 有问题，见上面 ✗');
        if (!ok) process.exitCode = 1;
        break;
      }

      case 'backup': {
        const out = path.resolve(flags.out || `./buddy-trace-backup-${Date.now()}.tar`);
        const { execFileSync } = await import('node:child_process');
        try {
          execFileSync('tar', ['-cf', out, '-C', path.dirname(dataDir), path.basename(dataDir)], {
            stdio: 'pipe',
          });
          const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
          console.log(`✓ 备份完成: ${out} (${mb} MB)`);
        } catch (e) {
          console.error(`✗ 备份失败: ${e.message}`);
          process.exitCode = 1;
        }
        break;
      }

      case 'restore': {
        const file = path.resolve(positional[0] || flags.file || '');
        if (!file || !fs.existsSync(file)) throw new Error('备份文件不存在');
        const { execFileSync } = await import('node:child_process');
        try {
          const target = path.dirname(dataDir);
          execFileSync('tar', ['-xf', file, '-C', target], { stdio: 'pipe' });
          console.log(`✓ 已恢复到: ${dataDir}`);
        } catch (e) {
          console.error(`✗ 恢复失败: ${e.message}`);
          process.exitCode = 1;
        }
        break;
      }

      default:
        console.error(`未知命令: ${cmd}`);
        usage();
        process.exitCode = 1;
    }
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  } finally {
    store.close();
  }
}

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

main();

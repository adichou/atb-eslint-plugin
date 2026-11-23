// 原生模块身份与内置 litenvi 底层边界，模块规则和测试入口检查共用。
import path from 'node:path';
import { builtinModules } from 'node:module';
import fs from 'litenvi-node/lite-fs.mjs';
import { i_projectRootOf, i_repoRelative } from './attributions.mjs';

const f_BUILTINS = new Set(builtinModules);
// 仅内置 litenvi-node 真实门面实现及原生对照，不向消费项目开放配置入口。
const f_LITENVI = new Map([
  ['scripts/lite-fs.mjs', ['node:fs']],
  ['scripts/lite-http.mjs', ['node:http', 'node:https']],
  ['scripts/lite-server.mjs', ['node:http']],
  ['scripts/lite-os.mjs', ['node:os']],
  ['scripts/lite-process.mjs', ['node:os']],
  ['scripts/lite-child_process.mjs', ['node:child_process', 'node:timers', 'node:os']],
  ['scripts/lite-cmd-node.mjs', ['node:worker_threads', 'node:timers', 'node:child_process', 'node:http', 'node:https', 'node:net', 'node:tls']],
  ['scripts/tests/export/lite-os.test.mjs', ['node:os']],
  ['scripts/tests/export/native-reference.test.mjs', ['node:child_process', 'node:fs', 'node:http', 'node:net', 'node:os']],
]);

// 内部：裸内置名与 node 前缀采用同一身份，保留包名与模块子路径。
export function i_normalizeTestModule(specifier) {
  if (specifier.startsWith('node:')) return specifier;
  const head = specifier.split('/')[0];
  return !specifier.startsWith('@') && f_BUILTINS.has(head) ? `node:${specifier}` : specifier;
}

// 内部：按真实文件所属包校验身份，同名文件、嵌套普通包和越界软链接不能借用权限。
export function i_builtinModuleAllows(filename, specifier) {
  const root = i_projectRootOf(filename);
  if (!root) return false;
  const relative = i_repoRelative(filename, root);
  const allowed = f_LITENVI.get(relative);
  if (!allowed) return false;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); }
  catch { return false; }
  if (manifest?.name !== 'litenvi-node' || manifest.type !== 'module'
    || manifest.exports?.['./lite-*.mjs'] !== './scripts/lite-*.mjs') return false;
  const target = i_normalizeTestModule(specifier);
  return allowed.some(module => target === module || target.startsWith(`${module}/`));
}

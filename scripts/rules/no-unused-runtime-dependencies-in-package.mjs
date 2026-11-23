// atb/no-unused-runtime-dependencies-in-package — 清单声明但从未导入的运行时依赖。
// 检查面：dependencies + optionalDependencies（运行时作用域）。扫描包根（package.json 所在
// 目录）下全部 js/mjs/cjs（排除 node_modules 与点号开头路径；模块说明符按正则提取，跨行
// 安全，与 no-import-cycles 同口径），收集裸导入包名——子路径导入归并到包名，node:
// 内建与包名自引用不算使用；清单里从未被导入的即报。
// 不检边界（如实声明）：devDependencies 不影响最终交付物，且由 scripts/CLI（npx、lint、
// test runner 等）与配置引用消费——静态导入扫描不可见，不检；peerDependencies 由宿主
// 消费，本包不导入是常态，不检。运行时依赖实际只被 scripts/CLI 消费属声明错位（应移入
// devDependencies），本规则照报。
// 本规则运行在 package.json 上（经 JSON parser 接线，如 eslint-plugin-package-json），
// 报告落在清单 Program 节点；扫描结果进程级缓存（包根为键，与家族缓存惯例一致）。
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { i_packageNameOf } from '../lib/attributions.mjs';

const JS_EXT = /\.(?:js|mjs|cjs)$/;
// 模块引用扫描（跨行安全）：import … from 'x' / import 'x' / export … from 'x' / import('x') / require('x')。
const MODULE_SPEC = /\b(?:import\s+[^;'"]*?from\s*|import\s*|export\s+(?:\*|\{[^}]*\})\s*from\s*)['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// 私有：包根下受管 js 文件收集（排除 node_modules 与点号开头名字）。
function f_walkJs(dir, out = []) {
 for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
 if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
 const full = path.join(dir, entry.name);
 if (entry.isDirectory()) f_walkJs(full, out);
 else if (entry.isFile() && JS_EXT.test(entry.name)) out.push(full);
 }
 return out;
}

// 私有：包内全部裸导入包名集合（进程级缓存，包根为键）。
function f_usedPackages(packageDir, selfName) {
 const cache = globalThis.__atbUsedPkgs || (globalThis.__atbUsedPkgs = new Map());
 if (cache.has(packageDir)) return cache.get(packageDir);
 const used = new Set();
 for (const file of f_walkJs(packageDir)) {
 let source = '';
 try { source = fs.readFileSync(file, 'utf8'); } catch { continue; }
 for (const match of source.matchAll(MODULE_SPEC)) {
 const spec = match[1] || match[2] || match[3];
 if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
 const pkg = i_packageNameOf(spec);
 if (pkg && pkg !== selfName) used.add(pkg);
 }
 }
 cache.set(packageDir, used);
 return used;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: '清单声明但从未导入的运行时依赖（dependencies/optionalDependencies 检，dev/peer 如实留白）' },
 schema: [{ type: 'object', properties: {}, additionalProperties: false }],
 messages: {
 unusedDependency: "依赖 {{name}} 声明在 {{group}} 但包内无任何导入：未使用的运行时依赖应从清单移除（实际只被 scripts/CLI 消费的工具应移入 devDependencies）",
 },
 },

 create(context) {
 return {
 Program(node) {
 let manifest;
 try { manifest = JSON.parse(context.sourceCode.text); } catch { return; }
 const packageDir = path.dirname(path.resolve(context.filename || context.getFilename()));
 const used = f_usedPackages(packageDir, manifest.name);
 for (const group of ['dependencies', 'optionalDependencies']) {
 for (const name of Object.keys(manifest[group] || {})) {
 if (!used.has(name)) {
 context.report({ node, messageId: 'unusedDependency', data: { name, group } });
 }
 }
 }
 },
 };
 },
};

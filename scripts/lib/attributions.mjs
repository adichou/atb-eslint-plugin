// 共享归因工具（自研规则库）：来源绑定、加载表达式解析与真实路径归一。
// 设计口径：按绑定归因而非变量名或全文正则；realpath 判定包归属；
// 解析基准按 import/require 实际上下文，解析失败不静默放行（由调用方决定是否报错）。
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// i_minimatch 轻量实现：仅支持 `**`、`*`、`?` 与字面量（含 `/` 结尾目录形态），覆盖本仓配置需要。
// 返回 true 表示 target 匹配 pattern；target/pattern 一律为 posix 相对路径。
export function i_minimatch(target, pattern) {
 const dirForm = pattern.endsWith('/');
 const normalized = dirForm ? pattern.slice(0, -1): pattern;
 const regex = f_globToRegExp(normalized);
 if (dirForm) return regex.test(target) || regex.test(`${target}/`) || Boolean(target.startsWith(normalized));
 return regex.test(target);
}

function f_globToRegExp(pattern) {
 let out = '';
 for (let i = 0; i < pattern.length; i += 1) {
 const ch = pattern[i];
 if (ch === '*') {
 if (pattern[i + 1] === '*') {
 out += (pattern[i + 2] === '/' ? '(?:.*/)?': '.*');
 i += pattern[i + 2] === '/' ? 2: 1;
 } else out += '[^/]*';
 } else if (ch === '?') out += '[^/]';
 else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
 }
 return new RegExp(`^${out}$`);
}

// 私有：realpath 归一（失败回退原路径）——packageRootOf/i_repoRelative 共用，软链与真实路径结论一致。
function f_realpath(target) {
 try {
 return fs.realpathSync(target);
 } catch {
 return target;
 }
}

// bare specifier → 包名（支持 scoped 包）；node: 前缀返回 null（内置模块无第三方包名）。
export function i_packageNameOf(specifier) {
 if (specifier.startsWith('node:')) return null;
 const [scopeOrName, maybeName] = specifier.split('/');
 if (scopeOrName.startsWith('@')) return maybeName ? `${scopeOrName}/${maybeName}`: scopeOrName;
 return scopeOrName;
}

// 模块加载目标的仓库相对 posix 路径（本仓内文件）；包外目标返回 null。
export function i_repoRelative(absolute, repoRoot) {
 const real = f_realpath(absolute);
 const realRoot = f_realpath(repoRoot);
 if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) return null;
 return path.relative(realRoot, real).split(path.sep).join('/');
}

// 文件所属包根：从文件目录向上找最近的 package.json（存在且可解析）即包根，逐级回溯结果
// 全量缓存（命中与「无包根」都缓存）；不落在任何包内的文件返回 null，由调用方决定是否受检。
const f_rootCache = new Map();

// 私有：目录是否存在可解析的 package.json（无清单或不可解析均为显式预期失败，继续向上）。
function f_hasManifest(dir) {
 try {
 JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
 return true;
 } catch {
 return false;
 }
}

export function i_projectRootOf(filePath) {
 let dir = path.dirname(filePath);
 const visited = [];
 while (true) {
 if (f_rootCache.has(dir)) {
 const cached = f_rootCache.get(dir);
 for (const seen of visited) f_rootCache.set(seen, cached);
 return cached;
 }
 visited.push(dir);
 const hasManifest = f_hasManifest(dir);
 if (hasManifest || path.dirname(dir) === dir) {
 const root = hasManifest ? dir : null;
 for (const seen of visited) f_rootCache.set(seen, root);
 return root;
 }
 dir = path.dirname(dir);
 }
}

// 可解析常量求值：字面量、无插值模板与 const 字符串变量绑定；不执行模块求值。
// scope 传入当前引用所在作用域，找不到解析值时返回 { resolved: false }。
export function i_evaluateStaticString(node, sourceCode, filename) {
 if (!node) return { resolved: false };
 // import.meta / import.meta.url → file URL（filename 由调用方传入；缺省不解析）
 if (node.type === 'MetaProperty'
 || (node.type === 'MemberExpression' && !node.computed && node.object.type === 'MetaProperty')) {
 if (!filename) return { resolved: false };
 if (node.type === 'MemberExpression' && node.property.name === 'url') {
 return { resolved: true, value: pathToFileURL(filename).href, isUrl: true };
 }
 return { resolved: false };
 }
 // new URL(spec, base) → 以 href 字符串表达（.pathname 与 fileURLToPath 消费面各自续解）
 if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'URL'
 && node.arguments.length >= 1) {
 const spec = i_evaluateStaticString(node.arguments[0], sourceCode, filename);
 if (!spec.resolved) return { resolved: false };
 let href;
 if (node.arguments.length >= 2) {
 const base = i_evaluateStaticString(node.arguments[1], sourceCode, filename);
 if (!base.resolved) return { resolved: false };
 href = new URL(spec.value, base.value).href;
 } else {
 href = new URL(spec.value).href;
 }
 return { resolved: true, value: href, isUrl: true };
 }
 // <url 求值结果>.pathname → URL 路径段（file:///… 的解码路径）
 if (node.type === 'MemberExpression' && !node.computed && node.property.name === 'pathname'
 && node.object.type !== 'Identifier') {
 const obj = i_evaluateStaticString(node.object, sourceCode, filename);
 if (obj.resolved && obj.isUrl) return { resolved: true, value: fileURLToPath(new URL(obj.value)) };
 return { resolved: false };
 }
 // fileURLToPath(<url 求值结果>) → 真实路径字符串
 if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'fileURLToPath'
 && node.arguments.length === 1) {
 const inner = i_evaluateStaticString(node.arguments[0], sourceCode, filename);
 if (inner.resolved && inner.isUrl) return { resolved: true, value: fileURLToPath(new URL(inner.value)) };
 return { resolved: false };
 }
 if (node.type === 'Literal' && typeof node.value === 'string') return { resolved: true, value: node.value };
 if (node.type === 'Literal' && typeof node.value === 'string') return { resolved: true, value: node.value };
 if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return { resolved: true, value: node.quasis[0].value.cooked };
 // path.join / path.resolve / path.posix.join 的全静态参数形态（入口白名单等按模块级
 // 路径常量归因的场景）；任一参数不可解析则整体不解析（不猜）。
 if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed) {
 const callee = node.callee;
 const isPathJoin = callee.object.type === 'Identifier' && callee.object.name === 'path'
 && ['join', 'resolve', 'dirname'].includes(callee.property.name);
 const isPosixJoin = callee.object.type === 'MemberExpression' && !callee.object.computed
 && callee.object.object.type === 'Identifier' && callee.object.object.name === 'path'
 && callee.object.property.name === 'posix' && callee.property.name === 'join';
 if (isPathJoin || isPosixJoin) {
 const parts = [];
 let all = true;
 for (const arg of node.arguments) {
 const part = i_evaluateStaticString(arg, sourceCode, filename);
 if (!part.resolved) { all = false; break; }
 parts.push(part.value);
 }
 if (all) {
 const combiner = isPosixJoin ? path.posix.join: ({ join: path.join, resolve: path.resolve, dirname: path.dirname })[callee.property.name];
 return { resolved: true, value: combiner(...parts) };
 }
 return { resolved: false };
 }
 }
 if (node.type === 'Identifier') {
 const scope = sourceCode.getScope ? sourceCode.getScope(node): node.parent;
 let current = scope;
 while (current) {
 const binding = current.set && current.set.get(node.name);
 if (binding && binding.defs.length > 0) {
 const def = binding.defs[0];
 if (def.type === 'Variable' && def.parent && def.parent.kind === 'const' && def.node.init) {
 const inner = i_evaluateStaticString(def.node.init, sourceCode, filename);
 if (inner.resolved) return inner;
 }
 return { resolved: false };
 }
 current = current.upper;
 }
 }
 return { resolved: false };
}

// 包根的入口面（manifest 声明的公共/命令入口），供死导出分类与导出面级别规则共享：
// - importFaces：对外导入面 = manifest main/exports 目标文件 + 根配置 eslint.config.mjs
//  （ESLint 配置加载器消费）——消费方可能在包外，公开/t_ 导出的死活不可静态判定；
// - binFaces：命令/直驱入口 = manifest bin 目标——不走 import 加载器，任何导出的死活
//   都不可判，整文件放过；
// - patterns：exports 含 '*' 的目标模式（归导入面）——npm exports 模式的 '*' 是跨斜杠的
//   任意序列，折算为 glob '**' 匹配相对包根 posix 路径。
// 清单缺失或解析失败按空面处理（仅根配置生效）。
export function i_entryFacesOf(projectRoot) {
 const importFaces = new Set();
 const binFaces = new Set();
 const patterns = [];
 let manifest = {};
 try {
 manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
 } catch { manifest = {}; }
 const pushImport = (target) => {
 if (typeof target !== 'string' || !target || target.startsWith('!')) return;
 if (target.includes('*')) { patterns.push(target.replace(/^\.\//, '').replaceAll('*', '**')); return; }
 importFaces.add(path.resolve(projectRoot, target.replace(/^\.\//, '')));
 };
 if (manifest.exports === undefined) pushImport(manifest.main);
 // exports 顶层键是路径模式（'.'、'./config.mjs'…），其值才是条件对象或目标串。
 const collect = (value) => {
 if (!value) return;
 if (typeof value === 'string') return pushImport(value);
 if (Array.isArray(value)) return value.forEach(collect);
 if (typeof value === 'object') {
 for (const key of ['node', 'import', 'require', 'default']) collect(value[key]);
 }
 };
 const exports = manifest.exports;
 if (exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some(key => key.startsWith('.'))) {
 for (const value of Object.values(exports)) collect(value);
 } else collect(exports);
 for (const bin of typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin || {})) {
 if (typeof bin !== 'string') continue;
 binFaces.add(path.resolve(projectRoot, bin.replace(/^\.\//, '')));
 }
 // 根配置由 ESLint 配置加载器消费，是事实导入面入口。
 importFaces.add(path.join(projectRoot, 'eslint.config.mjs'));
 return { importFaces, binFaces, patterns };
}

// 共享归因工具（自研规则库）：来源绑定、加载表达式解析与真实路径归一。
// 设计口径：按绑定归因而非变量名或全文正则；realpath 判定包归属；
// 解析基准按 import/require 实际上下文，解析失败不静默放行（由调用方决定是否报错）。
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// minimatch 轻量实现：仅支持 `**`、`*`、`?` 与字面量（含 `/` 结尾目录形态），覆盖本仓配置需要。
// 返回 true 表示 target 匹配 pattern；target/pattern 一律为 posix 相对路径。
export function minimatch(target, pattern) {
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

// realpath 归一：失败（不存在/平台差异）回退原路径，保证判定可用。
export function realpath(target) {
 try {
 return fs.realpathSync(target);
 } catch {
 return target;
 }
}

// 文件的包归属：依次匹配 packageRoots（名称 → 绝对根目录），命中即返回包名；否则返回 'repo'（本仓根）。
// 与 packageRootForResolve（按模块解析目标判定）共用 realpath 归一，软链路径与真实路径结论一致。
export function packageOf(filePath, packageRoots) {
 const real = realpath(filePath);
 for (const [name, root] of packageRoots) {
 const realRoot = realpath(root);
 if (real === realRoot || real.startsWith(`${realRoot}${path.sep}`)) return name;
 }
 return 'repo';
}

// bare specifier → 包名（支持 scoped 包）；node: 前缀返回 null（内置模块无第三方包名）。
export function packageNameOf(specifier) {
 if (specifier.startsWith('node:')) return null;
 const [scopeOrName, maybeName] = specifier.split('/');
 if (scopeOrName.startsWith('@')) return maybeName ? `${scopeOrName}/${maybeName}`: scopeOrName;
 return scopeOrName;
}

// 模块加载目标的仓库相对 posix 路径（本仓内文件）；包外目标返回 null。
export function repoRelative(absolute, repoRoot) {
 const real = realpath(absolute);
 const realRoot = realpath(repoRoot);
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

export function projectRootOf(filePath) {
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
export function evaluateStaticString(node, sourceCode, filename) {
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
 const spec = evaluateStaticString(node.arguments[0], sourceCode, filename);
 if (!spec.resolved) return { resolved: false };
 let href;
 if (node.arguments.length >= 2) {
 const base = evaluateStaticString(node.arguments[1], sourceCode, filename);
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
 const obj = evaluateStaticString(node.object, sourceCode, filename);
 if (obj.resolved && obj.isUrl) return { resolved: true, value: fileURLToPath(new URL(obj.value)) };
 return { resolved: false };
 }
 // fileURLToPath(<url 求值结果>) → 真实路径字符串
 if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'fileURLToPath'
 && node.arguments.length === 1) {
 const inner = evaluateStaticString(node.arguments[0], sourceCode, filename);
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
 const part = evaluateStaticString(arg, sourceCode, filename);
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
 const inner = evaluateStaticString(def.node.init, sourceCode, filename);
 if (inner.resolved) return inner;
 }
 return { resolved: false };
 }
 current = current.upper;
 }
 }
 return { resolved: false };
}

// 死导出按实际受众检查：声明的 JS 导入入口允许公开/t_ 由包外消费，但 i_ 必须有包内消费者。
// 未发布的模块（含测试 helper）检查全部具名导出；bin 直驱与整模块消费沿原有保守边界。
// f_ 导出交由访问规则报告。消费图为静态文本扫描与进程级缓存，不执行模块。
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { i_entryFacesOf, i_minimatch, i_projectRootOf } from '../lib/attributions.mjs';

const DEFAULT_TEST_DIR = 'scripts/tests';
const JS_EXT = /\.(?:js|mjs|cjs)$/;
// 消费侧扫描（跨行安全）：导入子句 + 说明符 / 副作用导入 / 动态字面量 / re-export 名单 / 全量再导出。
const NAMED_IMPORT = /\bimport\s+([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT = /\bimport\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXPORT_FROM = /\bexport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const EXPORT_STAR_FROM = /\bexport\s*\*(?:\s*as\s+[\w$]+)?\s*from\s*['"]([^'"]+)['"]/g;

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

// 私有：相对说明符 → 受管文件路径（补扩展名与 /index.*；不存在返回 null）。
function f_resolveModule(dir, spec) {
 if (!spec.startsWith('.')) return null;
 const base = path.resolve(dir, spec);
 const candidates = JS_EXT.test(spec) ? [base] : [
 `${base}.js`, `${base}.mjs`, `${base}.cjs`,
 path.join(base, 'index.js'), path.join(base, 'index.mjs'), path.join(base, 'index.cjs'),
 ];
 for (const candidate of candidates) {
 if (fs.existsSync(candidate)) return candidate;
 }
 return null;
}

// 私有：导入子句项 → 源模块导出名（'a as b' 的 a 才是被消费的导出名，b 是本地名）。
function f_importedName(item) {
 const seg = item.trim();
 if (!seg) return null;
 const name = seg.includes(' as ') ? seg.split(/\s+as\s+/)[0].trim() : seg;
 return /^[A-Za-z_$][\w$]*$/.test(name) ? name : null;
}

// 私有：消费图（进程级缓存，包根为键）：consumers 文件→名字→次数；touched 文件级豁免集合。
function f_buildGraph(projectRoot) {
 const cache = globalThis.__atbExportsGraph || (globalThis.__atbExportsGraph = new Map());
 if (cache.has(projectRoot)) return cache.get(projectRoot);
 const consumers = new Map();
 const touched = new Set();
 const touch = (dir, spec) => {
 const target = f_resolveModule(dir, spec);
 if (target) touched.add(target);
 };
 const consume = (dir, spec, name) => {
 if (!name) return;
 const target = f_resolveModule(dir, spec);
 if (!target) return;
 if (!consumers.has(target)) consumers.set(target, new Map());
 const map = consumers.get(target);
 map.set(name, (map.get(name) || 0) + 1);
 };
 for (const file of f_walkJs(projectRoot)) {
 let source = '';
 try { source = fs.readFileSync(file, 'utf8'); } catch { continue; }
 const dir = path.dirname(file);
 for (const match of source.matchAll(NAMED_IMPORT)) {
 const clause = match[1];
 const spec = match[2];
 if (clause.includes('*')) touch(dir, spec);
 const braces = clause.match(/\{([^}]*)\}/);
 if (braces) {
 for (const item of braces[1].split(',')) consume(dir, spec, f_importedName(item));
 }
 const rest = clause.replace(/\{[^}]*\}/, '').replace(/\*[^,]*/, '').trim();
 const def = rest.match(/^([A-Za-z_$][\w$]*)/);
 if (def) consume(dir, spec, 'default');
 }
 for (const match of source.matchAll(SIDE_EFFECT)) touch(dir, match[1]);
 for (const match of source.matchAll(DYNAMIC_IMPORT)) touch(dir, match[1]);
 for (const match of source.matchAll(EXPORT_FROM)) {
 for (const item of match[1].split(',')) consume(dir, match[2], f_importedName(item));
 }
 for (const match of source.matchAll(EXPORT_STAR_FROM)) touch(dir, match[1]);
 }
 const graph = { consumers, touched };
 cache.set(projectRoot, graph);
 return graph;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: '导出但无消费方的死导出（按受众分类：bin 直驱整放过、声明导入面只检 i_、内部文件全检（含包内测试 helper）；f_ 导出移交 no-out-of-level-access）' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 unusedExport: "导出 '{{name}}' 无任何消费方：受管图内无人导入（入口面与动态消费已豁免），死导出应删除或接入消费方",
 unusedExportSelfUse: "导出 '{{name}}' 无跨文件消费方，但本文件内有使用：死的只是导出面——去掉 export 关键字保留实现（仅本文件使用请改 f_ 前缀）",
 unusedInternalOnFace: "对外导入面文件的 i_ 导出 '{{name}}' 在本仓内无消费方：i_ 声明包内协作，挂在公共导入面上却无人用，应删除或接入消费方",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 const filename = path.resolve(context.filename || context.getFilename());
 // 项目根自锚定：向上找最近 package.json 即所属包根；不落在任何包内的文件不受检。
 const projectRoot = i_projectRootOf(filename);
 if (projectRoot === null) return {};
 const relative = path.relative(projectRoot, filename).split(path.sep).join('/');
 // 测试身份：testDir 与 no-wrong-access-level 同名同语义（前提约束：ESLint 运行目录必须在
 // 仓库根；绝对路径传入即抛）。
 const testDirInput = options.testDir || DEFAULT_TEST_DIR;
 if (path.isAbsolute(testDirInput)) {
 throw new Error(`testDir 必须是相对仓库根的相对路径（前提约束：ESLint 运行目录必须在仓库根），不接受绝对路径：${testDirInput}`);
 }
 const { consumers, touched } = f_buildGraph(projectRoot);
 const { importFaces, binFaces, patterns } = i_entryFacesOf(projectRoot);
 // ② bin 直驱入口整放过；touched（命名空间/副作用/动态字面量/export * 消费）文件级保守豁免。
 if (binFaces.has(filename) || touched.has(filename)) return {};
 // 声明导入面（含显式发布的测试辅助模块）只检包内 i_，其余内部文件全检。
 const onImportFace = (importFaces.has(filename) || patterns.some((pattern) => i_minimatch(relative, pattern)));
 // 导出面自 AST 收集（声明形态、本地名单、re-export 面名、默认导出）；export * 使本文件成为
 // 聚合面，通配不可枚举——保守豁免本文件全部导出。
 const facesOfThisFile = [];
 let aggregate = false;
 const sourceCode = context.sourceCode || context.getSourceCode();
 const inbound = consumers.get(filename);
 const isUsed = (name) => Boolean(inbound && inbound.get(name));
 // 文件内自用检测（作用域引用计数，与 no-unused-file-private 同骨架）：导出名在本文件内
 // 有引用（排除声明与导出名单自身）→ 修复指引是「去 export 保留实现」而非「删除」。
 const globalScope = sourceCode.getScope(sourceCode.ast);
 const topScopes = [globalScope, ...globalScope.childScopes.filter((s) => s.type === 'module')];
 const selfReferenced = new Set();
 for (const scope of topScopes) {
 for (const [name, binding] of scope.set) {
 const realRefs = binding.references.filter((ref) => !binding.defs.some((d) => d.name === ref.identifier));
 if (realRefs.length > 0) selfReferenced.add(name);
 }
 }
 // 分类查面：f_ 导出一律移交 no-out-of-level-access（filePrivateExport）；导入面只检 i_
 //（消息区分：挂公共面却无人用的包内协作声明）；测试文件与内部文件检全部具名导出。
 const reportIfDead = (node, name) => {
 if (!name || name.startsWith('f_')) return;
 if (onImportFace && !name.startsWith('i_')) return;
 if (isUsed(name)) return;
 // 文件内自用：实现活着，死的只是导出面——指引「去 export」而非删除（防误删运行时代码）。
 const messageId = onImportFace ? 'unusedInternalOnFace'
 : selfReferenced.has(name) ? 'unusedExportSelfUse': 'unusedExport';
 context.report({
 node,
 messageId,
 data: { name },
 });
 };
 return {
 ExportNamedDeclaration(node) {
 if (node.source) {
 // re-export：面名是 exported 名，消费记在源模块的 local/imported 名上（图已计）。
 for (const spec of node.specifiers) {
 facesOfThisFile.push([spec.exported.name ?? String(spec.exported.value), spec]);
 }
 return;
 }
 for (const spec of node.specifiers) {
 facesOfThisFile.push([spec.exported.name ?? String(spec.exported.value), spec]);
 }
 if (node.declaration) {
 const decl = node.declaration;
 if (decl.id && decl.id.type === 'Identifier') facesOfThisFile.push([decl.id.name, decl.id]);
 else if (decl.type === 'VariableDeclaration') {
 for (const declarator of decl.declarations) {
 if (declarator.id.type === 'Identifier') facesOfThisFile.push([declarator.id.name, declarator.id]);
 }
 }
 }
 },
 ExportDefaultDeclaration(node) {
 facesOfThisFile.push(['default', node]);
 },
 ExportAllDeclaration() {
 aggregate = true;
 },
 'Program:exit'() {
 if (aggregate) return;
 for (const [name, node] of facesOfThisFile) reportIfDead(node, name);
 },
 };
 },
};

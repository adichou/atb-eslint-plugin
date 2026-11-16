// atb/no-dependency-cycles — 受管模块间本地依赖循环检查。
// 相对导入构建本地依赖图：从导入目标出发沿受管相对依赖回溯，能否回到当前文件；能回到即
// 报告完整环链，环链长度上限 80（防图异常时无限递归）。是否加载期消费由仓库自行评估——
// 规则只认环本身（调用期环同样报，是否良性由仓库按架构事实处置）。
// 仅相对导入参与建图：裸包名与 node: 内建不在受管图内；scanPath 之外的文件不受检（由其
// 所属仓库自查）。图扫描按正则提取模块引用（import … from / export … from / import() /
// require，跨行安全），进程级缓存。静态边界：不追动态 import 目标不可静态解析的边。
// （历史：本检查原随 no-undeclared-dependencies-imports 承载，后独立成规则——两项检查的
// 配置面不同：未声明依赖需要 devPaths 三级链，循环检查只需要 scanPath。）
import fs from '../../../litenvi-node/scripts/lite-fs.mjs';
import path from 'node:path';
import { evaluateStaticString, repoRelative } from '../lib/attributions.mjs';

// 轻量模块引用扫描（跨行安全）：import … from 'x' / export … from 'x' / import('x') / require('x')。
const MODULE_REF = /\b(?:import\s+[^;'"]*?from\s*|import\s*|export\s+(?:\*|\{[^}]*\})\s*from\s*)['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function f_scanSpecifiers(source) {
 const found = new Set();
 for (const match of source.matchAll(MODULE_REF)) found.add(match[1] || match[2] || match[3]);
 return found;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: '受管模块间本地依赖循环检查（相对导入依赖图回溯）' },
 schema: [{
 type: 'object',
 properties: {
 scanPath: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 dependencyCycle: '依赖循环：{{chain}} 形成环状依赖，受管模块间禁止循环依赖，请下沉共享实现到独立模块',
 },
 },

 create(context) {
 const options = context.options[0] || {};
 const scanPath = path.resolve(options.scanPath || process.cwd());
 const filename = path.resolve(context.filename || context.getFilename());
 const relative = path.relative(scanPath, filename).split(path.sep).join('/');
 // scanPath 之外的文件不受检（由其所属仓库自查）。
 if (relative.startsWith('../')) return {};
 const sourceCode = context.sourceCode || context.getSourceCode();

 // 本地依赖图（进程级缓存）：文件 → 相对引用说明符集合。
 const graphCache = globalThis.__atbDependencyGraph || (globalThis.__atbDependencyGraph = new Map());
 function relativeSpecifiersOf(file) {
 if (graphCache.has(file)) return graphCache.get(file);
 let specifiers = new Set();
 try {
 specifiers = f_scanSpecifiers(fs.readFileSync(file, 'utf8'));
 } catch {
 specifiers = new Set();
 }
 graphCache.set(file, specifiers);
 return specifiers;
 }

 // 循环检查：从导入目标出发沿受管相对依赖回溯，能否回到当前文件。
 function checkCycle(node, specifier) {
 if (!specifier || !specifier.startsWith('.')) return;
 const target = path.resolve(path.dirname(filename), specifier);
 const targetRel = repoRelative(target, scanPath);
 if (!targetRel) return;
 const display = (file) => repoRelative(file, scanPath) || path.basename(file);
 const walk = (current, chain, seen) => {
 if (current === filename) {
 context.report({ node, messageId: 'dependencyCycle', data: { chain: [...chain, display(filename)].join(' → ') } });
 return true;
 }
 if (seen.has(current) || chain.length > 80) return false;
 seen.add(current);
 for (const spec of relativeSpecifiersOf(current)) {
 if (!spec.startsWith('.')) continue;
 const next = path.resolve(path.dirname(current), spec);
 if (!repoRelative(next, scanPath)) continue;
 if (walk(next, [...chain, display(next)], seen)) return true;
 }
 return false;
 };
 walk(target, [display(filename), display(target)], new Set([filename]));
 }

 return {
 ImportDeclaration(node) {
 checkCycle(node, node.source.value);
 },
 ExportNamedDeclaration(node) {
 if (node.source) checkCycle(node, node.source.value);
 },
 ExportAllDeclaration(node) {
 checkCycle(node, node.source.value);
 },
 ImportExpression(node) {
 const evaluated = evaluateStaticString(node.source, sourceCode);
 if (evaluated.resolved) checkCycle(node, evaluated.value);
 },
 CallExpression(node) {
 if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
 if (sourceCode.getScope(node.callee).set.has('require')) return;
 const evaluated = evaluateStaticString(node.arguments[0], sourceCode);
 if (evaluated.resolved) checkCycle(node, evaluated.value);
 },
 };
 },
};

// atb/no-undeclared-dependencies-imports — 未声明依赖的导入检查（dependencies/peer/devDependencies
// 三级作用域）。依赖循环检查已独立为 no-dependency-cycles（配置面不同：本规则需要 devPaths
// 三级链，循环检查需要 scanPath 建图）。
// 项目根自锚定：受检文件向上找最近 package.json 即所属包根——依赖清单与 devPaths 相对基准
// 均以它为准，monorepo 各包按自身清单自查；不落在任何包内的文件不受检。
// 裸导入按依赖作用域三级判定：① dependencies（含 optionalDependencies，运行时作用域）匹配
// 放行 → ② peerDependencies（宿主提供作用域）匹配放行 → ③ 当前文件在 devPaths（开发代码
// 路径）内且 devDependencies（开发作用域）匹配放行 → 全不匹配报未声明依赖的导入。三类分组
// 作用域不同，不能合并：devDependencies 只对开发代码开放，生产代码引用即报（运行时缺包）。
// 自引用放行：specifier 包名等于本包名（如 litenvi-node 包内 import 'litenvi-node/…'，包
// 自引用单例检查依赖此形态）是 Node 包自引用的一等用法，不参与依赖声明判定，直接放行。
// node: 内置模块不参与该判定。
import fs from '../../../litenvi-node/scripts/lite-fs.mjs';
import path from 'node:path';
import { evaluateStaticString, minimatch, packageNameOf, projectRootOf } from '../lib/attributions.mjs';

export default {
 meta: {
 type: 'problem',
 docs: { description: '未声明依赖的导入检查（dependencies/peer/devDependencies 三级作用域）' },
 schema: [{
 type: 'object',
 properties: {
 devPaths: { type: 'array', items: { type: 'string' } },
 },
 additionalProperties: false,
 }],
 messages: {
 undeclared: '未声明依赖的导入：包 {{specifier}} 未在所属包 package.json 的 dependencies、peerDependencies 匹配，也不满足「devPaths 内文件 + devDependencies」的开发作用域组合，不得引用未声明依赖',
 devOnly: '生产代码不能依赖仅开发依赖：{{specifier}} 仅在 devDependencies 声明且当前文件不在 devPaths 内——devDependencies 只对开发代码开放，运行时依赖须列入 dependencies',
 },
 },

 create(context) {
 const options = context.options[0] || {};
 const filename = path.resolve(context.filename || context.getFilename());
 // 项目根自锚定：受检文件向上找最近 package.json；不落在任何包内的文件不受检。
 const projectRoot = projectRootOf(filename);
 if (projectRoot === null) return {};
 const relative = path.relative(projectRoot, filename).split(path.sep).join('/');
 // devPaths：开发代码路径——devDependencies 的开放范围，相对所属包根解析。无缺省（不预设
 // 目录约定），由配置显式声明。
 const devPaths = options.devPaths || [];
 const isDevFile = devPaths.some((pattern) => minimatch(relative, pattern));
 const sourceCode = context.sourceCode || context.getSourceCode();

 // 依赖清单（进程级缓存）：缺失或解析失败按空清单处理，不阻止未声明判定。
 const manifestCache = globalThis.__atbManifestCache || (globalThis.__atbManifestCache = new Map());
 function manifestOf(root) {
 if (manifestCache.has(root)) return manifestCache.get(root);
 let manifest = { name: undefined, deps: new Set(), peerDeps: new Set(), devDeps: new Set() };
 try {
 const parsed = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
 manifest = {
 name: parsed.name,
 deps: new Set([...Object.keys(parsed.dependencies || {}), ...Object.keys(parsed.optionalDependencies || {})]),
 peerDeps: new Set(Object.keys(parsed.peerDependencies || {})),
 devDeps: new Set(Object.keys(parsed.devDependencies || {})),
 };
 } catch {
 manifest = { name: undefined, deps: new Set(), peerDeps: new Set(), devDeps: new Set() };
 }
 manifestCache.set(root, manifest);
 return manifest;
 }

 function checkSpecifier(node, specifier) {
 if (!specifier || specifier.startsWith('.') || specifier.startsWith('node:')) return;
 const pkgName = packageNameOf(specifier);
 if (!pkgName) return;
 const { name, deps, peerDeps, devDeps } = manifestOf(projectRoot);
 // 自引用放行：specifier 包名 = 本包名（Node 包自引用），不属于依赖声明判定。
 if (pkgName === name) return;
 // 三级作用域判定：dependencies（含 optional，运行时）→ peerDependencies（宿主提供）→
 // devPaths 内文件 + devDependencies（开发）。全不匹配即未声明依赖的导入。
 if (deps.has(pkgName)) return;
 if (peerDeps.has(pkgName)) return;
 if (devDeps.has(pkgName)) {
 if (isDevFile) return;
 context.report({ node, messageId: 'devOnly', data: { specifier: pkgName } });
 return;
 }
 context.report({ node, messageId: 'undeclared', data: { specifier: pkgName } });
 }

 function checkStaticSource(node, specifier) {
 checkSpecifier(node, specifier);
 }

 return {
 ImportDeclaration(node) {
 checkStaticSource(node, node.source.value);
 },
 ExportNamedDeclaration(node) {
 if (node.source) checkStaticSource(node, node.source.value);
 },
 ExportAllDeclaration(node) {
 checkStaticSource(node, node.source.value);
 },
 ImportExpression(node) {
 const evaluated = evaluateStaticString(node.source, sourceCode);
 if (evaluated.resolved) checkStaticSource(node, evaluated.value);
 },
 CallExpression(node) {
 if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
 if (sourceCode.getScope(node.callee).set.has('require')) return;
 const evaluated = evaluateStaticString(node.arguments[0], sourceCode);
 if (evaluated.resolved) checkStaticSource(node, evaluated.value);
 },
 };
 },
};

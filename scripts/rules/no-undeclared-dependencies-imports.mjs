// atb/no-undeclared-dependencies-imports — 未声明依赖的导入检查（dependencies/peer/devDependencies
// 三级作用域）。依赖循环检查已独立为 no-import-cycles（配置面不同：本规则需要开发路径
// 三级链（testDir/buildToolDir 同名桥接、根配置内置识别），循环检查自锚定包根建图，无路径参数）。
// 项目根自锚定：受检文件向上找最近 package.json 即所属包根——依赖清单与开发路径相对基准
// 均以它为准，monorepo 各包按自身清单自查；不落在任何包内的文件不受检。
// 裸导入按依赖作用域三级判定：① dependencies（含 optionalDependencies，运行时作用域）匹配
// 放行 → ② peerDependencies（宿主提供作用域）匹配放行 → ③ 当前文件是开发路径代码（testDir、
// buildToolDir、根配置 eslint.config.mjs 三源并集）且 devDependencies（开发作用域）匹配放行
// → 全不匹配报未声明依赖的导入。三类分组作用域不同，不能合并：devDependencies 只对开发
// 代码开放，生产代码引用即报（运行时缺包）。
// 自引用放行：specifier 包名等于本包名（如 litenvi-node 包内 import 'litenvi-node/…'，包
// 自引用单例检查依赖此形态）是 Node 包自引用的一等用法，不参与依赖声明判定，直接放行。
// node: 内置模块不参与该判定。
// 根配置 eslint.config.mjs 内置识别为开发代码（固定路径不经参数）：配置基建合法引用
// devDependencies；识别不是豁免——未声明依赖照抓。本规则不设 ignores，不支持任何形态的忽略。
import fs from '../../../litenvi-node/scripts/lite-fs.mjs';
import path from 'node:path';
import { i_evaluateStaticString, i_minimatch, i_packageNameOf, i_projectRootOf } from '../lib/attributions.mjs';

// 缺省测试目录：与 no-wrong-access-level / 配置工厂同名同语义。
const DEFAULT_TEST_DIR = 'scripts/tests';

export default {
 meta: {
 type: 'problem',
 docs: { description: '未声明依赖的导入检查（dependencies/peer/devDependencies 三级作用域）' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 buildToolDir: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 undeclared: '未声明依赖的导入：包 {{specifier}} 未在所属包 package.json 的 dependencies、peerDependencies 匹配，也不满足「开发路径代码（testDir、buildToolDir、根配置内置识别）+ devDependencies」的开发作用域组合，不得引用未声明依赖',
 devOnly: '生产代码不能依赖仅开发依赖：{{specifier}} 仅在 devDependencies 声明且当前文件不是开发路径代码（testDir、buildToolDir、根配置内置识别）——devDependencies 只对开发代码开放，运行时依赖须列入 dependencies',
 },
 },

 create(context) {
 const options = context.options[0] || {};
 const filename = path.resolve(context.filename || context.getFilename());
 // 项目根自锚定：受检文件向上找最近 package.json；不落在任何包内的文件不受检。
 const projectRoot = i_projectRootOf(filename);
 if (projectRoot === null) return {};
 const relative = path.relative(projectRoot, filename).split(path.sep).join('/');
 // testDir：测试代码目录——与 no-wrong-access-level 同名同语义，由配置工厂同名桥接；参数为
 // 相对所属包根的相对路径，不作绝对路径折算；buildToolDir：构建工具目录，缺省空。
 const testDir = options.testDir || DEFAULT_TEST_DIR;
 const buildToolDir = options.buildToolDir || '';
 // 开发路径判定为三源并集：根配置 eslint.config.mjs 内置识别（固定路径不经参数）+ testDir +
 // buildToolDir（声明时）。识别不是豁免，未声明依赖照抓。
 const f_dirGlob = (dir) => `${dir.replace(/\/+$/, '')}/**`;
 const isDevFile = relative === 'eslint.config.mjs'
 || i_minimatch(relative, f_dirGlob(testDir))
 || (buildToolDir ? i_minimatch(relative, f_dirGlob(buildToolDir)) : false);
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
 const pkgName = i_packageNameOf(specifier);
 if (!pkgName) return;
 const { name, deps, peerDeps, devDeps } = manifestOf(projectRoot);
 // 自引用放行：specifier 包名 = 本包名（Node 包自引用），不属于依赖声明判定。
 if (pkgName === name) return;
 // 三级作用域判定：dependencies（含 optional，运行时）→ peerDependencies（宿主提供）→
 // 开发路径代码（testDir、buildToolDir、根配置内置识别）+ devDependencies（开发）。全不匹配即未声明依赖的导入。
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
 const evaluated = i_evaluateStaticString(node.source, sourceCode);
 if (evaluated.resolved) checkStaticSource(node, evaluated.value);
 },
 CallExpression(node) {
 if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
 if (sourceCode.getScope(node.callee).set.has('require')) return;
 const evaluated = i_evaluateStaticString(node.arguments[0], sourceCode);
 if (evaluated.resolved) checkStaticSource(node, evaluated.value);
 },
 };
 },
};

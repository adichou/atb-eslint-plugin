// atb/no-out-of-level-access — 当前项目 f_/i_/t_ 前缀接口的访问边界。
// 只解释本项目源码的接口；依赖包与 node: 的 f_/i_ 前缀由其所属项目自行检查，本项目不替它
// 解释。唯一例外：t_ 名（测试专用）在生产文件中禁用——测试方法不能在生产中使用，来源是
// 依赖包或 node: 也不例外（名字即声明，不读依赖源码）。
// 项目根自锚定：受检文件向上找最近 package.json 即所属包根——manifest（包名自引用解析）、
// 内外部判定与显示路径均以它为基准；不落在任何包内的文件不受检。
// 相对路径、绝对路径和包名自引用按实际项目路径归属，软链越出根目录与 node_modules 不受管。
// f_ 禁止跨文件访问；i_ 允许本项目生产协作、禁止测试触达；t_ 只允许测试路径使用（前缀固定，不提供自定义）。
// 测试身份单一目录：testDir 即测试代码唯一居所（相对仓库根的相对路径，缺省 scripts/tests，
// 与 no-wrong-access-level 同名同语义；前提约束：ESLint 运行目录必须在仓库根，绝对路径传入
// 即抛），不设多目录与 fixture 名单——所有测试代码集中在 testDir 下管理。
// 导出面分工：测试文件（testDir 命中）导出面由 atb/no-wrong-access-level 统一要求 t_
//（f_/i_/无前缀均落入其 testExportLevel 口径），本规则跳过测试文件导出面避免同面双报，
// 只核验生产文件的导出面。
// 模块对象、别名、解构、静态属性与同文件参数转传保留来源。普通函数返回值一律视为数据，
// 不继承接口身份（不执行被调函数、不推断跨函数返回值）——级别随名字走：测试专用接口以 t_
// 命名，直接导入与模块对象访问即被拦，无需返回句柄登记。
// 模块对象的属性名或加载目标无法静态确定时停止该次权限判断，不将未知情况认定为越级。
// 不执行提供者源码，不推断任意运行时数据类型或跨函数返回值。
import path from 'node:path';
import fs from '../../../litenvi-node/scripts/lite-fs.mjs';
import { i_evaluateStaticString, i_packageNameOf, i_projectRootOf, i_repoRelative } from '../lib/attributions.mjs';

const DEFAULT_TEST_DIR = 'scripts/tests';
// 私有：清单缺失或无效时不推断包名自引用，其他本地路径仍可独立判定。
function f_manifest(root) {
 try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); }
 catch { return {}; }
}

// 私有：从包自引用的 exports 条件或数组中取得声明的本地目标，不执行模块解析。
function f_exportTarget(value) {
 if (typeof value === 'string') return value;
 if (Array.isArray(value)) return value.map(f_exportTarget).find(Boolean);
 if (value && typeof value === 'object') {
 for (const condition of ['node', 'import', 'require', 'default']) {
 const target = f_exportTarget(value[condition]);
 if (target) return target;
 }
 }
 return null;
}

function f_classify(name) {
 if (name.startsWith('f_')) return 'filePrivate';
 if (name.startsWith('i_')) return 'internal';
 if (name.startsWith('t_')) return 'testOnly';
 return null;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: 'f_/i_/t_ 前缀接口的越级访问：当前项目跨文件与测试/生产级别混淆的归因；依赖包与 node: 的 t_ 名（测试专用）生产禁用' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 filePrivateAccess: "'{{name}}' 是文件私有接口（f_ 前缀），禁止跨文件导入或经模块对象访问",
 testInternalAccess: "'{{name}}' 是包内协作接口（i_ 前缀），测试代码不设 i_ 级别：测试协作接口用 t_，生产代码只对测试开放公开或 t_ 接口",
 testOnlyAccess: "'{{name}}' 是测试专用接口（t_ 前缀），生产文件 {{file}} 禁止引用或调用",
 filePrivateExport: "'{{name}}' 是文件私有接口，禁止出现在导出面（具名导出或导出对象键）",
 testOnlyExport: "'{{name}}' 是测试专用接口，仅测试文件可导出；生产文件 {{file}} 禁止导出",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 // 项目根自锚定：受检文件向上找最近 package.json；不落在任何包内的文件不受检（库实现文件
 // 可定义导出 t_ 的场景由此天然成立——库文件按其自身包根自查）。
 const filename = path.resolve(context.filename || context.getFilename());
 const projectRoot = i_projectRootOf(filename);
 if (projectRoot === null) return {};
 const relative = path.relative(projectRoot, filename).split(path.sep).join('/');
 // 测试目录（与 no-wrong-access-level 同名同语义：相对仓库根的相对路径，缺省 scripts/tests）：
 // 测试代码唯一居所，目录内即测试身份，t_ 接口对该文件放行。前提约束：ESLint 运行目录必须在
 // 仓库根——testDir 不支持绝对路径，传入即抛。
 const cwd = context.cwd || context.getCwd();
 const testDirInput = options.testDir || DEFAULT_TEST_DIR;
 if (path.isAbsolute(testDirInput)) {
 throw new Error(`testDir 必须是相对仓库根的相对路径（前提约束：ESLint 运行目录必须在仓库根），不接受绝对路径：${testDirInput}`);
 }
 const testDir = path.resolve(cwd, testDirInput);
 const isTestFile = !path.relative(testDir, filename).split(path.sep).join('/').startsWith('../');
 const sourceCode = context.sourceCode || context.getSourceCode();
 const manifest = f_manifest(projectRoot);

 // 项目内目标才参与前缀解释；依赖模块仅保留外部标记，不读取它们的接口定义（t_ 名例外——生产禁用）。
 function sourceOf(specifier) {
 let target;
 if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
 target = path.resolve(path.dirname(filename), specifier);
 } else if (manifest.name && i_packageNameOf(specifier) === manifest.name) {
 const subpath = specifier.slice(manifest.name.length).replace(/^\//, '');
 const key = subpath ? `./${subpath}` : '.';
 const exports = manifest.exports;
 let exported = key === '.' ? f_exportTarget(exports) : null;
 if (exports && typeof exports === 'object') {
 exported = f_exportTarget(exports[key]) || exported;
 if (!exported) {
 for (const pattern of Object.keys(exports)) {
 if (!pattern.includes('*')) continue;
 const [prefix, suffix] = pattern.split('*');
 if (!key.startsWith(prefix) || !key.endsWith(suffix) || key.length < prefix.length + suffix.length) continue;
 const template = f_exportTarget(exports[pattern]);
 if (template) exported = template.replaceAll('*', key.slice(prefix.length, key.length - suffix.length));
 if (exported) break;
 }
 }
 }
 target = path.resolve(projectRoot, exported || subpath || manifest.main || 'index.js');
 } else return { f_specifier: specifier, f_external: true };
 const relativeTarget = i_repoRelative(target, projectRoot);
 const external = relativeTarget === null || relativeTarget.split('/').includes('node_modules');
 return { f_specifier: specifier, f_external: external, f_module: relativeTarget, f_member: '' };
 }


 // 模块绑定登记：变量绑定 → 来源模块与导出成员路径。
 const moduleBindings = new Map();
 // 加载函数变量（createRequire 结果 / require 别名）与其解析基准
 const loaderBindings = new Map();
 // 模块对象和接口来源的派生绑定，支持解构、转存和同文件参数转传。
 const derivedBindings = new Map();
 function reportAccess(node, name, source) {
 const kind = f_classify(name);
 if (!kind) return false;
 // 依赖包与 node: 前缀只解释 t_：测试方法不能在生产中使用，来源是依赖包也不例外（名字即
 // 声明，不读依赖源码）；f_/i_ 仍由其所属项目自行检查，本项目不替它解释。
 if (source.f_external && kind !== 'testOnly') return false;
 if (kind === 'filePrivate') {
 // f_ 只允许定义文件内使用：导入与经模块对象访问一律跨文件。
 context.report({ node, messageId: 'filePrivateAccess', data: { name } });
 return true;
 }
 if (kind === 'internal') {
 // i_ 只解释本项目接口，生产协作放行，测试触达报错。
 if (isTestFile) {
 context.report({ node, messageId: 'testInternalAccess', data: { name, file: relative } });
 return true;
 }
 return false;
 }
 // testOnly 't_'
 if (!isTestFile) {
 context.report({ node, messageId: 'testOnlyAccess', data: { name, file: relative } });
 return true;
 }
 return false;
 }

 // 成员链根解析：返回 { specifier, external }（来源归因）或 null。
 function resolveBaseExpression(expr) {
 switch (expr.type) {
 case 'Identifier': {
 const scope = sourceCode.getScope(expr);
 const binding = scope.references.find((r) => r.identifier === expr)?.resolved || null;
 if (!binding) return null;
 if (moduleBindings.has(binding)) return moduleBindings.get(binding).source;
 if (derivedBindings.has(binding)) return derivedBindings.get(binding);
 return null;
 }
 case 'MemberExpression': {
 const base = resolveBaseExpression(expr.object);
 if (!base) return null;
 const key = expr.computed ? i_evaluateStaticString(expr.property, sourceCode)
 : { resolved: true, value: expr.property.name };
 return { ...base, f_member: base.f_member !== null && key.resolved
 ? [base.f_member, key.value].filter(Boolean).join('.') : null };
 }
 case 'ChainExpression':
 return resolveBaseExpression(expr.expression);
 case 'CallExpression': {
 // require / createRequire 别名加载与全局 require 直调的返回值即来源模块。
 // 配置声明的 require 全局经 eslint 作用域表现为无定义绑定（defs 为空），同样按加载器识别。
 if (expr.callee.type === 'Identifier') {
 const scope = sourceCode.getScope(expr.callee);
 const binding = scope.references.find((r) => r.identifier === expr.callee)?.resolved || null;
 const isGlobalRequire = expr.callee.name === 'require' && (!binding || binding.defs.length === 0);
 const isLoaderCall = (binding && loaderBindings.has(binding)) || isGlobalRequire;
 if (isLoaderCall) return resolveLoadTarget(expr.arguments[0]);
 }
 // 普通调用返回数据不继承接口身份（不执行被调函数、不推断返回值）：级别随名字走，
 // 测试专用接口以 t_ 命名，直接导入与模块对象访问即被拦。
 return null;
 }
 case 'AwaitExpression':
 case 'YieldExpression':
 return resolveBaseExpression(expr.argument);
 case 'ImportExpression':
 return resolveLoadTarget(expr.source);
 case 'AssignmentExpression':
 return resolveBaseExpression(expr.right);
 case 'SequenceExpression':
 return resolveBaseExpression(expr.expressions.at(-1));
 default:
 return null;
 }
 }

 // 加载目标解析：字面量/无插值模板/可解析常量 → 说明符归因；无法解析返回 null 并停止归因。
 function resolveLoadTarget(arg) {
 const evaluated = i_evaluateStaticString(arg, sourceCode);
 if (!evaluated.resolved) return null;
 return sourceOf(evaluated.value);
 }

 // 解构属性登记：ObjectPattern 内静态键建立派生归因；silent 用于预扫描只登记不报告。
 function attributePattern(pattern, source, silent) {
 for (const prop of pattern.properties) {
 if (prop.type === 'RestElement') continue;
 const key = prop.computed ? null: prop.key;
 const keyName = key ? (key.type === 'Identifier' ? key.name: String(key.value)): null;
 if (prop.value.type === 'Identifier') {
 registerDerived(prop.value, { ...source, f_member: source.f_member !== null && keyName ? [source.f_member, keyName].filter(Boolean).join('.') : null });
 } else if (prop.value.type === 'ObjectPattern') {
 attributePattern(prop.value, source, silent);
 } else if (prop.value.type === 'AssignmentPattern') {
 // 带默认值的解构：左侧为标识符时直接登记，嵌套模式继续递归
 if (prop.value.left.type === 'Identifier') registerDerived(prop.value.left, { ...source, f_member: source.f_member !== null && keyName ? [source.f_member, keyName].filter(Boolean).join('.') : null });
 else attributePattern(prop.value.left, source, silent);
 }
 if (keyName && source && !silent) {
 // 键名即受限接口名时按访问规则报错（const { f_resolve: r } = manager）
 reportAccess(prop.key, keyName, source);
 }
 }
 }

 function registerDerived(idNode, source) {
 if (!source) return;
 const scope = sourceCode.getScope(idNode);
 const binding = scope.set.get(idNode.name);
 if (binding) derivedBindings.set(binding, source);
 }

 function attributeDeclarator(node, silent) {
 if (!node.init) return;
 if (node.id.type === 'Identifier') {
 const base = resolveBaseExpression(node.init);
 if (base) registerDerived(node.id, base);
 return;
 }
 if (node.id.type === 'ObjectPattern') {
 const base = resolveBaseExpression(node.init);
 if (base) attributePattern(node.id, base, silent);
 }
 }

 function checkMemberAccess(node) {
 // 数组下标习语：数值字面量下标不是接口名访问（argv[1]、lines[0]），跳过
 if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'number') return;
 const keyName = node.computed
 ? (() => {
 const evaluated = i_evaluateStaticString(node.property, sourceCode);
 return evaluated.resolved ? evaluated.value: null;
 })()
 : (node.property.type === 'Identifier' ? node.property.name: null);
 // 属性名未知时没有越级证据，只跳过当前成员，其余可确定的访问仍正常检查。
 if (keyName === null) return;
 const base = resolveBaseExpression(node.object);
 if (base) reportAccess(node.property, keyName, base);
 }

 // 间接消费（转调包装）：被调函数的实参若解析为模块来源，将其形参登记为派生绑定（同文件包装函数）。
 function attributeCallArguments(node) {
 if (node.callee.type !== 'Identifier') return;
 const scope = sourceCode.getScope(node.callee);
 const binding = scope.references.find((r) => r.identifier === node.callee)?.resolved || null;
 if (!binding) return;
 // 全局/隐式绑定 defs 可能为空（如内置 String），无可归因定义直接跳过
 const def = binding.defs[0];
 if (!def) return;
 const fnNode = def.type === 'FunctionName' ? def.node
 : (def.type === 'Variable' && def.node.init && (def.node.init.type === 'ArrowFunctionExpression' || def.node.init.type === 'FunctionExpression') ? def.node.init: null);
 if (!fnNode) return;
 node.arguments.forEach((arg, index) => {
 const param = fnNode.params[index];
 if (!param || param.type !== 'Identifier') return;
 const base = resolveBaseExpression(arg);
 if (base) registerDerived(param, base);
 });
 }

 // 导入绑定登记：local 名 → 来源说明符归因（按作用域绑定对象为键，）。
 function registerImportDeclaration(node) {
 const source = sourceOf(node.source.value);
 for (const spec of node.specifiers) {
 const info = { source: { ...source, f_member: spec.type === 'ImportNamespaceSpecifier' ? ''
 : spec.type === 'ImportDefaultSpecifier' ? 'default' : (spec.imported.name ?? String(spec.imported.value)) }, kind: spec.type === 'ImportDefaultSpecifier' ? 'default': (spec.type === 'ImportNamespaceSpecifier' ? 'namespace': 'named'), imported: spec.type === 'ImportDefaultSpecifier' ? 'default': (spec.imported ? spec.imported.name: spec.local.name) };
 const scope = sourceCode.getScope(spec.local);
 moduleBindings.set(scope.set.get(spec.local.name), info);
 }
 }

 function checkExportedName(node, name, source, surfaceOverride) {
 if (source?.f_external) name = surfaceOverride ?? name;
 const kind = f_classify(name);
 // 测试文件导出面归 atb/no-wrong-access-level 统一要求 t_，此处跳过避免同面双报。
 if (isTestFile) return;
 if (kind === 'filePrivate') {
 context.report({ node, messageId: 'filePrivateExport', data: { name } });
 return;
 }
 if (kind === 'testOnly') {
 // 公开别名禁令：t_ 接口以非 t_ 导出名对外暴露即报错；原名导出的 t_ 接口是否
 // 匹配当前调用方级别由 atb/no-wrong-access-level 按引用位置判定。
 const surface = surfaceOverride ?? name;
 if (!surface.startsWith('t_')) {
 context.report({ node, messageId: 'testOnlyExport', data: { name, file: relative } });
 }
 }
 }

 // 判定赋值目标是否为 CommonJS 导出面，返回导出键
 // （exports.<key> / module.exports / module.exports.<key>；计算键按可解析值核验）
 function exportsFaceKey(left) {
 if (left.type !== 'MemberExpression') return null;
 const key = left.computed
 ? (i_evaluateStaticString(left.property, sourceCode).resolved ? String(i_evaluateStaticString(left.property, sourceCode).value): null)
 : (left.property.type === 'Identifier' ? left.property.name: null);
 if (!key) return null;
 const obj = left.object;
 if (obj.type === 'Identifier') {
 if (obj.name === 'exports') return key;
 if (obj.name === 'module' && key === 'exports') return 'exports';
 return null;
 }
 if (obj.type === 'MemberExpression' && !obj.computed && obj.object.type === 'Identifier' && obj.object.name === 'module' && obj.property.type === 'Identifier' && obj.property.name === 'exports') {
 return key;
 }
 return null;
 }

 function checkIdentifierBindingName(node, name, defaultSurface = false) {
 // 局部声明名前缀检查只在导出面进行；此处不拦非导出局部（设计口径：避免误伤解构占位）。
 // 测试文件导出面归 atb/no-wrong-access-level（同 checkExportedName 口径）。
 if (isTestFile) return;
 const kind = f_classify(name);
 if (kind === 'filePrivate') {
 context.report({ node, messageId: 'filePrivateExport', data: { name } });
 } else if (kind === 'testOnly' && defaultSurface) {
 // 默认导出面把 t_ 接口挂到无名默认入口，等同公开别名；具名 t_ 导出由
 // atb/no-wrong-access-level 按引用位置判定级别。
 context.report({ node, messageId: 'testOnlyExport', data: { name, file: relative } });
 }
 }

 return {
 // 预扫描：先登记全部导入绑定与派生绑定，再把接口对象实参归因到被调函数形参（顺序无关，
 // 保证转调包装在成员访问检查前完成归因）。
 Program(node) {
 const walk = (current, visit) => {
 // 数组属性可含 null 洞（如 ArrayPattern.elements 的省略位），非 AST 节点跳过
 if (!current || typeof current.type !== 'string') return;
 visit(current);
 for (const key of Object.keys(current)) {
 if (['parent', 'loc', 'range', 'tokens'].includes(key)) continue;
 const value = current[key];
 if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
 else if (value && typeof value === 'object' && typeof value.type === 'string') walk(value, visit);
 }
 };
 walk(node, (n) => {
 if (n.type === 'ImportDeclaration') registerImportDeclaration(n);
 });
 walk(node, (n) => {
 if (n.type === 'VariableDeclarator') attributeDeclarator(n, true);
 });
 walk(node, (n) => {
 if (n.type === 'CallExpression') attributeCallArguments(n);
 });
 },

 ImportDeclaration(node) {
 registerImportDeclaration(node);
 const source = sourceOf(node.source.value);
 // 同项目来源按原导出名核验；依赖包前缀仅 t_ 例外（生产禁用），f_/i_ 不在本项目解释。
 for (const spec of node.specifiers) {
 if (spec.type !== 'ImportSpecifier') continue;
 // 改名导入仍检查原导出名
 reportAccess(spec.imported, spec.imported.name, source);
 }
 },

 ExportNamedDeclaration(node) {
 if (node.source) {
 const source = sourceOf(node.source.value);
 for (const spec of node.specifiers) {
 const exportedName = spec.local.name;
 const surfaceName = spec.exported.name ?? String(spec.exported.value ?? exportedName);
 reportAccess(spec.local, exportedName, source);
 checkExportedName(spec.exported, exportedName, source, surfaceName);
 }
 return;
 }
 for (const spec of node.specifiers) {
 const scope = sourceCode.getScope(spec);
 const binding = scope.set.get(spec.local.name);
 const derived = binding && (derivedBindings.get(binding) || moduleBindings.get(binding)?.source);
 const surfaceName = spec.exported.name ?? String(spec.exported.value ?? spec.local.name);
 if (derived) checkExportedName(spec.exported, spec.local.name, derived, surfaceName);
 else checkExportedName(spec.exported, spec.local.name, null, surfaceName);
 }
 if (node.declaration) {
 // export 声明只可能是 Function/Class/VariableDeclaration；按声明形态取绑定标识符
 const ids = node.declaration.type === 'VariableDeclaration'
 ? node.declaration.declarations.flatMap((d) => (d.id.type === 'Identifier' ? [d.id]: []))
 : [node.declaration.id];
 for (const id of ids) checkIdentifierBindingName(id, id.name);
 }
 },

 ExportDefaultDeclaration(node) {
 const decl = node.declaration;
 if (decl.type === 'Identifier') {
 const scope = sourceCode.getScope(decl);
 const binding = scope.set.get(decl.name);
 const derived = binding && (derivedBindings.get(binding) || moduleBindings.get(binding)?.source);
 if (derived) checkExportedName(decl, decl.name, derived, 'default');
 else checkIdentifierBindingName(decl, decl.name, true);
 return;
 }
 if (decl.type === 'ObjectExpression') {
 for (const prop of decl.properties) {
 if (prop.type !== 'Property') continue;
 const keyName = prop.computed ? null: (prop.key.type === 'Identifier' ? prop.key.name: String(prop.key.value));
 if (keyName) checkExportedName(prop.key, keyName, null);
 // 聚合形态（REQ-20261031-001）：键是面名、值是实现引用——实现绑定跟随面级别，
 // 不按自身前缀核验；仅 shorthand（键=值同名，面名即值名）参与核验。
 if (prop.shorthand === true) {
 const scope = sourceCode.getScope(prop.value);
 const binding = scope.set.get(prop.value.name);
 const derived = binding && (derivedBindings.get(binding) || moduleBindings.get(binding)?.source);
 checkExportedName(prop.value, prop.value.name, derived || null, keyName ?? undefined);
 }
 }
 }
 },

 VariableDeclarator(node) {
 attributeDeclarator(node);
 // 加载函数登记：createRequire(...) 结果与 require 别名（不按变量名认定身份）
 if (node.init && node.id.type === 'Identifier') {
 const init = node.init;
 if (init.type === 'CallExpression' && init.callee.type === 'Identifier') {
 // createRequire 按绑定识别（支持改名导入），不按局部函数名认定身份
 const calleeScope = sourceCode.getScope(init.callee);
 const calleeBinding = calleeScope.references.find((r) => r.identifier === init.callee)?.resolved || null;
 const importedName = calleeBinding && calleeBinding.defs.length > 0 && calleeBinding.defs[0].type === 'ImportBinding'
 ? (calleeBinding.defs[0].node.imported ? calleeBinding.defs[0].node.imported.name: calleeBinding.defs[0].node.local.name)
 : null;
 if (init.callee.name === 'createRequire' || importedName === 'createRequire') {
 const scope = sourceCode.getScope(node.id);
 loaderBindings.set(scope.set.get(node.id.name), { base: 'createRequire' });
 return;
 }
 }
 if (init.type === 'Identifier') {
 const scope = sourceCode.getScope(init);
 const binding = scope.references.find((r) => r.identifier === init)?.resolved || null;
 // 别名转传：既有 loader 再别名，或全局 require 本身转传（const load = require）
 const isLoaderAlias = (binding && loaderBindings.has(binding)) || (!binding && init.name === 'require');
 if (isLoaderAlias) {
 const ownScope = sourceCode.getScope(node.id);
 loaderBindings.set(ownScope.set.get(node.id.name), { base: binding || 'globalRequire' });
 }
 }
 }
 },

 CallExpression(node) {
 // 转调包装：同文件内以接口对象实参调用的函数，其对应形参在函数体内按来源归因
 attributeCallArguments(node);
 const callee = node.callee;
 if (callee.type === 'MemberExpression') {
 // 数值下标调用（handlers[0]()）不是接口名访问，跳过
 if (callee.computed && callee.property.type === 'Literal' && typeof callee.property.value === 'number') return;
 // require('x').prop 形态与 loader 别名 .call 形态经 resolveBaseExpression 命中
 const base = resolveBaseExpression(callee.object);
 if (base) {
 const evaluated = callee.computed ? i_evaluateStaticString(callee.property, sourceCode): { resolved: true, value: callee.property.name };
 if (evaluated.resolved) reportAccess(callee.property, evaluated.value, base);
 return;
 }
 }
 },

 AssignmentExpression(node) {
 const left = node.left;
 // 别名传播：saved = mgr 形式的接口来源绑定转存同样按来源归因
 if (left.type === 'Identifier' && !left.computed) {
 const base = resolveBaseExpression(node.right);
 if (base) registerDerived(left, base);
 else {
 const binding = sourceCode.getScope(left).references.find(reference => reference.identifier === left)?.resolved;
 if (binding) derivedBindings.delete(binding);
 }
 }
 // CommonJS 导出面（exports.* / module.exports = … / module.exports.* = …）
 const faceKey = exportsFaceKey(left);
 if (!faceKey) return;
 const scope = sourceCode.getScope(node);
 if (faceKey !== 'exports') {
 const binding = scope.set.get(faceKey);
 if (binding && derivedBindings.has(binding)) {
 checkExportedName(left.property, faceKey, derivedBindings.get(binding));
 return;
 }
 checkExportedName(left.property, faceKey, null);
 return;
 }
 // module.exports = {...|fn}：对象键与函数名均按导出面核验；聚合值实现引用不核（同
 // ExportDefaultDeclaration 口径——键是面名，值跟随面级别；仅 shorthand 参与）。
 if (node.right.type === 'ObjectExpression') {
 for (const prop of node.right.properties) {
 if (prop.type !== 'Property') continue;
 const evaluatedPropKey = prop.computed ? i_evaluateStaticString(prop.key, sourceCode): { resolved: true, value: prop.key.name };
 const propKey = evaluatedPropKey.resolved ? String(evaluatedPropKey.value): null;
 if (propKey) checkExportedName(prop.key, propKey, null);
 if (prop.shorthand === true && prop.value.type === 'Identifier') {
 const valueBinding = scope.set.get(prop.value.name);
 const derived = valueBinding && (derivedBindings.get(valueBinding) || moduleBindings.get(valueBinding)?.source);
 checkExportedName(prop.value, prop.value.name, derived || null);
 }
 }
 return;
 }
 if (node.right.type === 'Identifier') {
 const valueBinding = scope.set.get(node.right.name);
 const derived = valueBinding && derivedBindings.get(valueBinding);
 if (derived) checkExportedName(node.right, node.right.name, derived);
 else checkIdentifierBindingName(node.right, node.right.name);
 }
 },

 MemberExpression(node) {
 // 命名空间/默认对象成员访问统一走归因检查；父节点为 CallExpression 时
 // 由 CallExpression 分支处理 callee，避免重复上报。
 if (node.parent && node.parent.type === 'CallExpression' && node.parent.callee === node) return;
 checkMemberAccess(node);
 },

 };
 },
};

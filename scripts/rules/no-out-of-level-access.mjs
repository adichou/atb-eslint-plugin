// 先检查模块加载：跨包路径禁止，生产文件不能加载测试目录；再检查 f_/i_/t_ 接口。
// 生产侧与测试侧各自可以定义 i_，两侧不能互相访问；跨包 i_ 同样禁止。
// 提供方身份按真实模块位置识别，支持本地/包自引用/file URL、软链接、别名与模块成员。
// 依赖包的 f_ 仍由其所属项目解释；Node 内置模块不套用项目 i_ 契约。
// 测试侧导出声明由 no-wrong-access-level 核验，避免同面重复报告。
// 不执行被调模块、不推断任意返回数据类型；动态来源不可确定时沿现有归因边界停止。
import path from 'node:path';
import { i_evaluateStaticString, i_projectRootOf } from '../lib/attributions.mjs';
import { i_moduleAccess } from '../lib/module-access.mjs';

const DEFAULT_TEST_DIR = 'scripts/tests';
function f_classify(name) {
 if (name.startsWith('f_')) return 'filePrivate';
 if (name.startsWith('i_')) return 'internal';
 if (name.startsWith('t_')) return 'testOnly';
 return null;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: '模块加载先于接口权限：禁止跨包文件路径引用、生产代码加载测试模块，再检查 f_ 跨文件、i_ 跨侧/跨包与 t_ 生产消费；测试文件互相依赖由边界规则检查' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 crossPackagePath: "跨包文件路径引用 '{{target}}' 被禁止；请通过对方包名与公开入口加载",
 productionDependsOnTests: "生产文件 {{file}} 不能加载测试模块 '{{target}}'",
 unresolvedModuleTarget: '无法静态确定模块加载目标或解析基准，不能确认包与测试边界；请使用明确的模块来源',
 externalInternalAccess: "'{{name}}' 是包内接口（i_），不能跨包导入或访问",
 productionTestInternalAccess: "'{{name}}' 是测试侧的包内接口（i_），生产文件 {{file}} 禁止导入或访问",

 filePrivateAccess: "'{{name}}' 是文件私有接口（f_ 前缀），禁止跨文件导入或经模块对象访问",
 testInternalAccess: "'{{name}}' 是包内协作接口（i_ 前缀），调用方位于测试侧、提供方位于生产侧，禁止测试访问生产内部实现",
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
 const f_moduleAccess = i_moduleAccess(context, { testDir: testDirInput, testing: isTestFile });
 const sourceOf = f_moduleAccess.sourceOf;

 // 模块错误只在加载处报告，接口归因保留错误标记以避免后续成员重复报错。
 function f_checkModule(node, source) {
 if (!source.f_error || source.f_error === 'unresolvedModuleTarget') return;
 context.report({ node, messageId: source.f_error, data: { target: source.f_target || source.f_specifier, file: relative } });
 }

 // 模块绑定登记：变量绑定 → 来源模块与导出成员路径。
 const moduleBindings = new Map();
 // 模块对象和接口来源的派生绑定，支持解构、转存和同文件参数转传。
 const derivedBindings = new Map();
 function reportAccess(node, name, source) {
 if (source?.f_error) return false;
 const kind = f_classify(name);
 if (!kind) return false;
 // 外部包 i_ 禁止消费；t_ 只允许测试调用。Node 内置模块不套用项目 i_ 命名契约。
 if (source.f_external && kind === 'internal' && !source.f_specifier.startsWith('node:')) {
 context.report({ node, messageId: 'externalInternalAccess', data: { name } });
 return true;
 }
 if (source.f_external && kind !== 'testOnly') return false;
 if (kind === 'filePrivate') {
 // f_ 只允许定义文件内使用：导入与经模块对象访问一律跨文件。
 context.report({ node, messageId: 'filePrivateAccess', data: { name } });
 return true;
 }
 if (kind === 'internal') {
 if (isTestFile !== source.f_test) {
 context.report({ node, messageId: isTestFile ? 'testInternalAccess' : 'productionTestInternalAccess', data: { name, file: relative } });
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
 case 'CallExpression':
 return f_moduleAccess.call(expr)?.source || null;
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
 return f_moduleAccess.argument(arg);
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
 // 测试导出由定义侧区分内部 i_ 和对外 t_，此处避免同面双报。
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
 f_checkModule(node.source, source);
 // 按原导出名和真实提供方检查，改名不改变 i_/t_ 权限。
 for (const spec of node.specifiers) {
 if (spec.type !== 'ImportSpecifier') continue;
 // 改名导入仍检查原导出名
 reportAccess(spec.imported, spec.imported.name, source);
 }
 },

 ExportNamedDeclaration(node) {
 if (node.source) {
 const source = sourceOf(node.source.value);
 f_checkModule(node.source, source);
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

 ExportAllDeclaration(node) {
 f_checkModule(node.source, sourceOf(node.source.value));
 },

 ImportExpression(node) {
 f_checkModule(node.source, resolveLoadTarget(node.source));
 },

 VariableDeclarator(node) {
 attributeDeclarator(node);
 },

 CallExpression(node) {
 const load = f_moduleAccess.call(node);
 if (load) {
 f_checkModule(load.node, load.source);
 return;
 }
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

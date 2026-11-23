// 定义侧级别：未导出的顶层函数用 f_，导出绑定按调用范围声明 i_、t_ 或公开接口。
// 测试侧允许 i_（同包测试协作）；t_ 是对外测试接口，必须命中 main/exports 导入入口。
// 生产侧 i_ 与测试侧 i_ 的双向隔离、跨包 i_ 和 t_ 的生产消费由访问规则检查。
// 非导出绑定不能使用 i_/t_；公开/t_ 导出需位于声明入口，默认导出、再导出与 CJS 同口径。
// 返回对象的显式前缀须与句柄级别相符；测试内部句柄的 i_ 契约键可用于测试协作或模拟协议，
// 对外 t_ 句柄不能泄露 i_ 成员。无前缀数据键随句柄，不参与级别核对。
// 方法注释仅核对已有级别标注是否矛盾；根 ESLint 配置继续按宿主入口识别。
import path from 'node:path';
import { i_entryFacesOf, i_minimatch, i_projectRootOf } from '../lib/attributions.mjs';

const LEVEL_PREFIXES = ['i_', 't_'];
const DEFAULT_TEST_DIR = 'scripts/tests';
// 注释对账：级别标注词与其允许关系。
const COMMENT_TAGS = { filePrivate: '私有', internal: '内部', testOnly: '测试专用', public: '外部' };

export default {
 meta: {
 type: 'problem',
 docs: { description: '非导出方法必须以 f_ 开头（文件私有）；非导出绑定不得使用 i_/t_ 级别前缀；测试文件内部导出用 i_，对外测试导出用 t_；公开导出（含 default、类、解构、再导出与 CommonJS）须位于声明入口，根 ESLint 配置保留宿主入口身份；函数返回对象树中显式前缀键的级别须与函数同级或为 f_，无前缀键随句柄不核级，测试文件 i_ 契约键放行（返回面相干·读法 B）' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 notFilePrivate: "非导出方法 '{{name}}' 必须以 f_ 开头（文件私有）：不在导出面的方法一律 f_ 前缀",
 wrongLocalLevel: "非导出绑定 '{{name}}' 使用了级别前缀（{{prefix}}_）：非导出局部是文件私有的——函数须 f_，数据无须前缀（i_/t_ 只用于导出面）",
 testExportLevel: "测试文件导出 '{{name}}' 必须以 i_（包内测试协作）或 t_（对外测试接口）开头，文件私有实现不得导出",
 publicExportOffFace: "非入口面文件的{{kind}}导出 '{{name}}'：公开/t_ 导出属于对外接口面（manifest main/exports 声明的文件），内部文件的导出面用 i_（包内协作）或收敛为模块内部实现",
 methodCommentConflict: "方法 '{{name}}' 注释标注「{{found}}」与访问级别「{{expected}}」矛盾（{{reason}}）",
 returnLevelExceed: "函数返回对象的成员 '{{name}}' 显式声明级别（{{memberLevel}}）与句柄受众（函数级别 {{fnLevel}}）不符：返回面经句柄流动，显式前缀键只能与函数同级或为 f_（无前缀键随句柄，不核级）",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 // 测试身份：testDir（相对仓库根的相对路径，缺省 scripts/tests）目录内即测试文件，导出面只
 // 放行 t_；受检面本身交由 ESLint files 配置，本规则不设路径门。前提约束：ESLint 运行目录必须
 // 在仓库根——testDir 不支持绝对路径，传入即抛。
 const cwd = context.cwd || context.getCwd();
 const testDirInput = options.testDir || DEFAULT_TEST_DIR;
 if (path.isAbsolute(testDirInput)) {
 throw new Error(`testDir 必须是相对仓库根的相对路径（前提约束：ESLint 运行目录必须在仓库根），不接受绝对路径：${testDirInput}`);
 }
 const testDir = path.resolve(cwd, testDirInput);
 const filename = path.resolve(context.filename || context.getFilename());
 const isTestFile = !path.relative(testDir, filename).split(path.sep).join('/').startsWith('../');

 // 非导出方法必须 f_ 前缀；导出方法（含 export 名单成员）不做检查。
 function checkBinding(idNode, name, exported) {
 if (exported || name.startsWith('f_')) return;
 context.report({ node: idNode, messageId: 'notFilePrivate', data: { name } });
 }

 // 非导出绑定不得携带级别前缀 i_/t_（数据无须前缀；函数已由 checkBinding 要求 f_）。
 function checkLevelPrefix(idNode, name, exported) {
 if (exported) return;
 const prefix = LEVEL_PREFIXES.find((p) => name.startsWith(p));
 if (prefix) {
 context.report({ node: idNode, messageId: 'wrongLocalLevel', data: { name, prefix: prefix.replace('_', '') } });
 }
 }

 // 测试导出按面名区分 i_ 内部协作与 t_ 对外接口，不以本地别名绕过。
 function checkTestExport(idNode, surfaceName) {
 if (!isTestFile || surfaceName.startsWith('i_') || surfaceName.startsWith('t_')) return;
 context.report({ node: idNode, messageId: 'testExportLevel', data: { name: surfaceName } });
 }

 // 入口面核验：公开及对外 t_ 导出只能挂在声明的 JS 导入入口（manifest
 // main/exports 目标）上；i_ 导出（包内协作）与 f_ 导出（filePrivateExport 另议）不在此列。
 // 无包锚（projectRootOf null）时跳过——谈 main/exports 面无从谈起。
 const projectRoot = i_projectRootOf(filename);
 const entryFaces = projectRoot === null ? null : i_entryFacesOf(projectRoot);
 const relativeRoot = projectRoot === null ? null : path.relative(projectRoot, filename).split(path.sep).join('/');
 const onImportFace = projectRoot !== null
 && (entryFaces.importFaces.has(filename)
 || entryFaces.patterns.some((pattern) => i_minimatch(relativeRoot, pattern)));
 function checkFaceExport(idNode, surfaceName) {
 if (onImportFace || isTestFile && !surfaceName.startsWith('t_')) return;
 if (surfaceName.startsWith('f_') || surfaceName.startsWith('i_')) return;
 const kind = surfaceName.startsWith('t_') ? ' t_': ' 公开';
 context.report({ node: idNode, messageId: 'publicExportOffFace', data: { name: surfaceName, kind } });
 }

 // 所有导出形式共用同一入口，避免默认、解构或 CJS 绕过级别检查。
 function f_checkExport(node, name) {
 checkTestExport(node, name);
 checkFaceExport(node, name);
 }

 // 解构的面名来自绑定标识符，不把对象的源属性名误当成导出名。
 function f_bindingIdentifiers(pattern) {
 if (!pattern) return [];
 if (pattern.type === 'Identifier') return [pattern];
 if (pattern.type === 'RestElement') return f_bindingIdentifiers(pattern.argument);
 if (pattern.type === 'AssignmentPattern') return f_bindingIdentifiers(pattern.left);
 if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(f_bindingIdentifiers);
 if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap(prop => f_bindingIdentifiers(prop.type === 'RestElement' ? prop.argument : prop.value));
 return [];
 }

 // CJS 计算键仅求稳定字符串；循环常量和运行时表达式按未知面名处理，不执行源码。
 function f_staticExportKey(node, seen = new Set()) {
 if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
 if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
 if (node.type === 'BinaryExpression' && node.operator === '+') {
 const left = f_staticExportKey(node.left, seen), right = f_staticExportKey(node.right, seen);
 return left !== null && right !== null ? left + right : null;
 }
 if (node.type !== 'Identifier') return null;
 let scope = sourceCode.getScope(node);
 while (scope) {
 const binding = scope.set.get(node.name);
 if (binding) {
 const def = binding.defs[0];
 if (seen.has(binding) || binding.references.some(ref => ref.isWrite() && !ref.init)
 || def?.type !== 'Variable' || def.parent?.kind !== 'const' || !def.node.init) return null;
 return f_staticExportKey(def.node.init, new Set([...seen, binding]));
 }
 scope = scope.upper;
 }
 return null;
 }

 function f_memberKey(node) {
 return node.computed ? f_staticExportKey(node.property) : node.property.name;
 }

 // 只识别真实 CJS 全局；参数或局部变量名为 module/exports 时属于普通对象。
 function f_isCjsGlobal(node, name) {
 if (node.type !== 'Identifier' || node.name !== name) return false;
 let scope = sourceCode.getScope(node);
 while (scope) {
 const binding = scope.set.get(name);
 if (binding) return binding.defs.length === 0;
 scope = scope.upper;
 }
 return true;
 }

 function f_cjsExport(left) {
 if (left.type !== 'MemberExpression') return null;
 const name = f_memberKey(left) ?? '*';
 if (f_isCjsGlobal(left.object, 'exports')) return { name, node: left.property };
 if (f_isCjsGlobal(left.object, 'module') && name === 'exports') return { name: 'default', node: left, whole: true };
 const object = left.object;
 if (object.type === 'MemberExpression' && f_isCjsGlobal(object.object, 'module') && f_memberKey(object) === 'exports') {
 return { name, node: left.property };
 }
 return null;
 }

 // 顶层变量声明统一入口：函数值走 f_ 检查，任意值走级别前缀检查（导出者跳过）。
 function checkDeclarator(declarator, exported) {
 if (declarator.id.type !== 'Identifier') return;
 const isFunctionValue = declarator.init
 && ['ArrowFunctionExpression', 'FunctionExpression'].includes(declarator.init.type);
 if (isFunctionValue) checkBinding(declarator.id, declarator.id.name, exported);
 else checkLevelPrefix(declarator.id, declarator.id.name, exported);
 }

 // ---------- 返回面相干：return 对象树里键级别 ∈ {函数级别, f_} ----------
 const isExportParent = (node) => Boolean(node && (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'));
 const keyName = (key) => {
 if (key.type === 'Identifier') return key.name;
 if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
 return null;
 };
 const levelOfName = (name) => {
 if (name && name.startsWith('f_')) return 'f_';
 if (name && name.startsWith('i_')) return 'i_';
 if (name && name.startsWith('t_')) return 't_';
 return '公开';
 };
 // 导出面对象：export default {…} / export const x = {…} / module.exports = {…}——键是接口面。
 const isExportFaceObject = (obj) => {
 const parent = obj && obj.parent;
 if (!parent) return false;
 if (parent.type === 'ExportDefaultDeclaration') return true;
 if (parent.type === 'VariableDeclarator') {
 const decl = parent.parent;
 return Boolean(decl && decl.type === 'VariableDeclaration' && decl.parent && isExportParent(decl.parent));
 }
 if (parent.type === 'AssignmentExpression' && parent.left.type === 'MemberExpression' && !parent.left.computed
 && parent.left.object.type === 'Identifier' && parent.left.object.name === 'module'
 && parent.left.property.type === 'Identifier' && parent.left.property.name === 'exports') return true;
 return false;
 };
 // 函数自身级别：匿名箭头无自己的名字，按无前缀=公开参与返回面相干（绑定名是变量的名字，
 // 不改变函数本身的无名事实）；其余按名字前缀优先，无前缀时导出（顶层导出、导出面对象键、
 // 导出类方法）=公开，再其余（非导出顶层与命名抽屉形态）=f_——按名字拿不走，真实可达面就是本文件。
 const functionLevel = (fnNode) => {
 if (fnNode.type === 'ArrowFunctionExpression') return '公开';
 let name = null;
 let exportFace = false;
 if (fnNode.type === 'FunctionDeclaration' && fnNode.id) {
 name = fnNode.id.name;
 exportFace = isExportParent(fnNode.parent);
 } else if (fnNode.parent && fnNode.parent.type === 'VariableDeclarator' && fnNode.parent.id.type === 'Identifier') {
 name = fnNode.parent.id.name;
 const decl = fnNode.parent.parent;
 exportFace = Boolean(decl && decl.type === 'VariableDeclaration' && decl.parent && isExportParent(decl.parent));
 } else if (fnNode.parent && fnNode.parent.type === 'Property') {
 name = keyName(fnNode.parent.key);
 exportFace = isExportFaceObject(fnNode.parent.parent);
 } else if (fnNode.parent && fnNode.parent.type === 'MethodDefinition') {
 name = keyName(fnNode.parent.key);
 const cls = fnNode.parent.parent && fnNode.parent.parent.parent;
 exportFace = Boolean(cls && isExportParent(cls.parent));
 }
 const named = levelOfName(name);
 return named !== '公开' ? named : (exportFace ? '公开' : 'f_');
 };
 const isFunctionNode = (node) => node.type === 'FunctionDeclaration'
 || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
 const checkMemberLevel = (keyNode, name, fnLevel) => {
 // PascalCase 键是框架协议分派名（ESLint visitor 的 AST 节点名等），不是级别声明，不参与。
 if (/^[A-Z]/.test(name)) return;
 const memberLevel = levelOfName(name);
 // 读法 B：无前缀键不是级别声明，受众由句柄封顶，不参与核级。
 if (memberLevel === '公开') return;
 // 测试内部句柄的 i_ 成员用于协作或 mock 协议；对外 t_ 句柄不能泄露包内成员。
 if (isTestFile && memberLevel === 'i_' && fnLevel !== 't_') return;
 if (memberLevel === fnLevel || memberLevel === 'f_') return;
 context.report({
 node: keyNode,
 messageId: 'returnLevelExceed',
 data: { name, memberLevel, fnLevel },
 });
 };
 // 全文件下行：进入函数节点换用其自身级别；ReturnStatement 的对象字面量开启返回面语境，
 // 语境内的显式前缀键（方法与数据键）逐个核级（无前缀键随句柄不核，读法 B）；引用返回与
 // 顶层数组返回不开语境（静态边界）。
 const walkLevels = (node, fnLevel, inReturnTree) => {
 if (!node || typeof node.type !== 'string') return;
 const isFn = isFunctionNode(node);
 const level = isFn ? functionLevel(node) : fnLevel;
 if (!isFn && inReturnTree && node.type === 'Property' && node.parent && node.parent.type === 'ObjectExpression' && !node.computed) {
 const name = keyName(node.key);
 if (name !== null) checkMemberLevel(node.key, name, level);
 }
 // 箭头简洁体（() => ({…})）即隐式 return，同样开启返回面语境；函数体一律不继承外层语境。
 const implicitTree = node.type === 'ArrowFunctionExpression' && Boolean(node.body) && node.body.type === 'ObjectExpression';
 const childInTree = isFn ? implicitTree
 : inReturnTree || (node.type === 'ReturnStatement' && Boolean(node.argument) && node.argument.type === 'ObjectExpression');
 for (const key of Object.keys(node)) {
 if (['parent', 'loc', 'range', 'tokens'].includes(key)) continue;
 const value = node[key];
 if (Array.isArray(value)) value.forEach((item) => walkLevels(item, level, childInTree));
 else if (value && typeof value === 'object' && typeof value.type === 'string') walkLevels(value, level, childInTree);
 }
 };

 // ---------- 注释对账（原 no-wrong-access-comment 并入）：定义紧邻注释的级别标注核验 ----------
 const sourceCode = context.sourceCode || context.getSourceCode();
 const f_definedName = (node) => {
 if (node.type === 'MethodDefinition' || node.type === 'Property' || node.type === 'PropertyDefinition') {
 if (node.computed) return null;
 if (node.key.type === 'Identifier') return node.key.name;
 if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value;
 return null;
 }
 return node.id ? node.id.name : null;
 };
 const f_isExportedDefinition = (node) => {
 let current = node.parent;
 while (current) {
 if (current.type === 'ExportNamedDeclaration' || current.type === 'ExportDefaultDeclaration') return true;
 if (current.type === 'Program' || current.type === 'CallExpression') return false;
 current = current.parent;
 }
 return false;
 };
 // 标注与 (前缀分类, 导出情况) 的允许关系：不符即矛盾。
 const f_allowedTags = (kind, exported) => {
 if (kind === 'filePrivate') return new Set([COMMENT_TAGS.filePrivate]);
 if (kind === 'internal') return new Set([COMMENT_TAGS.internal]);
 if (kind === 'testOnly') return new Set([COMMENT_TAGS.testOnly]);
 return exported ? new Set([COMMENT_TAGS.internal, COMMENT_TAGS.public]) : null;
 };
 // 定义紧邻的连续注释块（无空行间隔）内出现的级别标注集合。
 const f_annotationTags = (anchorNode, fallbackNode) => {
 const comments = sourceCode.getCommentsBefore(anchorNode);
 if (!comments.length) return [];
 const last = comments[comments.length - 1];
 const definitionLine = (fallbackNode || anchorNode).loc.start.line;
 if (definitionLine - last.loc.end.line > 1) return [];
 const block = [last];
 for (let i = comments.length - 2; i >= 0; i -= 1) {
 if (last.loc.start.line - comments[i].loc.end.line > 1) break;
 block.unshift(comments[i]);
 }
 const text = block.map((c) => (c.type === 'Block' ? c.value.replace(/\*/g, ' ') : c.value)).join('\n');
 const found = new Set();
 for (const tag of Object.values(COMMENT_TAGS)) {
 const tagAtLineStart = new RegExp(`(?:^|\\n)\\s*\\*?\\s*${tag}\\s*[：:]`);
 if (tagAtLineStart.test(text)) found.add(tag);
 }
 return [...found];
 };
 function checkDefinitionComment(node) {
 if ((node.type === 'MethodDefinition' || node.type === 'Property' || node.type === 'PropertyDefinition')
 && (!node.value || !['FunctionExpression', 'ArrowFunctionExpression'].includes(node.value.type))) return;
 const name = f_definedName(node);
 if (!name) return;
 const kind = name.startsWith('f_') ? 'filePrivate' : name.startsWith('i_') ? 'internal' : name.startsWith('t_') ? 'testOnly' : 'public';
 // 导出函数的注释锚点取 export 语句（注释紧邻 export 关键字之前）。
 const anchor = node.type === 'FunctionDeclaration' && node.parent
 && (node.parent.type === 'ExportNamedDeclaration' || node.parent.type === 'ExportDefaultDeclaration') ? node.parent : node;
 const present = f_annotationTags(anchor, node);
 if (present.length === 0) return; // 缺失不报：级别由使用方自行声明，本规则只对账已声明者
 const exported = f_isExportedDefinition(node);
 const allowed = f_allowedTags(kind, exported);
 if (!allowed) return;
 const conflicts = present.filter((tag) => !allowed.has(tag));
 if (conflicts.length === 0) return;
 const reason = exported && kind === 'public' ? '无前缀方法已对外导出，不得标注私有/测试专用'
 : exported ? '导出方法级别由注释声明，须为 内部 或 外部'
 : `与方法名前缀不符，${kind === 'filePrivate' ? 'f_ 方法只能标注 私有' : kind === 'internal' ? 'i_ 方法只能标注 内部' : 't_ 方法只能标注 测试专用'}`;
 context.report({
 node: node.type === 'FunctionDeclaration' ? node.id : node.key,
 messageId: 'methodCommentConflict',
 data: { name, found: conflicts.join('／'), expected: [...allowed].join('／'), reason },
 });
 }

 return {
 AssignmentExpression(node) {
 const face = f_cjsExport(node.left);
 if (!face) return;
 if (face.whole && node.right.type === 'ObjectExpression' && node.right.properties.length > 0) {
 for (const prop of node.right.properties) {
 const name = prop.type === 'SpreadElement' ? '*' : (prop.computed ? f_staticExportKey(prop.key) : keyName(prop.key));
 f_checkExport(prop.type === 'SpreadElement' ? prop : prop.key, name ?? '*');
 }
 } else f_checkExport(face.node, face.name);
 },
 MethodDefinition: checkDefinitionComment,
 Property: checkDefinitionComment,
 PropertyDefinition: checkDefinitionComment,
 FunctionDeclaration: checkDefinitionComment,
 Program(programNode) {
 // 导出名单：export 列表（无 source）把既有顶层绑定挂入导出面。
 const exportedNames = new Set();
 for (const stmt of programNode.body) {
 if (stmt.type === 'ExportDefaultDeclaration' && stmt.declaration.type === 'Identifier') exportedNames.add(stmt.declaration.name);
 if (stmt.type === 'ExportNamedDeclaration' && !stmt.source) {
 for (const spec of stmt.specifiers) exportedNames.add(spec.local.name);
 }
 }
 const isExported = (name) => exportedNames.has(name);
 for (const stmt of programNode.body) {
 if (stmt.type === 'ExportDefaultDeclaration') {
 f_checkExport(stmt, 'default');
 continue;
 }
 if (stmt.type === 'ExportAllDeclaration') {
 f_checkExport(stmt.exported || stmt, stmt.exported?.name ?? stmt.exported?.value ?? '*');
 continue;
 }
 if (stmt.type === 'FunctionDeclaration' && stmt.id) {
 checkBinding(stmt.id, stmt.id.name, isExported(stmt.id.name));
 continue;
 }
 if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
 const decl = stmt.declaration;
 if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
 if (decl.type === 'FunctionDeclaration') checkBinding(decl.id, decl.id.name, true);
 f_checkExport(decl.id, decl.id.name);
 } else if (decl.type === 'VariableDeclaration') {
 for (const declarator of decl.declarations) {
 checkDeclarator(declarator, true);
 for (const id of f_bindingIdentifiers(declarator.id)) f_checkExport(id, id.name);
 }
 }
 continue;
 }
 // export 名单与 re-export（含 source）：导出面以 exported 面名核验，测试文件非 t_ 即报。
 if (stmt.type === 'ExportNamedDeclaration') {
 for (const spec of stmt.specifiers) {
 const surfaceName = spec.exported.name ?? String(spec.exported.value ?? spec.local.name);
 f_checkExport(spec.exported, surfaceName);
 }
 continue;
 }
 if (stmt.type === 'VariableDeclaration') {
 for (const declarator of f_declSafe(stmt)) checkDeclarator(declarator, isExported(declarator.id.type === 'Identifier' ? declarator.id.name: ''));
 }
 }
 // 返回面相干驱动：全文件下行，函数级别在进入函数节点时重算。
 for (const stmt of programNode.body) walkLevels(stmt, 'f_', false);
 },
 };
 },
};

// 私有：VariableDeclaration 的声明列表取值（避免主循环内重复判空）。
function f_declSafe(statement) {
 return statement.declarations || [];
}

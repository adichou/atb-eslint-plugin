// atb/no-wrong-access-level — 非导出方法必须以 f_ 开头（文件私有），测试文件导出面必须 t_。
// ATB 访问级别政策：生产文件的导出级别由使用方自行声明（本规则不检查生产导出面）；凡不在
// 导出面的顶层方法一律 f_ 前缀——文件私有，跨文件消费边界由 no-out-of-level-access 承接。
// 级别前缀只属于导出面：非导出绑定不得使用 i_/t_ 前缀（i_ 是生产包内协作级别、t_ 是测试
// 专用级别，非导出局部就是文件私有——函数须 f_，数据无须前缀）。
// 测试文件（testDir 目录内）导出面只放行 t_：具名导出（声明、名单、re-export 同口径，面名
// 以 exported 名为准）非 t_ 一律报——无前缀导出即公开接口，生产引用即绕过 t_ 边界。默认导出
// 无名字面，不参与 t_ 要求；CommonJS 导出面不在本规则（生态测试文件为 ESM；生产文件的 CJS
// 导出面仍由 no-out-of-level-access 核验，测试 CJS 导出面两头均不检，如实留白）。
// 本规则不设路径门：受检面由 ESLint files 配置决定（flat config 的 files 即管辖边界，配置
// 基准路径之外的文件本就不会路由进来）。testDir 支持绝对路径或相对 ESLint 运行目录的相对
// 路径（缺省 scripts/tests，与工厂 testDir 同名透传）；相对值以从仓库根运行 ESLint 为前提，
// 无法保证运行目录时（monorepo 子包、IDE workingDirectories）传绝对路径。
// 检查面：模块顶层 FunctionDeclaration 与顶层函数值绑定（const/let/var = function/arrow）；
// 非函数值的顶层变量绑定只查 i_/t_ 前缀（数据常量不要求 f_）；类/对象方法与嵌套函数不查
// f_（按名字拿不走，f_ 的检查机制无从下手）。返回面相干：函数 return 的对象字面量整棵树
//（嵌套对象/数组、方法与数据键）里，显式带 i_/t_/f_ 前缀的键，级别必须与函数同级或为 f_——
// 前缀是牌子，牌子与句柄受众不符即假牌子：公开工厂藏 t_ 方法、i_ 工厂藏 t_ 键、t_ 工厂挂 i_ 名
// 均报。无前缀键不是级别声明（读法 B）：受众由句柄封顶——i_ 函数返回 { query() {} } 的 query
// 随句柄封顶在生产包内，名字无跨受众宣称，不参与核级；线协议字段名、框架契约键等不可带
// 前缀的名字因此不受累。测试文件例外：显式 i_ 键是 mock 实现生产契约的唯一合法拼写
//（测试导出必须 t_、非导出绑定禁 i_，i_ 名只能落在成员键上），放行；t_ 键不放行（注入
// 生产即越权消费）。函数级别：匿名箭头无名字按无前缀=公开；命名函数名字前缀优先，
// 无前缀时导出（顶层导出、导出面对象键、导出类方法）=公开，其余抽屉形态一律 f_。引用返回
// 与顶层数组返回不追（不执行函数、不做数据流，如实声明）；导出面对象键
//（export default {…} / export const x = {…}）是接口面，归 no-out-of-level-access。无豁免：
// 初始化序列、未被引用的顶层方法同样要求 f_（未被引用另有无用代码规则表态）。
import path from 'node:path';

const LEVEL_PREFIXES = ['i_', 't_'];
const DEFAULT_TEST_DIR = 'scripts/tests';

export default {
 meta: {
 type: 'problem',
 docs: { description: '非导出方法必须以 f_ 开头（文件私有）；非导出绑定不得使用 i_/t_ 级别前缀；测试文件导出面必须 t_；函数返回对象树中显式前缀键的级别须与函数同级或为 f_，无前缀键随句柄不核级，测试文件 i_ 契约键放行（返回面相干·读法 B）' },
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
 testExportLevel: "测试文件导出 '{{name}}' 必须以 t_ 开头（测试专用级别）：测试协作接口一律 t_——无前缀导出即公开接口，生产引用即绕过 t_ 边界",
 returnLevelExceed: "函数返回对象的成员 '{{name}}' 显式声明级别（{{memberLevel}}）与句柄受众（函数级别 {{fnLevel}}）不符：返回面经句柄流动，显式前缀键只能与函数同级或为 f_（无前缀键随句柄，不核级）",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 // 测试身份：testDir（绝对路径或相对 ESLint 运行目录，缺省 scripts/tests）目录内即测试文件，
 // 导出面只放行 t_；受检面本身交由 ESLint files 配置，本规则不设路径门。
 const cwd = context.cwd || context.getCwd();
 const testDir = path.resolve(cwd, options.testDir || DEFAULT_TEST_DIR);
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

 // 测试文件导出面只放行 t_：面名（exported 名）非 t_ 即报，与本地名、别名方向无关。
 function checkTestExport(idNode, surfaceName) {
 if (!isTestFile || surfaceName.startsWith('t_')) return;
 context.report({ node: idNode, messageId: 'testExportLevel', data: { name: surfaceName } });
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
 // 测试文件里显式 i_ 键的唯一合法含义是 mock 实现生产契约：测试导出必须 t_、非导出绑定禁
 // i_，i_ 名只能落在成员键上，句柄（f_/匿名箭头）与契约键的错级即 mock 形态本身，放行；
 // t_ 键不放行（注入生产即越权消费）。
 if (isTestFile && memberLevel === 'i_') return;
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

 return {
 Program(programNode) {
 // 导出名单：export 列表（无 source）把既有顶层绑定挂入导出面。
 const exportedNames = new Set();
 for (const stmt of programNode.body) {
 if (stmt.type === 'ExportNamedDeclaration' && !stmt.source) {
 for (const spec of stmt.specifiers) exportedNames.add(spec.local.name);
 }
 }
 const isExported = (name) => exportedNames.has(name);
 for (const stmt of programNode.body) {
 if (stmt.type === 'FunctionDeclaration' && stmt.id) {
 checkBinding(stmt.id, stmt.id.name, isExported(stmt.id.name));
 continue;
 }
 if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
 const decl = stmt.declaration;
 if (decl.type === 'FunctionDeclaration' && decl.id) {
 checkBinding(decl.id, decl.id.name, true);
 checkTestExport(decl.id, decl.id.name);
 } else if (decl.type === 'VariableDeclaration') {
 for (const declarator of decl.declarations) {
 checkDeclarator(declarator, true);
 if (declarator.id.type === 'Identifier') checkTestExport(declarator.id, declarator.id.name);
 }
 }
 continue;
 }
 // export 名单与 re-export（含 source）：导出面以 exported 面名核验，测试文件非 t_ 即报。
 if (stmt.type === 'ExportNamedDeclaration') {
 for (const spec of stmt.specifiers) {
 checkTestExport(spec.exported, spec.exported.name ?? String(spec.exported.value ?? spec.local.name));
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

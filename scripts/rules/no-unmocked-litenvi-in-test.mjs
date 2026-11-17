// atb/no-unmocked-litenvi-in-test — litenvi 门面 mock 装配纪律（litenvi 内存世界铁律的静态承载）。
// 本规则不设路径门：受检面由 ESLint files 配置决定（flat config 的 files 即管辖边界，配置基准
// 路径之外的文件本就不会路由进来，同 no-wrong-access-level 口径）——路由进来的每个 node:test
// 用例：回调内直接使用需开关的 litenvi 门面（默认导入对象或具名对象绑定，如 liteFs.writeFileSync /
// liteChildProcess.spawn / liteProcess.cwd）时，回调作用域或其调用的 helper 链（同文件函数
// 与相对导入 helper 的导出函数，递归两层）内须存在该门面的 t_mock/t_install 开关调用与
// t_unmock 配对——缺任一即报错，防止测试未装配内存世界而真实启进程、触网或落盘。装配覆盖面
// 另计入两处底盘：模块体顶层装配（import 即 mock）与 node:test 生命周期钩子（beforeEach/
// afterEach/before/after 回调内的共享 helper 装配）。无开关模块（lite-browser/lite-cmd-mgr/
// lite-cmd-node/lite-cmd-os）豁免。静态边界（如实声明）：不判调用顺序（先使用后装配不报）、
// 不追动态 import 与运行时传值、helper 内部自身的门面使用不在本规则判定（只看用例回调的
// 直接使用面）；清理是否真实生效由运行时与评审验证。诊断按门面模块 + 用例名 + 所需开关定位。
import path from 'node:path';
import fs from '../../../litenvi-node/scripts/lite-fs.mjs';

// 门面 → 所需开关（t_mock 或 t_install）；未列出的 lite 模块视为无开关、豁免
const DEFAULT_SWITCHES = {
 'lite-fs': 't_mock', 'lite-child_process': 't_mock', 'lite-process': 't_mock',
 'lite-http': 't_mock', 'lite-server': 't_mock', 'lite-timer': 't_mock',
 'lite-browser-timer': 't_mock', 'lite-cmd-git': 't_install',
};
const LITE_PREFIX = 'litenvi-node/';

// 私有：模块名归一（lite-xxx.mjs → lite-xxx）；非 lite specifier 返回 null。
function f_moduleOf(specifier) {
 if (!specifier.startsWith(LITE_PREFIX)) return null;
 const file = specifier.slice(LITE_PREFIX.length);
 return file.endsWith('.mjs') ? file.slice(0, -4): file;
}

// 私有：模块名 → 中文说明（诊断用）。
function f_label(module) {
 return `${LITE_PREFIX}${module}.mjs`;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: 'litenvi 门面 mock 装配纪律：用例直接使用需开关门面须完成装配与复位（litenvi 铁律）' },
 schema: [{
 type: 'object',
 properties: {
 testRunnerSource: { type: 'string' },
 switches: { type: 'object', additionalProperties: { type: 'string', enum: ['t_mock', 't_install'] } },
 helperDepth: { type: 'integer', minimum: 1, maximum: 5 },
 },
 additionalProperties: false,
 }],
 messages: {
 missingSwitch: "用例「{{test}}」直接使用 {{module}}，但用例作用域及调用的 helper 链内没有对应的 {{switch}} 装配——测试须先装配内存世界（或经共享 helper 装配），不得未 mock 使用 lite 门面",
 missingUnmock: "用例「{{test}}」使用 {{module}} 且有 {{switch}} 装配，但 helper 链内缺少 t_unmock 复位——进程级单例状态会泄漏到后续用例",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 const runnerSource = options.testRunnerSource || 'node:test';
 const switches = { ...DEFAULT_SWITCHES, ...(options.switches || {}) };
 const helperDepth = options.helperDepth || 6;
 // 不设路径门与豁免清单：受检面由 ESLint files 配置决定，files 外文件本就不会路由进来。
 const sourceCode = context.sourceCode;
 // import 绑定位于模块子作用域而非 globalScope.variables，遍历全部作用域收集
 const allVariables = sourceCode.scopeManager.scopes.flatMap((s) => s.variables);

 // —— 导入归因：门面模块 → 绑定名集合（对象绑定与开关具名绑定分开记） ——
 const faceBindings = new Map(); // bindingName -> module（对象门面：默认导入或 lite* 具名对象）
 const switchBindings = new Map(); // bindingName -> { module, kind }（t_mock/t_install 具名导入直呼）
 const testNames = new Set();
 const helperImports = new Map(); // bindingName -> 绝对路径（本仓相对导入的 helper）
 for (const variable of allVariables) {
 const def = variable.defs.find((d) => d.type === 'ImportBinding');
 if (!def || !['ImportDefaultSpecifier', 'ImportSpecifier'].includes(def.node.type)) continue;
 const declaration = def.parent;
 const module = f_moduleOf(declaration.source.value);
 if (module) {
 if (def.node.type === 'ImportDefaultSpecifier') faceBindings.set(variable.name, module);
 else if (switches[module] && def.node.imported.name === switches[module])
 switchBindings.set(variable.name, { module, kind: switches[module] });
 else if (def.node.type === 'ImportSpecifier' && /^lite/.test(def.node.imported.name))
 faceBindings.set(variable.name, module);
 } else if (declaration.source.value.startsWith('.') && def.node.type === 'ImportDefaultSpecifier') {
 try {
 helperImports.set(variable.name, path.resolve(path.dirname(context.filename), declaration.source.value));
 } catch {
 // 无法解析的相对导入按无 helper 处理：显式确保未登记（no-silent-catch 口径）
 helperImports.delete(variable.name);
 }
 } else if (declaration.source.value.startsWith('.') && def.node.type === 'ImportSpecifier') {
 try {
 helperImports.set(variable.name, path.resolve(path.dirname(context.filename), declaration.source.value));
 } catch {
 helperImports.delete(variable.name); // 同上：显式确保未登记
 }
 }
 if (declaration.source.value === runnerSource) testNames.add(def.node.local.name);
 }
 if (!testNames.size) return {};

 // —— helper 解析：按文件建立「顶层函数名 → 源码段」表（列 0 声明边界，不要求 export——
 // 跨文件链含 openBoard → ensureServer 这类非导出协作函数），导入名单按文件缓存 ——
 const helperCache = new Map();
 // 私有：读文件源码（lite-fs 门面：真实仓库透传真实 fs，内存夹具读内存卷）。
 function f_helperSource(file) {
 if (helperCache.has(file)) return helperCache.get(file);
 let source = null;
 try { source = fs.readFileSync(file, 'utf8'); } catch { source = null; }
 helperCache.set(file, source);
 return source;
 }
 const functionTableCache = new Map();
 // 私有：文件顶层函数源码段表——function 声明与 const 箭头函数，段截止到下一个列 0 顶层
 // 声明（本仓约定）；不做花括号配对，避免参数默认值/模板串的 { } 截断。
 function f_fileFunctions(file) {
 if (functionTableCache.has(file)) return functionTableCache.get(file);
 const table = new Map();
 const source = f_helperSource(file);
 if (source != null) {
 const lines = source.split('\n');
 const heads = [];
 lines.forEach((line, index) => {
 const match = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(|^(?:export\s+)?const\s+(\w+)\s*=/);
 if (match) heads.push({ name: match[1] || match[2], start: index });
 });
 heads.forEach((head, index) => {
 const end = index + 1 < heads.length ? heads[index + 1].start: lines.length;
 table.set(head.name, lines.slice(head.start, end).join('\n'));
 });
 }
 functionTableCache.set(file, table);
 return table;
 }
 // 私有：模块顶层片段（源码剔除顶层函数段；模块体的装配调用在用例前执行，作为覆盖底盘）。
 const moduleTopCache = new Map();
 function f_moduleTopFragment(file) {
 if (moduleTopCache.has(file)) return moduleTopCache.get(file);
 const source = f_helperSource(file);
 let fragment = null;
 if (source != null) {
 const lines = source.split('\n');
 const heads = [];
 lines.forEach((line, lineNumber) => {
 if (/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+\s*\(|^(?:export\s+)?const\s+\w+\s*=/.test(line)) heads.push(lineNumber);
 });
 const inFunction = new Array(lines.length).fill(false);
 heads.forEach((start, i) => {
 const isConst = !/\bfunction\s+\w+\s*\(/.test(lines[start]);
 let end = i + 1 < heads.length ? heads[i + 1]: lines.length;
 if (isConst) {
 // 顶层 const 只占自身语句（到下一个列 0 非空行）——不吞掉后续的顶层装配调用
 end = start + 1;
 while (end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end += 1;
 }
 for (let n = start; n < end; n++) inFunction[n] = true;
 });
 // 只认列 0 语句：模板字符串里嵌的代码文本与函数体缩进行不得混入模块体底盘
 fragment = lines.filter((line, lineNumber) => !inFunction[lineNumber] && line !== '' && !/^\s/.test(line)).join('\n');
 }
 moduleTopCache.set(file, fragment);
 return fragment;
 }
 const fileImportsCache = new Map();
 // 私有：文件自身的相对导入名单（行式：名字 → 绝对路径），供跨文件链递归。
 function f_fileImports(file) {
 if (fileImportsCache.has(file)) return fileImportsCache.get(file);
 const source = f_helperSource(file);
 const names = new Map();
 if (source != null) {
 for (const match of source.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"](\.[^'"]+)['"]/g)) {
 const target = path.resolve(path.dirname(file), match[3]);
 if (match[2]) names.set(match[2], target);
 else for (const part of match[1].split(',')) {
 const named = part.trim().match(/(\w+)(?:\s+as\s+(\w+))?/);
 if (named) names.set(named[2] || named[1], target);
 }
 }
 }
 fileImportsCache.set(file, names);
 return names;
 }

 // 私有：在函数体源码片段内识别门面开关调用（对象方法或具名直呼，含别名）。
 function f_switchesInSource(fragment) {
 const found = new Set();
 for (const [binding, module] of faceBindings) {
 const kind = switches[module];
 if (kind && new RegExp(`\\b${binding}\\.${kind}\\s*\\(|\\b${binding}\\.t_unmock\\s*\\(`).test(fragment)) found.add(module);
 }
 for (const [binding, { module }] of switchBindings) {
 if (new RegExp(`\\b${binding}\\s*\\(`).test(fragment)) found.add(module);
 }
 return found;
 }
 // 私有：收集用例回调可达的开关覆盖面（回调片段 + 逐层 helper 片段，环与深度受限）。
 function f_coverage(callbackNode) {
 const coverage = new Map(); // module -> { on: boolean, off: boolean }
 const f_record = (fragment) => {
 for (const module of f_switchesInSource(fragment)) {
 const kind = switches[module];
 const entry = coverage.get(module) || { on: false, off: false };
 const binding = [...faceBindings.entries()].find(([, m]) => m === module)?.[0];
 if (binding) {
 if (new RegExp(`\\b${binding}\\.${kind}\\s*\\(`).test(fragment)) entry.on = true;
 if (new RegExp(`\\b${binding}\\.t_unmock\\s*\\(`).test(fragment)) entry.off = true;
 }
 for (const [name, { module: m }] of switchBindings) {
 if (m === module && new RegExp(`\\b${name}\\s*\\(`).test(fragment)) entry.on = true;
 }
 coverage.set(module, entry);
 }
 };
 const visited = new Set();
 // 私有：递归扫描片段——先记录开关，再沿「同文件顶层函数」与「相对导入」两级展开
 //（openBoard → ensureServer 非导出协作函数与跨文件导入一视同仁；环与深度受限）。
 const f_scan = (fragment, file, depth) => {
 if (depth < 0 || visited.has(fragment)) return;
 visited.add(fragment);
 f_record(fragment);
 if (depth <= 0) return;
 for (const [fname, body] of f_fileFunctions(file)) {
 if (new RegExp(`\\b${fname}\\s*\\(`).test(fragment)) f_scan(body, file, depth - 1);
 }
 for (const [iname, target] of f_fileImports(file)) {
 if (!new RegExp(`\\b${iname}\\s*[.(]`).test(fragment)) continue;
 const imported = f_fileFunctions(target).get(iname) || f_helperSource(target) || '';
 f_scan(imported, target, depth - 1);
 }
 };
 f_scan(sourceCode.getText(callbackNode.body), context.filename, helperDepth);
 // 模块体装配底盘：import 即 mock（模块顶层 t_mock/t_install）先于任何用例执行——
 // 顶层片段 = 文件源码剔除全部顶层函数段后的行，不把函数内的开关误当模块级装配。
 const moduleTop = f_moduleTopFragment(context.filename);
 if (moduleTop) f_record(moduleTop);
 return coverage;
 }

 // —— 用例回调：直接使用面 vs 覆盖面 ——
 function f_checkCase(node, testName) {
 const used = new Set();
 const switchCalled = new Set();
 const seen = new Set();
 // 遍历回调子树：门面对象成员访问记使用；开关调用（对象方法/具名直呼）记装配
 // （跳过 parent/tokens 等非语法字段防循环引用）
 const f_visit = (current) => {
 if (!current || typeof current.type !== 'string' || seen.has(current)) return;
 seen.add(current);
 if (current.type === 'MemberExpression' && current.object.type === 'Identifier') {
 const module = faceBindings.get(current.object.name);
 if (module && switches[module]) {
 const property = current.property.type === 'Identifier' ? current.property.name: null;
 const kind = switches[module];
 if (property === kind) switchCalled.add(module);
 else if (property === 't_unmock') switchCalled.add(module);
 else used.add(module);
 }
 }
 if (current.type === 'CallExpression' && current.callee.type === 'Identifier') {
 const entry = switchBindings.get(current.callee.name);
 if (entry) switchCalled.add(entry.module);
 }
 for (const key of Object.keys(current)) {
 if (key === 'parent' || key === 'tokens' || key === 'comments' || key === 'loc' || key === 'range') continue;
 const value = current[key];
 if (Array.isArray(value)) value.forEach(f_visit);
 else if (value && typeof value.type === 'string') f_visit(value);
 }
 };
 f_visit(node.body);
 const coverage = f_coverage(node);
 // 钩子装配底盘：beforeEach/afterEach/before/after 回调（node:test 生命周期钩子）先于/后于
 // 每个用例执行——共享 helper（如 t_createFixture）内的装配与复位经由钩子生效时，计入全文件
 // 用例的覆盖面（与模块体底盘同语义；只并入 on/off，不并入用例自身的 switchCalled）。
 for (const [module, hookEntry] of f_hookCoverage()) {
 const entry = coverage.get(module) || { on: false, off: false };
 entry.on = entry.on || hookEntry.on;
 entry.off = entry.off || hookEntry.off;
 coverage.set(module, entry);
 }
 for (const module of used) {
 const kind = switches[module];
 const entry = coverage.get(module);
 if (!switchCalled.has(module) && !entry?.on) {
 // 用例与 helper 链都没有装配：未 mock 使用 lite 门面
 context.report({ node, messageId: 'missingSwitch', data: { test: testName, module: f_label(module), switch: kind } });
 } else if (switchCalled.has(module) && !entry?.off && kind === 't_mock') {
 // 用例内直接装配的须自行复位；经共享装配 helper（如套件级常驻世界）的清理归装配层钩子管
 context.report({ node, messageId: 'missingUnmock', data: { test: testName, module: f_label(module), switch: kind } });
 }
 }
 }

 // 私有：钩子装配底盘（按文件缓存）——扫描 AST 中 node:test 生命周期钩子注册
 //（beforeEach/afterEach/before/after），其回调经 f_coverage 计算装配覆盖面后并集。
 let hookCoverageCache = null;
 function f_hookCoverage() {
 if (hookCoverageCache) return hookCoverageCache;
 const hookNames = new Set(['before', 'after', 'beforeEach', 'afterEach']);
 const merged = new Map();
 const f_walk = (current) => {
 if (!current || typeof current.type !== 'string') return;
 if (current.type === 'CallExpression' && current.callee.type === 'Identifier'
 && hookNames.has(current.callee.name) && testNames.has(current.callee.name)) {
 const callback = current.arguments.find((argument) => argument
 && ['FunctionExpression', 'ArrowFunctionExpression'].includes(argument.type));
 if (callback) {
 for (const [module, entry] of f_coverage(callback)) {
 const current = merged.get(module) || { on: false, off: false };
 current.on = current.on || entry.on;
 current.off = current.off || entry.off;
 merged.set(module, current);
 }
 }
 }
 for (const key of Object.keys(current)) {
 if (key === 'parent' || key === 'tokens' || key === 'comments' || key === 'loc' || key === 'range') continue;
 const value = current[key];
 if (Array.isArray(value)) value.forEach(f_walk);
 else if (value && typeof value.type === 'string') f_walk(value);
 }
 };
 f_walk(sourceCode.ast);
 hookCoverageCache = merged;
 return merged;
 }

 return {
 'CallExpression'(node) {
 if (node.callee.type !== 'Identifier' || !testNames.has(node.callee.name)) return;
 if (['before', 'after', 'beforeEach', 'afterEach'].includes(node.callee.name)) return;
 const callback = node.arguments.find((argument) => argument
 && ['FunctionExpression', 'ArrowFunctionExpression'].includes(argument.type));
 if (!callback) return;
 const testName = typeof node.arguments[0]?.value === 'string' ? node.arguments[0].value: (callback.id?.name ?? '(匿名用例)');
 f_checkCase(callback, testName);
 },
 };
 },
};

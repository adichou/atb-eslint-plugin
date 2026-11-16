// atb/no-bad-test-patterns — node:test 测试质量约束。
// 一条规则三块检查（原独立规则 no-bad-case-comments、no-fake-page-interaction-in-test 并入）：
// ① 用例质量模式：only/skip/todo 缩减执行、TestContext 跳过、缺断言、恒真断言、缺少诊断消息、
// throws/rejects 用法、rejects/子测试未等待、回调与 Promise 混用、未知测试选项、空/注释空
// catch 与 Promise.catch 吞错、setTimeout 固定睡眠、故障注入缺少移除登记——全部按真实绑定
// 归因，不按变量名全局禁词。
// ② SC 用例注释归属：紧邻头注释须含非空「场景：」；体内须有非空「输入：」；预期分组编号从
// 1 连续递增（「1b」等子编号归并同组）或兼容单组「预期：」，分组内须有认可断言；占位词
//（待补充/TODO）不算有效内容；文件头、前一用例与字符串中的标记不判为合规。单号要求
//（REQ-/BUG- 格式）经 requireItemNumber 配置开关控制——默认关（非 atb 管理的项目没有看板
// 单号），atb 管理项目显式开启；不自动补写注释内容。
// ③ 页面交互真实性（pageInteraction 配置组）：禁 route 桩伪造响应、evaluate 回调/字符串脚本内
// 用写方法 fetch 代替用户操作、Node 侧裸 fetch/XMLHttpRequest 直发请求（fetch 为全局 API
// 不经 import，只能按标识符拦截）、合成 click 事件冒充真实交互；evaluate 字符串按已知形态
// 扫描，不宣称解析任意脚本语义。
// 例外分列：exceptionFiles 作用于①②，pageInteraction.exceptionFiles 仅作用于③——窄例外不得
// 掩盖同文件其他违规。检查目标即 node:test + node:assert(/strict) +
// @playwright/test 三来源，作为规则内建常量不设配置旋钮；eslint-node-test 插件要求
// ESLint >=10.4（Node 22.12.0 不满足，见条目选型记录），故本规则自研承接。
import path from 'node:path';
import { minimatch } from '../lib/attributions.mjs';

// 内建常量：runner/断言库来源与故障注入成员名（①②共用；改名导入同样命中，按绑定归因）。
const INJECT_MEMBER_NAME = 't_inject';

// ============================== ① 用例质量模式 ==============================

const MESSAGE_ARG_INDEX = {
 ok: 1, equal: 2, notEqual: 2, deepEqual: 2, notDeepEqual: 2, strictEqual: 2, notStrictEqual: 2,
 deepStrictEqual: 2, notDeepStrictEqual: 2, match: 2, doesNotMatch: 2, throws: 2, doesNotThrow: 2,
 rejects: 2, doesNotReject: 2, fail: 0, ifError: 1,
};
const ASSERT_EQUALS = new Set(['equal', 'notEqual', 'deepEqual', 'notDeepEqual', 'strictEqual', 'notStrictEqual', 'deepStrictEqual', 'notDeepStrictEqual']);
const HOOK_NAMES = new Set(['before', 'after', 'beforeEach', 'afterEach']);

function f_isCommentOnlyBody(body, sourceCode) {
 const between = sourceCode.text.slice(body.range[0] + 1, body.range[1] - 1);
 if (between.trim() !== '') {
 const stripped = between.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
 if (stripped !== '') return false;
 }
 return true;
}

function f_isTruthyLiteral(node) {
 return node.type === 'Literal' && Boolean(node.value) || node.type === 'TemplateLiteral' && node.expressions.length === 0;
}

function f_staticPropertyName(member) {
 if (!member.computed && member.property.type === 'Identifier') return member.property.name;
 if (member.computed && member.property.type === 'Literal' && typeof member.property.value === 'string') return member.property.value;
 return null;
}

function f_qualityVisitors(context) {
 const options = context.options[0] || {};
 const scanPath = path.resolve(options.scanPath || process.cwd());
 const filename = path.resolve(context.filename || context.getFilename());
 const relative = path.relative(scanPath, filename).split(path.sep).join('/');
 const isException = (options.exceptionFiles || []).some((pattern) => minimatch(relative, pattern));
 const sourceCode = context.sourceCode || context.getSourceCode();
 const allowedOptions = new Set(options.allowedTestOptions || ['concurrency', 'timeout', 'skip', 'todo', 'only', 'signal', 'plan']);
 const assertionHelpers = new Set(options.assertionHelperNames || []);

 const runnerBindings = new Set(); // node:test 绑定（按名字与绑定对象双登记）
 const assertBindings = new Set(); // node:assert(/strict) 绑定
 const expectBindings = new Set(); // @playwright/test expect 绑定
 const testContextParams = new Set(); // TestContext 参数绑定（tracked 回调首参）

 function bindingOf(identifier) {
 return sourceCode.getScope(identifier).references.find((r) => r.identifier === identifier)?.resolved || null;
 }

 // 按作用域绑定对象登记（引用归因以 binding 为键），改名导入仍命中
 function addBinding(set, identifier) {
 set.add(sourceCode.getScope(identifier).set.get(identifier.name));
 }

 function registerImport(node) {
 const spec = node.source.value;
 for (const s of node.specifiers) {
 if (spec === 'node:test') addBinding(runnerBindings, s.local);
 if (spec === 'node:assert/strict' || spec === 'node:assert') {
 if (s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier') addBinding(assertBindings, s.local);
 else if (s.imported.name === 'default') addBinding(assertBindings, s.local);
 }
 if (spec === '@playwright/test' && s.imported && s.imported.name === 'expect') addBinding(expectBindings, s.local);
 }
 }

 function trackedCall(node) {
 if (node.callee.type !== 'Identifier' && node.callee.type !== 'MemberExpression') return null;
 let name = null;
 let binding = null;
 if (node.callee.type === 'Identifier') {
 name = node.callee.name;
 binding = bindingOf(node.callee);
 } else {
 // test.only / describe.skip 等形态
 name = node.callee.object.type === 'Identifier' ? node.callee.object.name: null;
 binding = name ? bindingOf(node.callee.object): null;
 const form = f_staticPropertyName(node.callee);
 if (form && ['only', 'skip', 'todo'].includes(form) && binding && runnerBindings.has(binding)) {
 context.report({ node: node.callee.property, messageId: 'reducedExecution', data: { form: `${name}.${form}()` } });
 return null;
 }
 }
 if (!binding || !runnerBindings.has(binding)) return null;
 return { f_name: name, f_binding: binding };
 }

 function checkTestOptions(args, node) {
 for (const arg of args) {
 if (arg.type !== 'ObjectExpression') continue;
 for (const prop of arg.properties) {
 if (prop.type === 'SpreadElement') {
 context.report({ node: prop, messageId: 'unresolvableTestOptions' });
 continue;
 }
 if (prop.computed || prop.key.type !== 'Identifier') {
 context.report({ node: prop, messageId: 'unresolvableTestOptions' });
 continue;
 }
 const key = prop.key.name;
 if (['only', 'skip', 'todo'].includes(key) && f_isTruthyLiteral(prop.value)) {
 context.report({ node: prop.key, messageId: 'reducedExecution', data: { form: `选项 { ${key}: … }` } });
 continue;
 }
 if (!allowedOptions.has(key)) {
 context.report({ node: prop.key, messageId: 'unknownTestOption', data: { key, allowed: [...allowedOptions].join(', ') } });
 }
 }
 }
 }

 function functionArgs(node) {
 return node.arguments.filter((a) => a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression');
 }

 function isAwaitedOrReturned(node) {
 let current = node.parent;
 while (current) {
 if (current.type === 'AwaitExpression' || current.type === 'ReturnStatement') return true;
 if (current.type === 'ArrowFunctionExpression' && current.body === node) return true;
 current = current.parent;
 }
 return false;
 }

 const CLEANUP_CALL = /^(rmSync|rmdirSync|unlinkSync|rm|rmdir|unlink|kill|killSync|close|closeSync|end)$/;

 function isCleanupContext(node) {
 // 清理角色：t.after/after 钩子回调、process.on('exit'|信号) 处理器，以及 try 体调用
 // 清理型 API（rm/kill/close 族）的容错 catch——合法清理不误报。
 let current = node.parent;
 while (current) {
 if (current.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
 const member = f_staticPropertyName(current.callee);
 if (member === 'after') return true;
 if (member === 'on' && current.arguments[0] && current.arguments[0].type === 'Literal' && ['exit', 'SIGINT', 'SIGTERM', 'beforeExit'].includes(current.arguments[0].value)) return true;
 }
 if (current.type === 'CallExpression' && current.callee.type === 'Identifier' && HOOK_NAMES.has(current.callee.name)) {
 const binding = bindingOf(current.callee);
 if (binding && runnerBindings.has(binding)) return true;
 }
 current = current.parent;
 }
 // CatchClause 的父节点必为 TryStatement 且 block 必存在；仅 try 体调用清理型 API 的
 // 容错 catch 放行
 const scan = (n) => {
 if (n.type === 'CallExpression') {
 const name = n.callee.type === 'Identifier' ? n.callee.name: (n.callee.type === 'MemberExpression' ? f_staticPropertyName(n.callee): null);
 if (name && CLEANUP_CALL.test(name)) return true;
 }
 for (const key of Object.keys(n)) {
 if (['parent', 'loc', 'range', 'tokens'].includes(key)) continue;
 const value = n[key];
 if (Array.isArray(value) && value.some(scan)) return true;
 if (value && typeof value === 'object' && typeof value.type === 'string' && scan(value)) return true;
 }
 return false;
 };
 return scan(node.parent.block);
 }

 function containsAssertion(fnNode) {
 let found = false;
 const visit = (n) => {
 if (!n || typeof n.type !== 'string' || found) return;
 if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier') {
 const binding = bindingOf(n.callee.object);
 if (binding && (assertBindings.has(binding) || expectBindings.has(binding))) { found = true; return; }
 }
 if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
 const binding = bindingOf(n.callee);
 if (binding && expectBindings.has(binding)) { found = true; return; }
 if (assertionHelpers.has(n.callee.name)) { found = true; return; }
 }
 for (const key of Object.keys(n)) {
 if (['parent', 'loc', 'range', 'tokens'].includes(key)) continue;
 const value = n[key];
 if (Array.isArray(value)) value.forEach(visit);
 else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value);
 }
 };
 visit(fnNode.body);
 return found;
 }

 function checkTrackedBody(node, kind) {
 const fns = functionArgs(node);
 checkTestOptions(node.arguments, node);
 for (const fn of fns) {
 const asyncCallback = fn.params.length >= 2 && fn.async;
 if (asyncCallback) {
 context.report({ node: fn.params[1], messageId: 'callbackAndPromise', data: { kind: kind === 'hook' ? '钩子': '回调' } });
 }
 if (fn.params.length >= 1 && fn.params[0].type === 'Identifier') {
 const scope = sourceCode.getScope(fn.params[0]);
 const binding = scope.set.get(fn.params[0].name);
 testContextParams.add(sourceCode.getScope(fn.params[0]).set.get(fn.params[0].name));
 }
 if (kind === 'test' && fn.body && fn.body.type === 'BlockStatement' && !containsAssertion(fn)) {
 context.report({ node, messageId: 'missingAssertion' });
 }
 }
 }

 function literalDetail(node) {
 // 恒真报告涉及的实参只可能是字面量／标识符／无插值模板（sameStatic 与 isTruthyLiteral 限定）
 if (node.type === 'Literal') return JSON.stringify(node.value);
 if (node.type === 'Identifier') return node.name;
 return '`…`';
 }

 function sameStatic(a, b) {
 if (a.type === 'Literal' && b.type === 'Literal') return JSON.stringify(a.value) === JSON.stringify(b.value);
 if (a.type === 'Identifier' && b.type === 'Identifier') return a.name === b.name;
 return false;
 }

 return {
 ImportDeclaration: registerImport,

 CallExpression(node) {
 if (isException) return;
 const callee = node.callee;

 // assert.* 检查（绑定归因；改名导入仍命中）
 if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && !callee.computed && callee.property.type === 'Identifier') {
 const objBinding = bindingOf(callee.object);
 const method = callee.property.name;
 if (objBinding && assertBindings.has(objBinding) && method) {
 const args = node.arguments;
 if (method === 'throws' || method === 'doesNotThrow' || method === 'rejects' || method === 'doesNotReject') {
 const fn = args[0];
 if (fn && (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') && fn.async && (method === 'throws' || method === 'doesNotThrow')) {
 context.report({ node, messageId: 'throwsAsync', data: { method } });
 }
 if (method === 'throws' || method === 'rejects') {
 const matcher = args[1];
 const isMatcher = matcher && !(matcher.type === 'Literal' && typeof matcher.value === 'string')
 && !(matcher.type === 'TemplateLiteral' && matcher.expressions.length === 0);
 if (!matcher || !isMatcher) {
 context.report({ node, messageId: 'throwsExpectation', data: { method } });
 }
 }
 if (method === 'rejects' || method === 'doesNotReject') {
 if (!isAwaitedOrReturned(node)) context.report({ node, messageId: 'unawaitedRejects' });
 }
 }
 if (MESSAGE_ARG_INDEX[method] !== undefined) {
 let msgArg = args[MESSAGE_ARG_INDEX[method]];
 // doesNotThrow/doesNotReject 支持 (fn, message) 双参形态（无期望值参）：字符串第二参即消息。
 if (!msgArg && (method === 'doesNotThrow' || method === 'doesNotReject')) {
 const second = args[1];
 if (second && second.type === 'Literal' && typeof second.value === 'string') msgArg = second;
 }
 if (!msgArg) context.report({ node, messageId: 'missingAssertMessage', data: { method } });
 }
 if (ASSERT_EQUALS.has(method) && args.length >= 2 && sameStatic(args[0], args[1])) {
 context.report({ node, messageId: 'constantAssertion', data: { detail: `${literalDetail(args[0])} vs ${literalDetail(args[1])}` } });
 }
 if (method === 'ok' && args[0] && (args[0].type === 'Literal' ? Boolean(args[0].value): f_isTruthyLiteral(args[0]))) {
 context.report({ node, messageId: 'constantAssertion', data: { detail: `ok(${literalDetail(args[0])})` } });
 }
 return;
 }
 }

 // expect(…).matcher 恒真形态（callee.object 为 expect(...) 调用）
 if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'CallExpression' && callee.object.callee.type === 'Identifier') {
 const expectBinding = bindingOf(callee.object.callee);
 if (expectBinding && expectBindings.has(expectBinding)) {
 const matcher = callee.property.name;
 if (matcher && ['toBe', 'toEqual', 'toStrictEqual'].includes(matcher) && node.arguments.length === 1 && sameStatic(callee.object.arguments[0], node.arguments[0])) {
 context.report({ node, messageId: 'constantAssertion', data: { detail: `expect(${literalDetail(callee.object.arguments[0])}).${matcher}(同值)` } });
 }
 if (matcher === 'toBeTruthy' && callee.object.arguments[0] && callee.object.arguments[0].type === 'Literal' && callee.object.arguments[0].value === true) {
 context.report({ node, messageId: 'constantAssertion', data: { detail: 'expect(true).toBeTruthy()' } });
 }
 // 异步 matcher 未等待由 playwright/missing-playwright-await 承接
 }
 }

 // t.test 子测试等待 / TestContext 跳过（t 为 tracked 回调首参）
 if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' && callee.property.type === 'Identifier') {
 const tBinding = bindingOf(callee.object);
 if (tBinding && testContextParams.has(tBinding)) {
 if (['skip', 'todo'].includes(callee.property.name) && node.parent.type !== 'MemberExpression') {
 context.report({ node: callee.property, messageId: 'testContextSkip', data: { method: callee.property.name } });
 }
 if (callee.property.name === 'test' && !isAwaitedOrReturned(node)) {
 context.report({ node, messageId: 'unawaitedSubtest' });
 }
 }
 }

 // tracked 注册（含 only/skip/todo 成员形态）
 const tracked = trackedCall(node);
 if (tracked) {
 checkTrackedBody(node, HOOK_NAMES.has(tracked.f_name) ? 'hook': 'test');
 }

 // 故障注入移除函数丢弃检查
 if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' && callee.property.name === INJECT_MEMBER_NAME) {
 if (node.parent.type === 'ExpressionStatement') {
 const arg = node.arguments[0];
 const hasOnce = arg && arg.type === 'ObjectExpression' && arg.properties.some((p) => p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === 'once' && f_isTruthyLiteral(p.value));
 if (!hasOnce) context.report({ node, messageId: 'unregisteredInject' });
 }
 }

 // Promise.catch 空回调吞错
 if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' && callee.property.name === 'catch') {
 const fn = node.arguments.find((a) => a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression');
 if (fn && fn.body && fn.body.type === 'BlockStatement' && f_isCommentOnlyBody(fn.body, sourceCode)) {
 context.report({ node, messageId: 'swallowPromiseCatch' });
 }
 }
 },

 NewExpression(node) {
 // new Promise(executor) 内以 setTimeout 唤醒 resolve 的固定睡眠形态
 if (isException) return;
 if (node.callee.type !== 'Identifier' || node.callee.name !== 'Promise') return;
 const executor = node.arguments[0];
 if (!executor || (executor.type !== 'ArrowFunctionExpression' && executor.type !== 'FunctionExpression')) return;
 const params = executor.params.map((p) => (p.type === 'Identifier' ? p.name: null)).filter(Boolean);
 const visit = (n) => {
 if (!n || typeof n.type !== 'string') return false;
 if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'setTimeout') {
 const first = n.arguments[0];
 const referenced = first && (first.type === 'Identifier' && params.includes(first.name)
 || (first.type === 'ArrowFunctionExpression' || first.type === 'FunctionExpression') && JSON.stringify(sourceCode.getText(first)).includes('resolve'));
 if (referenced) return true;
 }
 for (const key of Object.keys(n)) {
 if (['parent', 'loc', 'range', 'tokens'].includes(key)) continue;
 const value = n[key];
 if (Array.isArray(value) && value.some(visit)) return true;
 if (value && typeof value === 'object' && typeof value.type === 'string' && visit(value)) return true;
 }
 return false;
 };
 if (visit(executor.body)) context.report({ node, messageId: 'fixedSleep' });
 },

 CatchClause(node) {
 if (isException) return;
 if (!node.body || !f_isCommentOnlyBody(node.body, sourceCode)) return;
 if (isCleanupContext(node)) return;
 context.report({ node, messageId: 'swallowCatch', data: { context: node.param ? `（${node.param.name}）`: '' } });
 },
 };
}

// ============================== ② SC 用例注释归属 ==============================

const ITEM_ID = /\b(?:REQ|BUG)-\d{8}-\d{3}\b/;
const PLACEHOLDERS = ['待补充', 'TODO'];

function f_commentText(comment) {
 return comment.type === 'Block' ? comment.value.replace(/\*/g, ' '): comment.value;
}

function f_markerContent(text, marker) {
 const index = text.indexOf(marker);
 if (index === -1) return null;
 const rest = text.slice(index + marker.length).replace(/^[:：]?\s*/, '');
 return rest.split('\n').map((line) => line.trim()).filter(Boolean).join(' ').trim();
}

function f_isPlaceholder(content) {
 if (!content) return true;
 const compact = content.replace(/\s/g, '');
 return PLACEHOLDERS.some((word) => compact.startsWith(word) && compact.length <= word.length + 4);
}

function f_caseCommentVisitors(context) {
 const options = context.options[0] || {};
 const scanPath = path.resolve(options.scanPath || process.cwd());
 const filename = path.resolve(context.filename || context.getFilename());
 const relative = path.relative(scanPath, filename).split(path.sep).join('/');
 const isException = (options.exceptionFiles || []).some((pattern) => minimatch(relative, pattern));
 const sourceCode = context.sourceCode || context.getSourceCode();
 const helpers = new Set(options.assertionHelperNames || []);
 // 单号要求按配置开关：默认关（非 atb 管理的项目没有 REQ-/BUG- 看板单号），atb 管理项目显式开启。
 const requireItemNumber = options.requireItemNumber === true;
 const runnerBindings = new Map(); // 绑定 → 导入名（仅 test/it 注册按用例核验，hook 不算用例）
 const assertBindings = new Set();
 const expectBindings = new Set();

 function bindingOf(identifier) {
 return sourceCode.getScope(identifier).references.find((r) => r.identifier === identifier)?.resolved || null;
 }

 // 按作用域绑定对象登记（引用归因以 binding 为键），改名导入仍命中
 function addBinding(set, identifier) {
 set.add(sourceCode.getScope(identifier).set.get(identifier.name));
 }

 function registerImport(node) {
 const spec = node.source.value;
 if (spec === 'node:test') {
 // 记录导入名：test/it 是用例注册；before/after 等 hook 不按用例核验注释
 for (const s of node.specifiers) {
 runnerBindings.set(sourceCode.getScope(s.local).set.get(s.local.name), s.type === 'ImportSpecifier' && s.imported ? s.imported.name: s.local.name);
 }
 }
 if (spec === 'node:assert/strict' || spec === 'node:assert') {
 for (const s of node.specifiers) {
 if (s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier') addBinding(assertBindings, s.local);
 else if (s.imported.name === 'default') addBinding(assertBindings, s.local);
 }
 }
 if (spec === '@playwright/test') {
 for (const s of node.specifiers) {
 if (s.type === 'ImportSpecifier' && s.imported.name === 'expect') addBinding(expectBindings, s.local);
 }
 }
 }

 function isAssertionCall(node) {
 if (node.type !== 'CallExpression') return false;
 if (node.callee.type === 'MemberExpression') {
 if (node.callee.object.type === 'Identifier') {
 const binding = bindingOf(node.callee.object);
 if (binding && (assertBindings.has(binding) || expectBindings.has(binding))) return true;
 }
 // expect(...).matcher / assert(...).matcher 链式断言
 if (node.callee.object.type === 'CallExpression' && node.callee.object.callee.type === 'Identifier') {
 const binding = bindingOf(node.callee.object.callee);
 if (binding && (expectBindings.has(binding) || assertBindings.has(binding))) return true;
 }
 }
 if (node.callee.type === 'Identifier') {
 const binding = bindingOf(node.callee);
 if (binding && (expectBindings.has(binding) || assertBindings.has(binding))) return true;
 if (helpers.has(node.callee.name)) return true;
 }
 return false;
 }

 function walkNodes(root, visit) {
 const stack = [root];
 while (stack.length > 0) {
 const node = stack.pop();
 // 数组模式省略位在 AST 中为 null，压栈后需跳过（null.type 会抛错）
 if (!node || typeof node.type !== 'string') continue;
 if (visit(node) === true) return true;
 for (const key of Object.keys(node)) {
 if (['parent', 'loc', 'range', 'tokens', 'comments'].includes(key)) continue;
 const value = node[key];
 if (Array.isArray(value)) {
 for (const item of value) stack.push(item);
 } else if (value && typeof value === 'object') {
 stack.push(value);
 }
 }
 }
 return false;
 }

 // 头注释：紧邻注册语句的连续注释组（允许空行分隔，不跨越代码语句）。
 function headComments(callNode) {
 let statement = callNode;
 while (statement.parent && !['ExpressionStatement', 'VariableDeclaration', 'ReturnStatement'].includes(statement.parent.type)) {
 statement = statement.parent;
 }
 const all = sourceCode.getAllComments();
 if (all.length === 0) return [];
 const last = [...all].reverse().find((c) => c.range[1] <= statement.range[0]);
 if (!last) return [];
 const betweenLast = sourceCode.text.slice(last.range[1], statement.range[0]);
 if (/[^\s/]/.test(betweenLast.replace(/\/\*/g, '').replace(/\*\//g, ''))) return [];
 const group = [last];
 const index = all.indexOf(last);
 for (let i = index - 1; i >= 0; i -= 1) {
 const prev = all[i];
 const between = sourceCode.text.slice(prev.range[1], group[0].range[0]);
 if (/[^\s]/.test(between)) break;
 group.unshift(prev);
 }
 return group;
 }

 function checkCase(node, title) {
 if (isException) return;
 // 1) 场景头注释
 const comments = headComments(node);
 const headText = comments.map(f_commentText).join('\n');
 const scenario = f_markerContent(headText, '场景');
 if (!scenario || f_isPlaceholder(scenario)) {
 context.report({ node, messageId: 'missingScenario', data: { title } });
 return;
 }
 if (requireItemNumber && !ITEM_ID.test(headText)) {
 context.report({ node, messageId: 'missingItemNumber', data: { title } });
 return;
 }
 // 2) 体内输入（限定回调范围；字符串不判合规）
 const fns = node.arguments.filter((a) => a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression');
 const fn = fns[fns.length - 1];
 if (!fn || !fn.body || fn.body.type !== 'BlockStatement') return;
 const inner = sourceCode.getCommentsInside(fn.body);
 const hasInput = inner.some((c) => {
 const content = f_markerContent(f_commentText(c), '输入');
 return content !== null && !f_isPlaceholder(content);
 });
 if (!hasInput) {
 context.report({ node, messageId: 'missingInput', data: { title } });
 return;
 }
 // 3) 预期分组：编号连续性（子编号 a/b 归并同组）+ 占位检查 + 分组内断言
 const expectComments = inner
 .filter((c) => /预期\s*\d*[a-zA-Z]*\s*[:：]/.test(f_commentText(c)))
 .sort((a, b) => a.range[0] - b.range[0]);
 let numbered = 0;
 let unnumbered = 0;
 let previous = 0;
 let previousSub = false;
 for (const comment of expectComments) {
 const text = f_commentText(comment);
 const numberedMatch = text.match(/预期\s*(\d+)([a-zA-Z]*)\s*[:：]/);
 if (numberedMatch) {
 const current = Number(numberedMatch[1]);
 const sub = Boolean(numberedMatch[2]);
 numbered += 1;
 // 顺序递增或同组子编号（1b 等）放行；重复、倒序与跳号均报
 const sequential = current === previous + 1;
 const sameGroup = current === previous && (sub || previousSub);
 if (!sequential && !sameGroup) {
 context.report({ node: comment, messageId: 'expectNumbering', data: { title, detail: `为 ${current}，应为 ${previous + 1}` } });
 }
 previous = Math.max(previous, current);
 previousSub = sub;
 } else {
 unnumbered += 1;
 // 单组无编号「预期：」兼容放行；与编号分组混用或多个无编号才报
 if (numbered > 0 || unnumbered > 1) {
 context.report({ node: comment, messageId: 'expectNumbering', data: { title, detail: '混用无编号「预期：」（仅单组兼容）' } });
 }
 }
 if (f_isPlaceholder(numberedMatch
 ? text.slice((numberedMatch.index || 0) + numberedMatch[0].length)
 : f_markerContent(text, '预期'))) {
 context.report({ node: comment, messageId: 'expectPlaceholder', data: { title } });
 continue;
 }
 const laterMarkers = inner.filter((c) => c.range[0] > comment.range[1] && /(?:预期\s*\d*[a-zA-Z]*\s*[:：]|输入\s*[:：])/.test(f_commentText(c))).sort((a, b) => a.range[0] - b.range[0]);
 const groupEnd = laterMarkers.length > 0 ? laterMarkers[0].range[0]: fn.body.range[1] - 1;
 const hasAssertion = walkNodes(fn.body, (n) => {
 if (!n.range || n.range[0] < comment.range[1] || n.range[0] >= groupEnd) return false;
 return isAssertionCall(n) ? true: undefined;
 });
 if (!hasAssertion) {
 const label = numberedMatch ? `预期 ${numberedMatch[1]}${numberedMatch[2]}`: '预期';
 context.report({ node: comment, messageId: 'expectGroupNoAssertion', data: { title, group: label } });
 }
 }
 }

 return {
 ImportDeclaration: registerImport,
 CallExpression(node) {
 if (node.callee.type !== 'Identifier') return;
 const binding = bindingOf(node.callee);
 if (!binding) return;
 const importedName = runnerBindings.get(binding);
 if (importedName !== 'test' && importedName !== 'it') return;
 const titleArg = node.arguments.find((a) => a.type === 'Literal' && typeof a.value === 'string');
 checkCase(node, titleArg ? titleArg.value: '(未命名)');
 },
 };
}

// ============================== ③ 页面交互真实性 ==============================

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FETCH_WRITE_RE = /fetch\s*\([\s\S]{0,200}?method\s*:\s*['"`](?:POST|PUT|PATCH|DELETE)/;

function f_fakeInteractionVisitors(context) {
 const options = context.options[0] || {};
 const interaction = options.pageInteraction || {};
 const scanPath = path.resolve(options.scanPath || process.cwd());
 const filename = path.resolve(context.filename || context.getFilename());
 const relative = path.relative(scanPath, filename).split(path.sep).join('/');
 const isException = (interaction.exceptionFiles || []).some((pattern) => minimatch(relative, pattern));
 const sourceCode = context.sourceCode || context.getSourceCode();

 // evaluate 回调/脚本标记：向上找 .evaluate( 调用
 function insideEvaluate(node) {
 let current = node.parent;
 while (current) {
 if (current.type === 'CallExpression' && current.callee.type === 'MemberExpression'
 && !current.callee.computed && current.callee.property.type === 'Identifier' && current.callee.property.name === 'evaluate') return true;
 current = current.parent;
 }
 return false;
 }

 function checkStringScript(node) {
 if (typeof node.value !== 'string') return;
 if (interaction.fetchWriteInEvaluate && FETCH_WRITE_RE.test(node.value)) {
 context.report({ node, messageId: 'fetchWrite' });
 }
 }

 return {
 MemberExpression(node) {
 if (node.computed || node.property.type !== 'Identifier') return;
 const name = node.property.name;
 const parent = node.parent;
 if (interaction.routeStub && parent && parent.type === 'CallExpression' && parent.callee === node && name === 'route' && !isException) {
 context.report({ node: node.property, messageId: 'routeStub' });
 }
 if (interaction.syntheticClick && name === 'dispatchEvent' && parent && parent.type === 'CallExpression' && parent.callee === node && !isException) {
 const first = parent.arguments[0];
 if (first && first.type === 'Literal' && first.value === 'click') {
 context.report({ node: node.property, messageId: 'syntheticClick' });
 }
 }
 },
 Literal(node) {
 if (!insideEvaluate(node)) return;
 checkStringScript(node);
 },
 TemplateLiteral(node) {
 if (!insideEvaluate(node) || node.expressions.length > 0) return;
 if (interaction.fetchWriteInEvaluate && FETCH_WRITE_RE.test(node.quasis[0].value.cooked)) {
 context.report({ node, messageId: 'fetchWrite' });
 }
 },
 CallExpression(node) {
 if (isException) return;
 // 全局 fetch 直接调用触发业务：Node 侧禁令；evaluate 内属页面上下文，
 // 写方法由 fetchWrite 检查承接，只读观测放行
 if (node.callee.type === 'Identifier' && (node.callee.name === 'fetch' || node.callee.name === 'XMLHttpRequest') && interaction.banDirectHttp && !insideEvaluate(node)) {
 context.report({ node, messageId: 'directHttp', data: { name: node.callee.name } });
 }
 // evaluate 函数回调内的写方法 fetch
 if (!interaction.fetchWriteInEvaluate) return;
 if (node.callee.type !== 'Identifier' || node.callee.name !== 'fetch') return;
 if (!insideEvaluate(node)) return;
 const init = node.arguments[1];
 if (!init || init.type !== 'ObjectExpression') return;
 for (const prop of init.properties) {
 if (prop.type !== 'Property' || prop.computed || prop.key.type !== 'Identifier' || prop.key.name !== 'method') continue;
 const value = prop.value;
 if (value.type === 'Literal' && WRITE_METHODS.has(String(value.value))) {
 context.report({ node, messageId: 'fetchWrite' });
 }
 }
 },
 NewExpression(node) {
 if (isException) return;
 // 原生 XMLHttpRequest 构造：Node 侧直接实例化客户端触发业务
 if (interaction.banDirectHttp && node.callee.type === 'Identifier' && node.callee.name === 'XMLHttpRequest' && !insideEvaluate(node)) {
 context.report({ node, messageId: 'directHttp', data: { name: 'XMLHttpRequest' } });
 }
 // evaluate 回调内的合成 MouseEvent('click')
 if (!interaction.syntheticClick) return;
 if (node.callee.type !== 'Identifier' || node.callee.name !== 'MouseEvent') return;
 if (!insideEvaluate(node)) return;
 const type = node.arguments[0];
 if (type && type.type === 'Literal' && type.value === 'click') {
 context.report({ node, messageId: 'syntheticClick' });
 }
 },
 };
}

// ============================== 合并导出 ==============================

// 同键 visitor 链接：各子检查按注册顺序独立执行，handler 内部 return 只结束本检查。
function f_chainVisitors(first, second) {
 return (node) => { first(node); second(node); };
}

export default {
 meta: {
 type: 'problem',
 docs: { description: 'node:test 测试质量约束：执行完整性、可诊断断言、异常断言、等待语义、吞错、睡眠、资源登记、SC 注释归属与页面交互真实性' },
 schema: [{
 type: 'object',
 properties: {
 scanPath: { type: 'string' },
 allowedTestOptions: { type: 'array', items: { type: 'string' } },
 assertionHelperNames: { type: 'array', items: { type: 'string' } },
 requireItemNumber: { type: 'boolean' },
 exceptionFiles: { type: 'array', items: { type: 'string' } },
 pageInteraction: {
 type: 'object',
 properties: {
 routeStub: { type: 'boolean' },
 fetchWriteInEvaluate: { type: 'boolean' },
 banDirectHttp: { type: 'boolean' },
 syntheticClick: { type: 'boolean' },
 exceptionFiles: { type: 'array', items: { type: 'string' } },
 },
 additionalProperties: false,
 },
 },
 additionalProperties: false,
 }],
 messages: {
 // ① 用例质量模式
 reducedExecution: "node:test 用例不得用 {{form}} 缩减执行：修复或删除该用例",
 testContextSkip: "TestContext 的 t.{{method}}() 缩减执行",
 missingAssertion: "用例缺少可诊断断言（assert/expect/认可断言 helper）",
 constantAssertion: '明显恒真断言（{{detail}}）：断言不能证明任何业务预期',
 missingAssertMessage: '断言缺少诊断消息（{{method}}）：失败时无法定位业务预期',
 throwsAsync: 'assert.{{method}} 不接收 async 回调：异步异常断言应使用 assert.rejects/doesNotReject 并等待',
 throwsExpectation: 'assert.{{method}} 必须校验预期错误（错误构造、验证对象、消息正则或验证函数），诊断字符串不能替代错误匹配',
 unawaitedRejects: 'assert.rejects/doesNotReject 返回的 Promise 须 await/return 或经认可 Promise 聚合',
 unawaitedSubtest: 't.test 返回的 Promise 不得丢弃：请 await/return 或经认可 Promise 聚合（void 不算等待）',
 callbackAndPromise: '测试{{kind}}同时使用 done 回调与 async/Promise 完成机制：单一风格完成',
 unknownTestOption: "未知测试选项 '{{key}}'（{{allowed}}）：按 test/suite/hook 与目标 Node 版本核对拼写",
 unresolvableTestOptions: '测试选项对象含 spread/动态键，无法静态核验：请改为明确的静态键',
 swallowCatch: '空 catch{{context}}吞掉失败：预期失败须显式断言，清理角色请使用 finally/t.after/after 登记',
 swallowPromiseCatch: 'Promise.catch 空回调吞掉失败',
 fixedSleep: 'setTimeout 固定睡眠猜测完成：请等待可观察条件或使用认可 timer 门面控制',
 unregisteredInject: '故障注入返回的移除函数被丢弃且未声明 once：请在 finally/t.after 登记释放',
 // ② SC 用例注释归属
 missingScenario: '用例 {{title}} 缺少紧邻头注释的非空「场景：」说明：文件头说明不能代替用例头注释',
 missingItemNumber: '用例 {{title}} 的场景注释缺少格式有效的 REQ-/BUG- 单号',
 missingInput: '用例 {{title}} 体内缺少非空「输入：」说明',
 expectNumbering: '用例 {{title}} 的预期编号{{detail}}：采用编号时须从 1 连续递增、不重复不倒序',
 expectGroupNoAssertion: '用例 {{title}} 的{{group}}分组内缺少可识别断言（assert/expect/认可 helper）',
 expectPlaceholder: '用例 {{title}} 的预期说明为占位内容',
 // ③ 页面交互真实性
 routeStub: '页面测试禁止 route 桩伪造响应：页面请求须经真实服务或认可门面注入；既有场景请按文件登记例外',
 fetchWrite: '页面上下文用写方法 fetch 代替用户操作：业务写入须经真实页面交互；既有场景请登记例外',
 directHttp: '测试边界：禁止以原生 {{name}} 直接发请求触发业务；请使用认可门面或按文件登记例外',
 syntheticClick: "合成事件 'click' 不得冒充真实页面交互；边界输入既有场景请按文件登记例外",
 },
 },

 create(context) {
 const merged = {};
 for (const subVisitors of [f_qualityVisitors(context), f_caseCommentVisitors(context), f_fakeInteractionVisitors(context)]) {
 for (const [selector, handler] of Object.entries(subVisitors)) {
 merged[selector] = merged[selector] ? f_chainVisitors(merged[selector], handler): handler;
 }
 }
 return merged;
 },
};

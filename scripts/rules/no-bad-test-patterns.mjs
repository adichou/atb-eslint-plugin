// 测试质量：真实 API 来源、有效断言、Promise 归属与最小可读性。
// 范围只由 ESLint files 决定，不提供扫描路径、文件例外或断言函数名称白名单。
// 注释的业务含义交给评审；这里只要求测试有紧邻说明、非空名称和诊断消息。
import { i_testApiAnalysis, i_testProperty, i_walkTestNodes, i_testHasAssertions } from '../lib/test-quality-analysis.mjs';

const f_MESSAGES = {
  reducedExecution: '测试不得通过 only/skip/todo 缩减执行',
  testContextSkip: 'TestContext 不得通过 skip/todo 缩减执行',
  missingAssertion: '用例缺少实际执行的完整断言；未调用函数和单独 expect() 不能代替',
  missingScenario: '测试用例缺少紧邻的非空说明注释',
  missingItemNumber: '测试说明缺少所要求的 REQ-/BUG- 单号',
  missingTestName: '测试用例必须有显式非空名称',
  missingAssertMessage: '断言必须提供非空诊断消息（{{method}}）',
  constantAssertion: '明显恒真断言不能验证业务结果',
  throwsAsync: '同步异常断言不能接收 async 回调，应使用并等待 rejects/doesNotReject',
  throwsExpectation: '异常断言必须提供错误匹配条件，诊断消息不能代替错误匹配',
  unawaitedRejects: '异步异常断言必须被 await、直接返回或通过已等待的 Promise 聚合消费',
  unawaitedSubtest: '子测试 Promise 必须被等待或直接返回',
  unawaitedOperation: '本地 async 操作的 Promise 被丢弃，应等待、返回或保留后在清理前收拢',
  unawaitedExpect: '异步页面断言或轮询断言必须被等待或直接返回',
  callbackAndPromise: '测试回调不能同时使用 done 与 async/Promise 完成机制',
  unknownTestOption: "未知测试选项 '{{key}}'，请核对真实测试 API",
  unresolvableTestOptions: '测试选项包含无法静态确认的键',
  swallowCatch: '空 catch 吞掉失败；恢复、预期错误或清理必须明确处理',
  swallowPromiseCatch: '空 Promise.catch 吞掉失败',
  fixedSleep: '固定睡眠猜测异步完成；请等待可观察信号或使用可控时钟',
  unregisteredInject: '故障注入移除函数被丢弃且没有 once，请登记清理',
  routeStub: '页面测试不能通过 route 伪造业务响应，应在环境边界注入',
  fetchWrite: '页面测试不能用写请求代替用户交互',
  directHttp: '页面测试不能直接调用原生 HTTP API 驱动业务',
  forcedInteraction: '页面操作不能通过 force 绕过可操作性检查，应等待真实可交互状态',
  syntheticClick: '合成 click 不能代替真实页面交互',
};
const f_MESSAGE_INDEX = { ok: 1, equal: 2, notEqual: 2, strictEqual: 2, notStrictEqual: 2, deepEqual: 2, notDeepEqual: 2, deepStrictEqual: 2, notDeepStrictEqual: 2, partialDeepStrictEqual: 2, match: 2, doesNotMatch: 2, throws: 2, rejects: 2, doesNotThrow: 2, doesNotReject: 2, fail: 0 };
const f_ASYNC_MATCHERS = /^(?:to(?:Be(?:Attached|Checked|Disabled|Editable|Empty|Enabled|Focused|Hidden|InViewport|Visible)|ContainText|Have(?:Accessible.*|Attribute|Class|Count|CSS|Id|JSProperty|Role|Screenshot|Text|Title|URL|Value|Values)|MatchAriaSnapshot|Pass))$/;

export default {
  meta: {
    type: 'problem',
    docs: { description: '按真实 API 与执行作用域验证测试完整性、断言、等待、说明和页面交互' },
    schema: [{ type: 'object', properties: {
      allowedTestOptions: { type: 'array', items: { type: 'string' } },
      requireItemNumber: { type: 'boolean' },
      pageInteraction: { type: 'object', properties: {
        routeStub: { type: 'boolean' }, fetchWriteInEvaluate: { type: 'boolean' }, banDirectHttp: { type: 'boolean' }, syntheticClick: { type: 'boolean' },
      }, additionalProperties: false },
    }, additionalProperties: false }],
    messages: f_MESSAGES,
  },
  create(context) {
    const source = context.sourceCode;
    const api = i_testApiAnalysis(source, context.filename);
    const options = context.options[0] || {};
    const allowed = new Set(options.allowedTestOptions || ['concurrency', 'timeout', 'skip', 'todo', 'only', 'signal', 'plan']);
    const interaction = { routeStub: true, fetchWriteInEvaluate: true, syntheticClick: true, ...(options.pageInteraction || {}) };
    const pageObjects = new Set();
    const cases = [];
    const report = (node, messageId, data) => context.report({ node, messageId, ...(data ? { data } : {}) });
    // 私有：只求字面值及明确常量别名；未知动态值不假定为空或恒真。
    const f_value = (node, seen = new Set()) => {
      if (!node) return { known: true, value: undefined };
      if (node.type === 'Literal') return { known: true, value: node.value };
      if (node.type === 'TemplateLiteral' && !node.expressions.length) return { known: true, value: node.quasis[0].value.cooked };
      if (node.type === 'Identifier') {
        const variable = api.binding(node);
        if (node.name === 'undefined' && !variable?.defs.length) return { known: true, value: undefined };
        if (!variable || seen.has(variable) || variable.references.some(ref => ref.isWrite() && !ref.init)) return { known: false };
        const def = variable.defs[0];
        if (def?.type === 'Variable' && def.node.id.type === 'Identifier') return f_value(def.node.init, new Set(seen).add(variable));
      }
      return { known: false };
    };
    const f_empty = node => {
      const value = f_value(node);
      return value.known && (value.value == null || typeof value.value === 'string' && !value.value.trim());
    };
    const f_global = (node, name) => node?.type === 'Identifier' && node.name === name && !api.binding(node)?.defs.length;
    // 私有：按浏览器创建链识别页面；普通对象的同名 route/evaluate 不属于页面 API。
    const f_page = (node, seen = new Set()) => {
      if (!node) return false;
      if (node.type === 'AwaitExpression') return f_page(node.argument, seen);
      if (node.type === 'Identifier') {
        const variable = api.binding(node);
        if (pageObjects.has(variable)) return true;
        if (!variable || seen.has(variable)) return false;
        return f_page(variable.defs[0]?.node?.init, new Set(seen).add(variable));
      }
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
        const method = i_testProperty(node.callee);
        const object = api.symbol(node.callee.object);
        if (method === 'page' && object?.source === 'litenvi-node/lite-browser.mjs') return true;
        if (['launch', 'newContext', 'newPage', 'locator', 'getByRole', 'getByText', 'getByTestId'].includes(method)) return object && ['playwright', '@playwright/test'].includes(object.source) || f_page(node.callee.object, seen);
      }
      return false;
    };
    const f_inEvaluate = node => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (parent.type === 'CallExpression' && i_testProperty(parent.callee) === 'evaluate' && f_page(parent.callee.object)) return true;
      }
      return false;
    };
    // 私有：仅识别真实 Promise 的空 catch；普通对象的 catch 方法不按 Promise 处理。
    const f_promise = node => node?.type === 'NewExpression' && f_global(node.callee, 'Promise')
      || node?.type === 'CallExpression' && node.callee.type === 'MemberExpression' && f_global(node.callee.object, 'Promise');
    const f_comment = call => {
      let statement = call;
      while (statement.parent && !['Program', 'BlockStatement'].includes(statement.parent.type)) statement = statement.parent;
      const comment = source.getCommentsBefore(statement).at(-1);
      return comment && comment.loc.end.line >= statement.loc.start.line - 1 && comment.value.replace(/\*/g, '').trim() ? comment : null;
    };
    const f_options = call => {
      for (const argument of call.arguments) {
        if (argument.type !== 'ObjectExpression') continue;
        for (const property of argument.properties) {
          if (property.type === 'SpreadElement' || property.computed) { report(property, 'unresolvableTestOptions'); continue; }
          const key = property.key.name || property.key.value;
          const value = f_value(property.value);
          if (['only', 'skip', 'todo'].includes(key) && value.known && value.value) report(property, 'reducedExecution');
          else if (!allowed.has(key)) report(property, 'unknownTestOption', { key });
        }
      }
    };
    const f_assertion = (node, info) => {
      const args = node.arguments, method = info.method;
      let message;
      if (info.type === 'expect') {
        if (info.poll) message = info.root.arguments[1]?.properties?.find(property => (property.key.name || property.key.value) === 'message')?.value;
        else message = info.root.arguments[1];
        if ((info.poll || f_ASYNC_MATCHERS.test(method) || source.getText(node.callee).includes('.rejects.') || source.getText(node.callee).includes('.resolves.')) && !api.consumed(node)) report(node, 'unawaitedExpect');
      } else {
        message = args[f_MESSAGE_INDEX[method]];
        if (['doesNotThrow', 'doesNotReject'].includes(method) && !message && typeof f_value(args[1]).value === 'string') message = args[1];
        if (['throws', 'doesNotThrow'].includes(method) && args[0]?.async) report(node, 'throwsAsync');
        if (['throws', 'rejects'].includes(method) && (!args[1] || typeof f_value(args[1]).value === 'string')) report(node, 'throwsExpectation');
        if (['rejects', 'doesNotReject'].includes(method) && !api.consumed(node)) report(node, 'unawaitedRejects');
      }
      if (method !== 'ifError' && f_empty(message)) report(node, 'missingAssertMessage', { method });
      const actualNode = info.type === 'expect' ? info.root.arguments[0] : args[0];
      const expectedNode = info.type === 'expect' ? args[0] : args[1];
      const actual = f_value(actualNode), expected = f_value(expectedNode);
      const sameBinding = actualNode?.type === 'Identifier' && expectedNode?.type === 'Identifier' && api.binding(actualNode) && api.binding(actualNode) === api.binding(expectedNode);
      if (['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'toBe', 'toEqual', 'toStrictEqual'].includes(method)
        && !info.negated && (sameBinding || actual.known && expected.known && actual.value === expected.value)) report(node, 'constantAssertion');
      if (!info.negated && (method === 'ok' || method === 'toBeTruthy') && actual.known && actual.value) report(node, 'constantAssertion');
    };
    return {
      CallExpression(node) {
        const registration = api.runner(node);
        if (registration) {
          if (registration.reduced) report(node, registration.kind === 'hook' && ['skip', 'todo'].includes(registration.name) ? 'testContextSkip' : 'reducedExecution');
          if (registration.subtest && !api.consumed(node)) report(node, 'unawaitedSubtest');
          f_options(node);
          const callback = registration.callback;
          if (callback?.async && callback.params.length >= 2) report(callback, 'callbackAndPromise');
          if (registration.kind === 'test' && callback) {
            cases.push({ node, callback });
            if (callback.params[0]?.type === 'ObjectPattern') {
              for (const property of callback.params[0].properties) {
                if (property.key?.name === 'page') pageObjects.add(source.getScope(callback).set.get(property.value.name));
              }
            }
          }
        }
        if (node.callee.type === 'Identifier') {
          const def = api.binding(node.callee)?.defs[0];
          const fn = def?.type === 'FunctionName' ? def.node : def?.node?.init;
          if (fn?.async && !api.consumed(node)) report(node, 'unawaitedOperation');
        }
        const assertion = api.assertion(node);
        if (assertion) f_assertion(node, assertion);
        const callee = node.callee;
        const target = callee.type === 'MemberExpression' ? callee.object : null;
        const method = i_testProperty(callee);
        const targetApi = api.symbol(target);
        if (method === 't_inject' && targetApi?.source.startsWith('litenvi-node/lite-') && node.parent.type === 'ExpressionStatement') {
          const once = node.arguments[0]?.properties?.find(property => property.key?.name === 'once');
          if (!f_value(once?.value).value) report(node, 'unregisteredInject');
        }
        if (method === 'catch' && f_promise(target)) {
          const fn = node.arguments[0];
          if (fn?.body?.type === 'BlockStatement' && !fn.body.body.length) report(node, 'swallowPromiseCatch');
        }
        if (method === 'evaluate' && f_page(target) && interaction.fetchWriteInEvaluate) {
          const script = f_value(node.arguments[0]);
          if (typeof script.value === 'string') {
            let parsed;
            try { const parser = context.languageOptions.parser; const settings = { ecmaVersion: 'latest', sourceType: 'script', tokens: true, comment: true, range: true, loc: true }; parsed = parser.parseForESLint ? parser.parseForESLint(script.value, settings).ast : parser.parse(script.value, settings); }
            catch { parsed = null; }
            const shadowed = parsed && i_walkTestNodes(parsed, child => child.type === 'VariableDeclarator' && child.id.name === 'fetch' || child.type === 'FunctionDeclaration' && child.id?.name === 'fetch', true);
            if (parsed && !shadowed) i_walkTestNodes(parsed, child => {
              if (child.type === 'CallExpression' && child.callee.name === 'fetch' && child.arguments[1]?.properties?.some(property => (property.key?.name || property.key?.value) === 'method' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(property.value.value).toUpperCase()))) report(node, 'fetchWrite');
              return false;
            }, true);
          }
        }
        if (f_page(target)) {
          if (method === 'waitForTimeout') report(node, 'fixedSleep');
          if (['click', 'dblclick', 'fill', 'check', 'uncheck', 'setChecked', 'hover', 'tap', 'selectOption'].includes(method) && node.arguments.some(argument => argument.type === 'ObjectExpression' && argument.properties.some(property => (property.key?.name || property.key?.value) === 'force' && f_value(property.value).value === true))) report(node, 'forcedInteraction');
          if (interaction.routeStub && method === 'route') report(node, 'routeStub');
          if (interaction.syntheticClick && method === 'dispatchEvent' && f_value(node.arguments[0]).value === 'click') report(node, 'syntheticClick');
        }
        if (f_global(callee, 'fetch')) {
          if (interaction.banDirectHttp && !f_inEvaluate(node)) report(node, 'directHttp');
          const init = node.arguments[1];
          const write = init?.properties?.some(property => (property.key?.name || property.key?.value) === 'method' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(f_value(property.value).value).toUpperCase()));
          if (interaction.fetchWriteInEvaluate && f_inEvaluate(node) && write) report(node, 'fetchWrite');
        }
      },
      NewExpression(node) {
        if (interaction.banDirectHttp && f_global(node.callee, 'XMLHttpRequest') && !f_inEvaluate(node)) report(node, 'directHttp');
        if (interaction.syntheticClick && f_inEvaluate(node) && ['MouseEvent', 'Event'].some(name => f_global(node.callee, name)) && f_value(node.arguments[0]).value === 'click') report(node, 'syntheticClick');
        if (!f_global(node.callee, 'Promise')) return;
        const executor = node.arguments[0];
        if (!executor?.params?.[0]) return;
        const resolve = source.getScope(executor).set.get(executor.params[0].name);
        i_walkTestNodes(executor.body, child => {
          if (child.type !== 'CallExpression') return false;
          const timer = api.symbol(child.callee);
          const timeout = f_global(child.callee, 'setTimeout') || timer?.source === 'node:timers' && timer.name.endsWith('setTimeout') || i_testProperty(child.callee) === 'setTimeout' && f_global(child.callee.object, 'globalThis');
          if (!timeout) return false;
          // 明确的超时竞赛用于观察操作或截止结果，不属于猜测操作已完成的裸睡眠。
          const list = node.parent;
          if (list?.type === 'ArrayExpression' && list.parent?.type === 'CallExpression' && i_testProperty(list.parent.callee) === 'race' && f_global(list.parent.callee.object, 'Promise')) return false;
          const callback = child.arguments[0];
          const wakes = api.binding(callback) === resolve || /^(?:ArrowFunctionExpression|FunctionExpression)$/.test(callback?.type) && i_walkTestNodes(callback.body, call => call.type === 'CallExpression' && api.binding(call.callee) === resolve);
          if (wakes && !(callback?.body?.type === 'BlockStatement' && callback.body.body.length > 1)) { report(node, 'fixedSleep'); return true; }
          return false;
        });
      },
      CatchClause(node) {
        if (!node.body.body.length) report(node, 'swallowCatch');
      },
      'Program:exit'() {
        for (const { node, callback } of cases) {
          if (!node.arguments.length || node.arguments[0].type !== 'Identifier' && f_empty(node.arguments[0]) || /^(?:ArrowFunctionExpression|FunctionExpression|ObjectExpression)$/.test(node.arguments[0]?.type)) report(node, 'missingTestName');
          const comment = f_comment(node);
          if (!comment) report(node, 'missingScenario');
          if (options.requireItemNumber && comment && !/\b(?:REQ|BUG)-\d{8}-\d{3}\b/.test(comment.value)) report(node, 'missingItemNumber');
          if (!i_testHasAssertions(callback.body, api)) report(node, 'missingAssertion');
        }
      },
    };
  },
};

// 断言检查：实际执行、非空诊断、明显恒真和异常匹配；异步消费另由等待规则负责。
import { i_testRuleContext } from '../lib/test-rule-context.mjs';
import { i_testHasAssertions } from '../lib/test-quality-analysis.mjs';
const f_MESSAGE_INDEX = { ok: 1, equal: 2, notEqual: 2, strictEqual: 2, notStrictEqual: 2, deepEqual: 2, notDeepEqual: 2, deepStrictEqual: 2, notDeepStrictEqual: 2, partialDeepStrictEqual: 2, match: 2, doesNotMatch: 2, throws: 2, rejects: 2, doesNotThrow: 2, doesNotReject: 2, fail: 0 };
export default {
  meta: { type: 'problem', docs: { description: '检查实际断言、诊断消息、恒真和异常匹配' }, schema: [], messages: {
    missingAssertion: '用例缺少实际执行的完整断言；未调用函数和单独 expect() 不能代替',
    missingAssertMessage: '断言必须提供非空诊断消息（{{method}}）', constantAssertion: '明显恒真断言不能验证业务结果',
    throwsAsync: '同步异常断言不能接收 async 回调，应使用并等待 rejects/doesNotReject',
    throwsExpectation: '异常断言必须提供错误匹配条件，诊断消息不能代替错误匹配',
  } },
  create(context) {
    const { api, value, empty, report } = i_testRuleContext(context), cases = [];
    return {
      CallExpression(node) {
        const registration = api.runner(node);
        if (registration?.kind === 'test' && registration.callback) cases.push({ node, callback: registration.callback });
        const info = api.assertion(node);
        if (!info) return;
        const args = node.arguments, method = info.method;
        let message;
        if (info.type === 'expect') {
          message = info.poll ? info.root.arguments[1]?.properties?.find(property => (property.key.name || property.key.value) === 'message')?.value : info.root.arguments[1];
        } else {
          message = args[f_MESSAGE_INDEX[method]];
          if (['doesNotThrow', 'doesNotReject'].includes(method) && !message && typeof value(args[1]).value === 'string') message = args[1];
          if (['throws', 'doesNotThrow'].includes(method) && args[0]?.async) report(node, 'throwsAsync');
          if (['throws', 'rejects'].includes(method) && (!args[1] || typeof value(args[1]).value === 'string')) report(node, 'throwsExpectation');
        }
        if (method !== 'ifError' && empty(message)) report(node, 'missingAssertMessage', { method });
        const actualNode = info.type === 'expect' ? info.root.arguments[0] : args[0], expectedNode = info.type === 'expect' ? args[0] : args[1];
        const actual = value(actualNode), expected = value(expectedNode);
        const sameBinding = actualNode?.type === 'Identifier' && expectedNode?.type === 'Identifier' && api.binding(actualNode) && api.binding(actualNode) === api.binding(expectedNode);
        if (['equal', 'strictEqual', 'deepEqual', 'deepStrictEqual', 'toBe', 'toEqual', 'toStrictEqual'].includes(method)
          && !info.negated && (sameBinding || actual.known && expected.known && actual.value === expected.value)) report(node, 'constantAssertion');
        if (!info.negated && (method === 'ok' || method === 'toBeTruthy') && actual.known && actual.value) report(node, 'constantAssertion');
      },
      'Program:exit'() { for (const { node, callback } of cases) if (!i_testHasAssertions(callback.body, api)) report(node, 'missingAssertion'); },
    };
  },
};

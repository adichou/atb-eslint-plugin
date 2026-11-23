// Promise 必须由拥有该操作的作用域等待、返回或收拢，外层等待不能代替内层消费。
import { i_testRuleContext } from '../lib/test-rule-context.mjs';
const f_ASYNC_MATCHERS = /^(?:to(?:Be(?:Attached|Checked|Disabled|Editable|Empty|Enabled|Focused|Hidden|InViewport|Visible)|ContainText|Have(?:Accessible.*|Attribute|Class|Count|CSS|Id|JSProperty|Role|Screenshot|Text|Title|URL|Value|Values)|MatchAriaSnapshot|Pass))$/;
export default {
  meta: { type: 'problem', docs: { description: '测试中的异步操作、子测试和异步断言必须消费 Promise' }, schema: [], messages: {
    unawaitedRejects: '异步异常断言必须被 await、直接返回或通过已等待的 Promise 聚合消费',
    unawaitedSubtest: '子测试 Promise 必须被等待或直接返回',
    unawaitedOperation: '本地 async 操作的 Promise 被丢弃，应等待、返回或保留后在清理前收拢',
    unawaitedExpect: '异步页面断言或轮询断言必须被等待或直接返回',
  } },
  create(context) {
    const { source, api, report } = i_testRuleContext(context);
    return { CallExpression(node) {
      const registration = api.runner(node);
      if (registration?.subtest && !api.consumed(node)) report(node, 'unawaitedSubtest');
      if (node.callee.type === 'Identifier') {
        const def = api.binding(node.callee)?.defs[0], fn = def?.type === 'FunctionName' ? def.node : def?.node?.init;
        if (fn?.async && !api.consumed(node)) report(node, 'unawaitedOperation');
      }
      const info = api.assertion(node);
      if (!info) return;
      if (info.type === 'assert' && ['rejects', 'doesNotReject'].includes(info.method) && !api.consumed(node)) report(node, 'unawaitedRejects');
      if (info.type === 'expect' && (info.poll || f_ASYNC_MATCHERS.test(info.method) || source.getText(node.callee).includes('.rejects.') || source.getText(node.callee).includes('.resolves.')) && !api.consumed(node)) report(node, 'unawaitedExpect');
    } };
  },
};

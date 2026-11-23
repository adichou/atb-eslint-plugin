// 禁止固定睡眠猜测完成；保留明确的超时竞赛和可控时钟。
import { i_testRuleContext } from '../lib/test-rule-context.mjs';
import { i_testPageAnalysis } from '../lib/test-page-analysis.mjs';
import { i_testProperty, i_walkTestNodes } from '../lib/test-quality-analysis.mjs';
export default {
  meta: { type: 'problem', docs: { description: '禁止页面固定等待和单纯定时 Promise 睡眠' }, schema: [], messages: {
    fixedSleep: '固定睡眠猜测异步完成；请等待可观察信号或使用可控时钟',
  } },
  create(context) {
    const { source, api, global, report } = i_testRuleContext(context), pages = i_testPageAnalysis(source, api);
    return {
      CallExpression(node) { pages.register(node); if (i_testProperty(node.callee) === 'waitForTimeout' && pages.page(node.callee.object)) report(node, 'fixedSleep'); },
      NewExpression(node) {
        if (!global(node.callee, 'Promise')) return;
        const executor = node.arguments[0];
        if (!executor?.params?.[0]) return;
        const resolve = source.getScope(executor).set.get(executor.params[0].name);
        i_walkTestNodes(executor.body, child => {
          if (child.type !== 'CallExpression') return false;
          const timer = api.symbol(child.callee);
          const timeout = global(child.callee, 'setTimeout') || timer?.source === 'node:timers' && timer.name.endsWith('setTimeout') || i_testProperty(child.callee) === 'setTimeout' && global(child.callee.object, 'globalThis');
          if (!timeout) return false;
          const list = node.parent;
          if (list?.type === 'ArrayExpression' && list.parent?.type === 'CallExpression' && i_testProperty(list.parent.callee) === 'race' && global(list.parent.callee.object, 'Promise')) return false;
          const callback = child.arguments[0];
          const wakes = api.binding(callback) === resolve || /^(?:ArrowFunctionExpression|FunctionExpression)$/.test(callback?.type) && i_walkTestNodes(callback.body, call => call.type === 'CallExpression' && api.binding(call.callee) === resolve);
          if (wakes && !(callback?.body?.type === 'BlockStatement' && callback.body.body.length > 1)) { report(node, 'fixedSleep'); return true; }
          return false;
        });
      },
    };
  },
};

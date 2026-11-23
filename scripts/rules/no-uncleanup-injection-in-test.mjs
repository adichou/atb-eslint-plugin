// 持续故障注入必须保留移除句柄；once 注入按既有契约自动消费。
import { i_testRuleContext } from '../lib/test-rule-context.mjs';
import { i_testProperty } from '../lib/test-quality-analysis.mjs';
export default {
  meta: { type: 'problem', docs: { description: '持续故障注入不能丢弃清理句柄' }, schema: [], messages: {
    unregisteredInject: '故障注入移除函数被丢弃且没有 once，请登记清理',
  } },
  create(context) {
    const { api, value, report } = i_testRuleContext(context);
    return { CallExpression(node) {
      api.runner(node);
      const target = node.callee.type === 'MemberExpression' ? node.callee.object : null;
      if (i_testProperty(node.callee) !== 't_inject' || !api.symbol(target)?.source.startsWith('litenvi-node/lite-') || node.parent.type !== 'ExpressionStatement') return;
      const once = node.arguments[0]?.properties?.find(property => property.key?.name === 'once');
      if (!value(once?.value).value) report(node, 'unregisteredInject');
    } };
  },
};

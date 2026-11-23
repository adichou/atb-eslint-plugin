// 禁止通过真实测试 API 的 only、skip、todo 缩减执行。
import { i_testRuleContext } from '../lib/test-rule-context.mjs';
export default {
  meta: { type: 'problem', docs: { description: '禁止 only、skip、todo 缩减测试执行' }, schema: [], messages: {
    reducedExecution: '测试不得通过 only/skip/todo 缩减执行', testContextSkip: 'TestContext 不得通过 skip/todo 缩减执行',
  } },
  create(context) {
    const { api, value, report } = i_testRuleContext(context);
    return { CallExpression(node) {
      const registration = api.runner(node);
      if (!registration) return;
      if (registration.reduced) report(node, registration.kind === 'hook' && ['skip', 'todo'].includes(registration.name) ? 'testContextSkip' : 'reducedExecution');
      for (const argument of node.arguments) if (argument.type === 'ObjectExpression') {
        for (const property of argument.properties) {
          if (property.type === 'SpreadElement' || property.computed) continue;
          const key = property.key.name || property.key.value, result = value(property.value);
          if (['only', 'skip', 'todo'].includes(key) && result.known && result.value) report(property, 'reducedExecution');
        }
      }
    } };
  },
};

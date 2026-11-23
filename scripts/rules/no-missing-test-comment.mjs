// 测试注释只检查紧邻且非空；业务含义与详细格式交给评审。
import { i_testRuleContext, i_testComment } from '../lib/test-rule-context.mjs';
export default {
  meta: { type: 'problem', docs: { description: '测试须有紧邻非空注释，可选要求需求或 Bug 单号' }, schema: [{ type: 'object', properties: { requireItemNumber: { type: 'boolean' } }, additionalProperties: false }], messages: {
    missingScenario: '测试用例缺少紧邻的非空注释', missingItemNumber: '测试注释缺少所要求的 REQ-/BUG- 单号',
  } },
  create(context) {
    const { source, api, report } = i_testRuleContext(context), cases = [];
    return {
      CallExpression(node) { const registration = api.runner(node); if (registration?.kind === 'test' && registration.callback) cases.push(node); },
      'Program:exit'() {
        for (const node of cases) {
          const comment = i_testComment(source, node);
          if (!comment) report(node, 'missingScenario');
          if (context.options[0]?.requireItemNumber && comment && !/\b(?:REQ|BUG)-\d{8}-\d{3}\b/.test(comment.value)) report(node, 'missingItemNumber');
        }
      },
    };
  },
};

// 测试经真实入口执行业务；只禁止可确认的业务方法替换，环境数据保持可写。
import { i_testBoundaryContext, i_testPathInside } from '../lib/test-rule-context.mjs';
import { i_testProperty, i_testSourceTarget } from '../lib/test-quality-analysis.mjs';
export default {
  meta: { type: 'problem', docs: { description: '禁止测试替换本项目生产模块的业务方法' }, schema: [{ type: 'object', properties: { testDir: { type: 'string' } }, additionalProperties: false }], messages: {
    businessReplacement: '测试不能替换本项目业务实现；通过真实入口执行，在环境门面或已设计的测试接口装配依赖',
  } },
  create(context) {
    const state = i_testBoundaryContext(context);
    if (!state) return {};
    const { api, global, report, filename, root, testDir } = state;
    const business = node => {
      const identity = api.symbol(node);
      if (!identity) return false;
      const target = i_testSourceTarget(filename, identity.source);
      return target && i_testPathInside(root, target) && !i_testPathInside(testDir, target);
    };
    const callable = node => {
      if (!node) return false;
      if (/Function/.test(node.type)) return true;
      const def = api.binding(node)?.defs[0];
      return def?.type === 'FunctionName' || /Function/.test(def?.node?.init?.type);
    };
    return {
      AssignmentExpression(node) { if (node.left.type === 'MemberExpression' && callable(node.right) && business(node.left.object)) report(node, 'businessReplacement'); },
      CallExpression(node) {
        api.runner(node);
        const method = i_testProperty(node.callee), object = node.callee.type === 'MemberExpression' ? node.callee.object : null;
        const identity = api.symbol(node.callee);
        if (['node:test', 'node:test-context'].includes(identity?.source) && /(?:^|\.)mock\.(?:method|getter|setter)$/.test(identity.name) && node.arguments.length >= 3 && business(node.arguments[0])) report(node, 'businessReplacement');
        if (global(object, 'Object') && ['defineProperty', 'defineProperties', 'assign'].includes(method) && business(node.arguments[0])) {
          const values = method === 'defineProperty' ? [node.arguments[2]] : node.arguments.slice(1);
          const replaces = values.some(value => value?.type === 'ObjectExpression' && value.properties.some(property => callable(property.value) || method === 'defineProperties' && property.value?.properties?.some(item => callable(item.value))));
          if (replaces) report(node, 'businessReplacement');
        }
      },
    };
  },
};

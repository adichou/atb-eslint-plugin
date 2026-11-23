// 测试可以复用普通 helper，不能加载另一个可执行测试用例文件。
import { i_testBoundaryContext } from '../lib/test-rule-context.mjs';
import { i_testSourceTarget } from '../lib/test-quality-analysis.mjs';
export default {
  meta: { type: 'problem', docs: { description: '禁止测试导入或再导出其他可执行测试用例文件' }, schema: [{ type: 'object', properties: { testDir: { type: 'string' } }, additionalProperties: false }], messages: {
    testFileDependency: '不能导入另一个测试文件；共享准备、操作和观察放在普通 helper',
  } },
  create(context) {
    const state = i_testBoundaryContext(context);
    if (!state) return {};
    const { filename, global, report } = state;
    const dependency = (node, specifier) => {
      if (typeof specifier !== 'string') return;
      const target = i_testSourceTarget(filename, specifier);
      if (target && /\.test\.[cm]?js$/.test(target)) report(node, 'testFileDependency');
    };
    return {
      ImportDeclaration(node) { dependency(node, node.source.value); },
      ExportNamedDeclaration(node) { if (node.source) dependency(node, node.source.value); },
      ExportAllDeclaration(node) { dependency(node, node.source.value); },
      ImportExpression(node) { if (node.source.type === 'Literal') dependency(node, node.source.value); },
      CallExpression(node) { if (global(node.callee, 'require') && node.arguments[0]?.type === 'Literal') dependency(node, node.arguments[0].value); },
    };
  },
};

// 页面测试通过真实交互驱动，来源可确认时检查响应桩、写请求和强制或合成操作。
import { i_testRuleContext } from '../lib/test-rule-context.mjs';
import { i_testPageAnalysis } from '../lib/test-page-analysis.mjs';
import { i_testProperty, i_walkTestNodes } from '../lib/test-quality-analysis.mjs';
export default {
  meta: { type: 'problem', docs: { description: '禁止页面响应伪造、写请求替代交互和强制或合成点击' }, schema: [{ type: 'object', properties: {
    routeStub: { type: 'boolean' }, fetchWriteInEvaluate: { type: 'boolean' }, banDirectHttp: { type: 'boolean' }, syntheticClick: { type: 'boolean' },
  }, additionalProperties: false }], messages: {
    routeStub: '页面测试不能通过 route 伪造业务响应，应在环境边界注入', fetchWrite: '页面测试不能用写请求代替用户交互',
    directHttp: '页面测试不能直接调用原生 HTTP API 驱动业务', forcedInteraction: '页面操作不能通过 force 绕过可操作性检查，应等待真实可交互状态',
    syntheticClick: '合成 click 不能代替真实页面交互',
  } },
  create(context) {
    const { source, api, value, global, report } = i_testRuleContext(context), pages = i_testPageAnalysis(source, api);
    const options = { routeStub: true, fetchWriteInEvaluate: true, syntheticClick: true, ...(context.options[0] || {}) };
    return {
      CallExpression(node) {
        pages.register(node);
        const callee = node.callee, target = callee.type === 'MemberExpression' ? callee.object : null, method = i_testProperty(callee);
        if (method === 'evaluate' && pages.page(target) && options.fetchWriteInEvaluate) {
          const script = value(node.arguments[0]);
          if (typeof script.value === 'string') {
            let parsed;
            try { const parser = context.languageOptions.parser, settings = { ecmaVersion: 'latest', sourceType: 'script', tokens: true, comment: true, range: true, loc: true }; parsed = parser.parseForESLint ? parser.parseForESLint(script.value, settings).ast : parser.parse(script.value, settings); }
            catch { parsed = null; }
            const shadowed = parsed && i_walkTestNodes(parsed, child => child.type === 'VariableDeclarator' && child.id.name === 'fetch' || child.type === 'FunctionDeclaration' && child.id?.name === 'fetch', true);
            if (parsed && !shadowed) i_walkTestNodes(parsed, child => {
              if (child.type === 'CallExpression' && child.callee.name === 'fetch' && child.arguments[1]?.properties?.some(property => (property.key?.name || property.key?.value) === 'method' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(property.value.value).toUpperCase()))) report(node, 'fetchWrite');
              return false;
            }, true);
          }
        }
        if (pages.page(target)) {
          if (['click', 'dblclick', 'fill', 'check', 'uncheck', 'setChecked', 'hover', 'tap', 'selectOption'].includes(method) && node.arguments.some(argument => argument.type === 'ObjectExpression' && argument.properties.some(property => (property.key?.name || property.key?.value) === 'force' && value(property.value).value === true))) report(node, 'forcedInteraction');
          if (options.routeStub && method === 'route') report(node, 'routeStub');
          if (options.syntheticClick && method === 'dispatchEvent' && value(node.arguments[0]).value === 'click') report(node, 'syntheticClick');
        }
        if (global(callee, 'fetch')) {
          if (options.banDirectHttp && !pages.inEvaluate(node)) report(node, 'directHttp');
          const write = node.arguments[1]?.properties?.some(property => (property.key?.name || property.key?.value) === 'method' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(value(property.value).value).toUpperCase()));
          if (options.fetchWriteInEvaluate && pages.inEvaluate(node) && write) report(node, 'fetchWrite');
        }
      },
      NewExpression(node) {
        if (options.banDirectHttp && global(node.callee, 'XMLHttpRequest') && !pages.inEvaluate(node)) report(node, 'directHttp');
        if (options.syntheticClick && pages.inEvaluate(node) && ['MouseEvent', 'Event'].some(name => global(node.callee, name)) && value(node.arguments[0]).value === 'click') report(node, 'syntheticClick');
      },
    };
  },
};

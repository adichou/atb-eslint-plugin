// 测试定义检查：非空标题、内联具名唯一回调、有效选项与单一完成机制。
import { i_testRuleContext } from '../lib/test-rule-context.mjs';
import { i_walkTestNodes } from '../lib/test-quality-analysis.mjs';
export default {
  meta: { type: 'problem', docs: { description: '检查测试标题、具名回调、选项和完成机制' }, schema: [{ type: 'object', properties: { allowedTestOptions: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }], messages: {
    missingTestName: '测试用例必须有显式非空名称',
    missingTestCallbackName: '测试用例必须使用内联具名函数回调，供 code-ref 方法引用展示和运行',
    duplicateTestCallbackName: "测试回调名 '{{name}}' 在文件内存在多个方法定义，请使用唯一名称",
    callbackAndPromise: '测试回调不能同时使用 done 与 async/Promise 完成机制',
    unknownTestOption: "未知测试选项 '{{key}}'，请核对真实测试 API", unresolvableTestOptions: '测试选项包含无法静态确认的键',
  } },
  create(context) {
    const { source, api, value, empty, report } = i_testRuleContext(context), cases = [];
    const allowed = new Set(context.options[0]?.allowedTestOptions || ['concurrency', 'timeout', 'skip', 'todo', 'only', 'signal', 'plan']);
    return {
      CallExpression(node) {
        const registration = api.runner(node);
        if (!registration) return;
        for (const argument of node.arguments) if (argument.type === 'ObjectExpression') {
          for (const property of argument.properties) {
            if (property.type === 'SpreadElement' || property.computed) { report(property, 'unresolvableTestOptions'); continue; }
            const key = property.key.name || property.key.value, result = value(property.value);
            const reduced = ['only', 'skip', 'todo'].includes(key) && result.known && result.value;
            if (!reduced && !allowed.has(key)) report(property, 'unknownTestOption', { key });
          }
        }
        const callback = registration.callback;
        if (callback?.async && callback.params.length >= 2) report(callback, 'callbackAndPromise');
        if (registration.kind === 'test' && (callback || node.arguments.length > 1 && node.arguments.at(-1).type !== 'ObjectExpression')
          && (callback?.type !== 'FunctionExpression' || !callback.id)) report(callback || node.arguments.at(-1), 'missingTestCallbackName');
        if (registration.kind === 'test' && callback) cases.push({ node, callback });
      },
      'Program:exit'() {
        const methods = new Map();
        const remember = name => { if (name) methods.set(name, (methods.get(name) || 0) + 1); };
        i_walkTestNodes(source.ast, node => {
          if (node.type === 'FunctionDeclaration') remember(node.id?.name);
          else if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && /FunctionExpression$/.test(node.init?.type)) remember(node.id.name);
          else if (['MethodDefinition', 'PropertyDefinition', 'Property'].includes(node.type) && !node.computed
            && (node.type !== 'Property' || node.method || /FunctionExpression$/.test(node.value?.type))) remember(node.key.name || node.key.value);
          return false;
        }, true);
        for (const { callback } of cases) remember(callback.id?.name);
        for (const { node, callback } of cases) {
          if (callback.id && methods.get(callback.id.name) > 1) report(callback.id, 'duplicateTestCallbackName', { name: callback.id.name });
          if (!node.arguments.length || node.arguments[0].type !== 'Identifier' && empty(node.arguments[0]) || /^(?:ArrowFunctionExpression|FunctionExpression|ObjectExpression)$/.test(node.arguments[0]?.type)) report(node, 'missingTestName');
        }
      },
    };
  },
};

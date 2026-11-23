// 按真实浏览器创建链识别页面和定位器，普通同名对象不冒认页面 API。
import { i_testProperty } from './test-quality-analysis.mjs';

export function i_testPageAnalysis(source, api) {
  const pages = new Set();
  const page = (node, seen = new Set()) => {
    if (!node) return false;
    if (node.type === 'AwaitExpression') return page(node.argument, seen);
    if (node.type === 'Identifier') {
      const variable = api.binding(node);
      if (pages.has(variable)) return true;
      if (!variable || seen.has(variable)) return false;
      return page(variable.defs[0]?.node?.init, new Set(seen).add(variable));
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const method = i_testProperty(node.callee), object = api.symbol(node.callee.object);
      if (method === 'page' && object?.source === 'litenvi-node/lite-browser.mjs') return true;
      if (['launch', 'newContext', 'newPage', 'locator', 'getByRole', 'getByText', 'getByTestId'].includes(method)) return object && ['playwright', '@playwright/test'].includes(object.source) || page(node.callee.object, seen);
    }
    return false;
  };
  const register = node => {
    const registration = api.runner(node), callback = registration?.callback;
    if (registration?.kind === 'test' && callback?.params[0]?.type === 'ObjectPattern') {
      for (const property of callback.params[0].properties) if (property.key?.name === 'page') pages.add(source.getScope(callback).set.get(property.value.name));
    }
    return registration;
  };
  const inEvaluate = node => {
    for (let parent = node.parent; parent; parent = parent.parent) if (parent.type === 'CallExpression' && i_testProperty(parent.callee) === 'evaluate' && page(parent.callee.object)) return true;
    return false;
  };
  return { page, register, inEvaluate };
}

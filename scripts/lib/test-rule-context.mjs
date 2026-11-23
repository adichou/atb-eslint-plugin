// 独立测试规则共用的来源、常量和清理位置分析，不决定诊断类别。
import path from 'node:path';
import { i_projectRootOf } from './attributions.mjs';
import { i_testApiAnalysis } from './test-quality-analysis.mjs';

export const i_testPathInside = (directory, file) => file === directory || file.startsWith(directory + path.sep);

// 内部：每条规则使用自己的诊断上下文，来源分析只证明可静态确认的绑定。
export function i_testRuleContext(context) {
  const source = context.sourceCode;
  const api = i_testApiAnalysis(source, context.filename);
  const value = (node, seen = new Set()) => {
    if (!node) return { known: true, value: undefined };
    if (node.type === 'Literal') return { known: true, value: node.value };
    if (node.type === 'TemplateLiteral' && !node.expressions.length) return { known: true, value: node.quasis[0].value.cooked };
    if (node.type === 'Identifier') {
      const variable = api.binding(node);
      if (node.name === 'undefined' && !variable?.defs.length) return { known: true, value: undefined };
      if (!variable || seen.has(variable) || variable.references.some(ref => ref.isWrite() && !ref.init)) return { known: false };
      const def = variable.defs[0];
      if (def?.type === 'Variable' && def.node.id.type === 'Identifier') return value(def.node.init, new Set(seen).add(variable));
    }
    return { known: false };
  };
  const empty = node => {
    const result = value(node);
    return result.known && (result.value == null || typeof result.value === 'string' && !result.value.trim());
  };
  const global = (node, name) => node?.type === 'Identifier' && node.name === name && !api.binding(node)?.defs.length;
  const report = (node, messageId, data) => context.report({ node, messageId, ...(data ? { data } : {}) });
  return { source, api, value, empty, global, report };
}

// 内部：隔离与清理规则只管测试目录，直接单独启用时也保持该边界。
export function i_testBoundaryContext(context) {
  const filename = path.resolve(context.filename);
  const root = i_projectRootOf(filename);
  if (!root) return null;
  const testDir = path.resolve(root, context.options[0]?.testDir || 'scripts/tests');
  return i_testPathInside(testDir, filename) ? { ...i_testRuleContext(context), filename, root, testDir } : null;
}

// 内部：查找当前方法所属的函数或模块。
export function i_testFrame(node) {
  for (let parent = node.parent; parent; parent = parent.parent) if (/Function/.test(parent.type) || parent.type === 'Program') return parent;
  return null;
}

// 内部：只认可 finally、真实测试 hook 或返回给调用方的清理函数。
export function i_testCleanupOwner(node, api) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'TryStatement' && parent.finalizer && node.range[0] >= parent.finalizer.range[0] && node.range[1] <= parent.finalizer.range[1]) return i_testFrame(parent);
    if (/Function/.test(parent.type)) {
      const call = parent.parent;
      if (call?.type === 'CallExpression' && ['after', 'afterEach'].includes(api.runner(call)?.name)) return i_testFrame(call);
      if (call?.type === 'ReturnStatement') return i_testFrame(call);
      return null;
    }
  }
  return null;
}

// 内部：说明必须紧邻当前注册语句。
export function i_testComment(source, call) {
  let statement = call;
  while (statement.parent && !['Program', 'BlockStatement'].includes(statement.parent.type)) statement = statement.parent;
  const comment = source.getCommentsBefore(statement).at(-1);
  return comment && comment.loc.end.line >= statement.loc.start.line - 1 && comment.value.replace(/\*/g, '').trim() ? comment : null;
}

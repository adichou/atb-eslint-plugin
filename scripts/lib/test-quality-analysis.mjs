// 测试质量检查的共享分析：按词法绑定识别 API，只证明能够静态确认的调用与 Promise 归属。
import path from 'node:path';
import { i_projectRootOf } from './attributions.mjs';
import { i_normalizeTestModule } from './test-module-exceptions.mjs';
import { i_testEntryManifest, i_resolveTestModule, i_isTestImportEntry } from './test-entry-analysis.mjs';

const f_ASSERT_METHODS = new Set(['ok', 'equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'throws', 'doesNotThrow', 'rejects', 'doesNotReject', 'fail', 'ifError', 'partialDeepStrictEqual']);

// 内部：识别静态成员名，不把计算出的运行时键猜成 API。
export function i_testProperty(node) {
  return node?.type === 'MemberExpression' ? (!node.computed ? node.property.name : node.property.type === 'Literal' ? node.property.value : null) : null;
}

// 内部：遍历可执行语法，默认不进入另一个函数；字符串与注释不作为代码。
export function i_walkTestNodes(root, visit, nested = false) {
  if (!root || typeof root.type !== 'string') return false;
  if (visit(root)) return true;
  if (!nested && /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(root.type)) return false;
  if (!nested && root.type === 'BlockStatement') {
    for (const statement of root.body) {
      if (i_walkTestNodes(statement, visit, nested)) return true;
      if (['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement'].includes(statement.type)) break;
    }
    return false;
  }
  if (!nested && ['IfStatement', 'ConditionalExpression'].includes(root.type) && root.test.type === 'Literal') {
    return i_walkTestNodes(root.test, visit, nested) || i_walkTestNodes(root.test.value ? root.consequent : root.alternate, visit, nested);
  }
  if (!nested && root.type === 'LogicalExpression' && root.left.type === 'Literal') {
    const executes = root.operator === '&&' ? !!root.left.value : root.operator === '||' ? !root.left.value : root.left.value == null;
    return i_walkTestNodes(root.left, visit, nested) || executes && i_walkTestNodes(root.right, visit, nested);
  }
  return Object.entries(root).some(([key, value]) => {
    if (['parent', 'tokens', 'comments', 'loc', 'range'].includes(key)) return false;
    return Array.isArray(value) ? value.some(child => i_walkTestNodes(child, visit, nested)) : value?.type ? i_walkTestNodes(value, visit, nested) : false;
  });
}

// 内部：同一文件内追踪导入、简单别名与解构，不执行源码。
export function i_testApiAnalysis(sourceCode, filename = '') {
  const sources = new Map();
  // 私有：真实路径与清单公开面共同确定模块身份，相对导入不靠 basename 冒认。
  const f_source = specifier => {
    if (!specifier.startsWith('.') || !path.isAbsolute(filename)) return i_normalizeTestModule(specifier);
    if (sources.has(specifier)) return sources.get(specifier);
    let canonical = specifier;
    const target = path.resolve(path.dirname(filename), specifier);
    const root = i_projectRootOf(target);
    if (root) {
      const info = i_testEntryManifest(root);
      if (info.manifest.name === 'litenvi-node' && i_isTestImportEntry(root, info, target)) canonical = `litenvi-node/${path.basename(target)}`;
    }
    sources.set(specifier, canonical);
    return canonical;
  };
  const contexts = new Set();
  const binding = node => node?.type === 'Identifier'
    ? sourceCode.getScope(node).references.find(ref => ref.identifier === node)?.resolved || sourceCode.getScope(node).set.get(node.name) : null;
  const symbol = (node, seen = new Set()) => {
    if (!node) return null;
    if (node.type === 'ChainExpression' || node.type === 'AwaitExpression') return symbol(node.expression || node.argument, seen);
    if (node.type === 'Identifier') {
      const variable = binding(node);
      if ((!variable || !variable.defs.length) && node.name === 'process') return { source: 'node:process', name: 'default' };
      if (variable && contexts.has(variable)) return { source: 'node:test-context', name: '' };
      if (!variable || seen.has(variable)) return null;
      const next = new Set(seen).add(variable);
      const def = variable.defs[0];
      if (def?.type === 'Parameter' && def.node.type === 'FunctionDeclaration') {
        const fn = def.node;
        const index = fn.params.indexOf(def.name);
        const callable = sourceCode.getDeclaredVariables(fn).find(item => item.defs.some(definition => definition.type === 'FunctionName'));
        for (const reference of callable?.references || []) {
          const call = reference.identifier.parent;
          if (call.type === 'CallExpression' && call.callee === reference.identifier) {
            const input = symbol(call.arguments[index], next);
            if (input?.source === 'node:test-context') return input;
          }
        }
      }
      if (def?.type === 'ImportBinding') {
        const imported = def.node;
        return { source: f_source(def.parent.source.value), name: imported.type === 'ImportSpecifier' ? imported.imported.name || imported.imported.value : imported.type === 'ImportNamespaceSpecifier' ? '*' : 'default' };
      }
      if (def?.type === 'Variable') {
        const value = symbol(def.node.init, next);
        if (def.node.id.type === 'ObjectPattern') {
          const property = def.node.id.properties.find(item => item.value === def.name);
          return value && property ? { ...value, name: `${value.name}.${property.key.name || property.key.value}` } : null;
        }
        return value;
      }
      return null;
    }
    if (node.type === 'MemberExpression') {
      const base = symbol(node.object, seen), key = i_testProperty(node);
      return base && key !== null && key !== undefined ? { ...base, name: `${base.name}.${key}` } : null;
    }
    if (node.type === 'CallExpression') {
      const callee = symbol(node.callee, seen);
      if (callee && ['node:http', 'node:net', 'litenvi-node/lite-server.mjs'].includes(callee.source) && callee.name.endsWith('.createServer')) return { ...callee, name: 'server' };
      if (callee?.source === 'litenvi-node/lite-cmd-mgr.mjs' && callee.name.endsWith('.command')) return { source: callee.source, name: 'command-handle' };
      if (callee?.source === '@playwright/test' && /(?:^|\.)expect\.configure$/.test(callee.name)) return { source: callee.source, name: 'expect' };
    }
    return null;
  };
  const runner = call => {
    const api = symbol(call.callee);
    if (!api || !['node:test', 'node:test-context', '@playwright/test'].includes(api.source)) return null;
    if (api.source === '@playwright/test' && !api.name.startsWith('test')) return null;
    let parts = api.name.split('.').filter(part => part !== '*');
    if (parts[0] === 'default') parts = ['test', ...parts.slice(1)];
    if (api.source === 'node:test-context') parts = parts.filter(Boolean);
    const name = parts[0];
    if (!['test', 'it', 'describe', 'suite', 'before', 'after', 'beforeEach', 'afterEach', 'skip', 'todo'].includes(name)) return null;
    const callback = call.arguments.findLast(arg => /^(?:ArrowFunctionExpression|FunctionExpression)$/.test(arg.type));
    if (callback?.params[0]?.type === 'Identifier' && ['test', 'it', 'before', 'after', 'beforeEach', 'afterEach'].includes(name)) {
      const parameter = sourceCode.getScope(callback).set.get(callback.params[0].name);
      if (parameter) contexts.add(parameter);
    }
    return { name, callback, reduced: parts.find(part => ['skip', 'only', 'todo'].includes(part)), kind: ['describe', 'suite'].includes(name) ? 'suite' : ['test', 'it'].includes(name) ? 'test' : 'hook', subtest: api.source === 'node:test-context' && name === 'test' };
  };
  const assertion = call => {
    const api = symbol(call.callee);
    if (api && ['node:assert', 'node:assert/strict'].includes(api.source)) {
      const parts = api.name.split('.').filter(part => !['default', '*', 'strict'].includes(part));
      const method = parts.at(-1) || 'ok';
      if (f_ASSERT_METHODS.has(method)) return { type: 'assert', method, call, root: call };
    }
    if (call.callee.type !== 'MemberExpression' || !/^to[A-Z]/.test(String(i_testProperty(call.callee)))) return null;
    let object = call.callee.object, negated = false;
    while (object?.type === 'MemberExpression' && ['not', 'resolves', 'rejects'].includes(i_testProperty(object))) { if (i_testProperty(object) === 'not') negated = true; object = object.object; }
    if (object?.type !== 'CallExpression') return null;
    const expect = symbol(object.callee);
    if (expect?.source !== '@playwright/test' || !/^(?:\*\.)?expect(?:\.(?:soft|poll))?$/.test(expect.name)) return null;
    return { type: 'expect', method: i_testProperty(call.callee), call, root: object, negated, poll: expect.name.endsWith('.poll') };
  };
  const consumed = (node, visited = new Set()) => {
    let current = node;
    for (let parent = current.parent; parent; current = parent, parent = parent.parent) {
      if (parent.type === 'AwaitExpression' && parent.argument === current) return true;
      if (parent.type === 'ReturnStatement') return parent.argument === current;
      if (/^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(parent.type)) return parent.type === 'ArrowFunctionExpression' && parent.body === current;
      if (parent.type === 'VariableDeclarator' && parent.init === current && parent.id.type === 'Identifier') {
        const variable = binding(parent.id);
        if (!variable || visited.has(variable)) return false;
        const next = new Set(visited).add(variable);
        return variable.references.some(ref => ref.isRead() && consumed(ref.identifier, next));
      }
      if (parent.type === 'MemberExpression' && parent.object === current && ['then', 'catch', 'finally'].includes(i_testProperty(parent))) {
        if (parent.parent?.type !== 'CallExpression' || parent.parent.callee !== parent) return false;
        current = parent.parent; parent = current; continue;
      }
      if (parent.type === 'CallExpression') {
        const callee = parent.callee;
        const consumer = assertion(parent);
        if (consumer?.type === 'assert' && ['rejects', 'doesNotReject'].includes(consumer.method) && parent.arguments[0] === current) continue;
        const aggregate = callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'Promise' && !binding(callee.object)?.defs.length && ['all', 'allSettled', 'resolve'].includes(i_testProperty(callee));
        if (!aggregate) return false;
      } else if (!['ArrayExpression', 'ChainExpression', 'ConditionalExpression', 'LogicalExpression', 'ReturnStatement'].includes(parent.type)) return false;
    }
    return false;
  };
  return { binding, symbol, runner, assertion, consumed, moduleSource: f_source };
}

// 内部：认可本例直接断言，以及已调用本地 helper 明确执行的回调；不借用 helper 内隐藏的断言。
export function i_testHasAssertions(root, api, visited = new Set()) {
  return i_walkTestNodes(root, node => {
    if (node.type !== 'CallExpression') return false;
    if (api.assertion(node) || api.runner(node)?.subtest && api.consumed(node)) return true;
    if (node.callee.type !== 'Identifier') return false;
    const variable = api.binding(node.callee);
    const def = variable?.defs[0];
    const fn = def?.type === 'FunctionName' ? def.node : def?.node?.init;
    if (!fn?.params || visited.has(fn)) return false;
    return node.arguments.some((argument, index) => {
      if (!/^(?:FunctionExpression|ArrowFunctionExpression)$/.test(argument.type) || fn.params[index]?.type !== 'Identifier') return false;
      const parameter = fn.params[index];
      const called = i_walkTestNodes(fn.body, child => child.type === 'CallExpression' && child.callee.type === 'Identifier' && child.callee.name === parameter.name && api.binding(child.callee)?.defs.some(item => item.name === parameter));
      return called && i_testHasAssertions(argument.body, api, new Set(visited).add(fn));
    });
  });
}

// 内部：解析当前文件静态导入的实际目标，供依赖与替换边界检查共用。
export function i_testSourceTarget(filename, specifier, virtualFiles = new Set()) {
  const root = i_projectRootOf(filename);
  if (!root) return null;
  return i_resolveTestModule(root, i_testEntryManifest(root), filename, specifier, virtualFiles);
}

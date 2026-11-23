// 全项目模块黑名单：原生环境能力与追加模块统一检查，仅内置 litenvi 的必要原生实现。
import path from 'node:path';
import { i_testApiAnalysis, i_testProperty } from '../lib/test-quality-analysis.mjs';
import { i_normalizeTestModule, i_builtinModuleAllows } from '../lib/test-module-exceptions.mjs';

const f_ENVIRONMENT = ['fs', 'http', 'https', 'net', 'tls', 'dgram', 'dns', 'child_process', 'worker_threads', 'os', 'process', 'timers', 'cluster', 'readline', 'inspector', 'sqlite', 'tty'];

function f_binding(node, source) {
  for (let scope = source.getScope(node); scope; scope = scope.upper) {
    if (scope.set.has(node.name)) return scope.set.get(node.name);
  }
  return null;
}

// 私有：模块名仅求值稳定字符串，不执行调用，不借宿主路径或影子构造器猜测目标。
function f_string(node, source, seen = new Set()) {
  const unknown = { resolved: false };
  if (!node) return unknown;
  if (node.type === 'Literal' && typeof node.value === 'string') return { resolved: true, value: node.value };
  if (node.type === 'Identifier') {
    const variable = f_binding(node, source);
    if (!variable || seen.has(variable)) return unknown;
    const definition = variable.defs[0];
    if (definition?.type !== 'Variable' || definition.parent.kind !== 'const' || variable.references.some(ref => ref.isWrite() && !ref.init)) return unknown;
    return f_string(definition.node.init, source, new Set(seen).add(variable));
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = f_string(node.left, source, seen), right = f_string(node.right, source, seen);
    return left.resolved && right.resolved ? { resolved: true, value: left.value + right.value } : unknown;
  }
  if (node.type === 'TemplateLiteral') {
    let value = node.quasis[0].value.cooked;
    for (let i = 0; i < node.expressions.length; i++) {
      const part = f_string(node.expressions[i], source, seen);
      if (!part.resolved) return unknown;
      value += part.value + node.quasis[i + 1].value.cooked;
    }
    return { resolved: true, value };
  }
  return unknown;
}

// 私有：复用绑定归因，再补 require/createRequire/getBuiltinModule 的加载器身份与别名。
function f_analysis(source, filename) {
  const api = i_testApiAnalysis(source, filename);
  const resolve = (node, seen = new Set()) => {
    if (!node) return null;
    const known = api.symbol(node);
    if (known) return known;
    if (node.type === 'ChainExpression' || node.type === 'AwaitExpression') return resolve(node.expression || node.argument, seen);
    if (node.type === 'Identifier') {
      const variable = f_binding(node, source);
      if (!variable?.defs.length) return node.name === 'require' ? { source: '@native-loader', name: 'require' } : null;
      if (seen.has(variable)) return null;
      const next = new Set(seen).add(variable);
      const definition = variable.defs[0];
      if (definition.type !== 'Variable') return null;
      const original = resolve(definition.node.init, next);
      if (definition.node.id.type === 'ObjectPattern') {
        const property = definition.node.id.properties.find(item => item.value === definition.name);
        return original && property ? { ...original, name: `${original.name}.${property.key.name || property.key.value}` } : null;
      }
      return original;
    }
    if (node.type === 'MemberExpression') {
      const key = i_testProperty(node);
      if (key === null) return null;
      if (node.object.type === 'Identifier' && !f_binding(node.object, source)?.defs.length) {
        if (['globalThis', 'global'].includes(node.object.name) && key === 'process') return { source: 'node:process', name: 'default' };
        if (node.object.name === 'module' && key === 'require') return { source: '@native-loader', name: 'require' };
      }
      const object = resolve(node.object, seen);
      return object ? { ...object, name: `${object.name}.${key}` } : null;
    }
    if (node.type === 'CallExpression') {
      if (i_testProperty(node.callee) === 'bind') {
        const original = resolve(node.callee.object, seen);
        if (f_loader(original)) return { ...original, boundArgs: [...(original.boundArgs || []), ...node.arguments.slice(1)] };
      }
      const callable = resolve(node.callee, seen);
      if (callable?.source === 'node:module' && /(?:^|\.)createRequire$/.test(callable.name)) return { source: '@native-loader', name: 'require' };
      const invocation = f_invocation(node, value => resolve(value, seen));
      if (invocation) {
        const value = f_string(invocation.target, source);
        return value.resolved ? { source: i_normalizeTestModule(value.value), name: 'default' } : null;
      }
    }
    return null;
  };
  return resolve;
}

function f_loader(api) {
  if (api?.source === '@native-loader' && api.name === 'require') return 'require';
  return api?.source === 'node:process' && /(?:^|\.)getBuiltinModule$/.test(api.name) ? 'builtin' : null;
}

function f_invocation(node, symbol) {
  const method = i_testProperty(node.callee);
  const indirect = ['call', 'apply'].includes(method);
  const api = symbol(indirect ? node.callee.object : node.callee);
  const kind = f_loader(api);
  if (!kind) return null;
  const args = !indirect ? node.arguments : method === 'call' ? node.arguments.slice(1)
    : node.arguments[1]?.type === 'ArrayExpression' ? node.arguments[1].elements : [];
  return { kind, target: [...(api.boundArgs || []), ...args][0] };
}

export default {
  meta: {
    type: 'problem',
    docs: { description: '全项目模块黑名单：禁止直接加载原生环境能力及追加禁止的模块' },
    schema: [{ type: 'object', additionalProperties: false, properties: {
      deniedModules: { type: 'array', items: { type: 'string' } },
    } }],
    messages: {
      deniedModule: "禁止加载 '{{specifier}}'（命中模块黑名单 '{{denied}}'）：环境能力应走 lite 门面，仅 litenvi-node 的内置原生底层和对照文件允许直接调用",
      unknownBuiltin: 'getBuiltinModule 的目标必须静态明确，不能通过运行时模块名绕过原生环境检查',
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const filename = path.resolve(context.filename);
    const denied = [...f_ENVIRONMENT.map(name => `node:${name}`), ...(options.deniedModules || []).map(i_normalizeTestModule)];
    const source = context.sourceCode;
    const symbol = f_analysis(source, filename);
    const check = (node, specifier) => {
      if (typeof specifier !== 'string') return;
      const target = i_normalizeTestModule(specifier);
      const matched = denied.find(item => target === item || target.startsWith(`${item}/`));
      if (!matched || i_builtinModuleAllows(filename, target)) return;
      context.report({ node, messageId: 'deniedModule', data: { specifier, denied: matched } });
    };
    return {
      ImportDeclaration(node) { check(node, node.source.value); },
      ExportNamedDeclaration(node) { if (node.source) check(node, node.source.value); },
      ExportAllDeclaration(node) { check(node, node.source.value); },
      ImportExpression(node) {
        const value = f_string(node.source, source);
        if (value.resolved) check(node, value.value);
      },
      CallExpression(node) {
        const invocation = f_invocation(node, symbol);
        if (!invocation) return;
        const value = f_string(invocation.target, source);
        if (value.resolved) check(node, value.value);
        else if (invocation.kind === 'builtin') context.report({ node, messageId: 'unknownBuiltin' });
      },
    };
  },
};

// 配置守护与 config 分区共用证据：只分析 AST，不执行受检配置或测试代码。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'litenvi-node/lite-fs.mjs';
import { i_evaluateStaticString } from './attributions.mjs';
import { i_hookEntries } from './hook-entries.mjs';

const f_ASSERT = new Set(['node:assert', 'node:assert/strict']);
const f_FS = new Set(['node:fs', 'fs', 'node:fs/promises', 'fs/promises', 'litenvi-node/lite-fs.mjs']);
const f_FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

// 内部：配置登记来自既有清单、根 ESLint 配置与明确指定的 hook 目录。
export function i_configEntries(root, { packageJsonPath = 'package.json', hooksDir = '' } = {}) {
  if (path.isAbsolute(packageJsonPath) || path.relative(root, path.resolve(root, packageJsonPath)).startsWith('..')) throw new Error('packageJsonPath 必须是相对包根的相对路径，不能越界');
  return [
    { config: packageJsonPath, fields: ['name', 'exports'] },
    { config: 'eslint.config.mjs', fields: ['rules', 'plugins'] },
    ...i_hookEntries(root, hooksDir).configs,
  ].filter(entry => fs.existsSync(path.resolve(root, entry.config)));
}

// 内部：配置对应的约定守护测试名称。
export function i_configTestName(config) {
  const base = path.basename(config);
  return `${base.slice(0, base.lastIndexOf('.'))}.test.mjs`;
}

// 私有：只枚举 AST 子节点，跳过 ESLint 的父引用和元数据。
function f_children(node) {
  return Object.entries(node).flatMap(([key, value]) => ['parent', 'loc', 'range', 'tokens', 'comments'].includes(key) ? [] : Array.isArray(value) ? value.filter(item => item?.type) : value?.type ? [value] : []);
}

// 内部：核验配置实际读取结果是否参与了 node:assert 的关键字段断言。
export function i_configTestEvidence(testFile, configPath, fields, parser, sourceText, cwd = path.dirname(configPath)) {
  const result = { read: false, assertCall: false, fieldAssert: false };
  let ast;
  try {
    const options = { ecmaVersion: 'latest', sourceType: testFile.endsWith('.cjs') ? 'commonjs' : 'module', range: true };
    ast = parser.parseForESLint ? parser.parseForESLint(sourceText, options).ast : parser.parse(sourceText, options);
  } catch { return result; }
  const scopes = new WeakMap(), active = new Set();
  const targets = new Set([configPath, pathToFileURL(configPath).href]);
  // 私有：解构与参数同样建立绑定，避免局部同名变量冒用外层配置。
  function f_declare(scope, pattern, binding) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') scope.bindings.set(pattern.name, binding);
    else if (pattern.type === 'AssignmentPattern') f_declare(scope, pattern.left, binding);
    else if (pattern.type === 'RestElement') f_declare(scope, pattern.argument, binding);
    else if (pattern.type === 'ObjectPattern') for (const property of pattern.properties) f_declare(scope, property.value || property.argument, { ...binding, fields: [...(binding.fields || []), property.key?.name || property.key?.value] });
    else if (pattern.type === 'ArrayPattern') for (const item of pattern.elements) f_declare(scope, item, binding);
  }
  // 私有：建作用域，局部假对象和参数不能冒用外层导入或读取结果。
  function f_index(node, scope) {
    if (node.type === 'FunctionDeclaration' && node.id) scope.bindings.set(node.id.name, { node, kind: 'function' });
    if (f_FUNCTIONS.has(node.type) || node.type === 'BlockStatement') scope = { parent: scope, bindings: new Map() };
    scopes.set(node, scope);
    if (f_FUNCTIONS.has(node.type)) for (const param of node.params) f_declare(scope, param, { kind: 'parameter' });
    if (node.type === 'VariableDeclarator') f_declare(scope, node.id, { node: node.init, kind: 'value' });
    if (node.type === 'ImportDeclaration') for (const spec of node.specifiers) scope.bindings.set(spec.local.name, { kind: 'import', source: node.source.value, imported: spec.imported?.name || spec.type });
    for (const child of f_children(node)) f_index(child, scope);
  }
  f_index(ast, { parent: null, bindings: new Map() });
  // 私有：按词法作用域取绑定，不按变量名猜 API。
  function f_binding(node) {
    if (node?.type !== 'Identifier') return null;
    for (let scope = scopes.get(node); scope; scope = scope.parent) if (scope.bindings.has(node.name)) return scope.bindings.get(node.name);
    return null;
  }
  // 私有：取模块对象的根绑定，用于识别 fs、assert 和 node:test。
  function f_source(node) {
    while (node?.type === 'MemberExpression') node = node.object;
    return f_binding(node)?.source;
  }
  // 私有：有限追踪常量路径，路径字符串本身不算读取证据。
  function f_path(node, seen = new Set()) {
    if (!node || seen.has(node)) return null;
    seen = new Set(seen).add(node);
    if (node.type === 'Identifier') return f_path(f_binding(node)?.node, seen);
    const evaluated = i_evaluateStaticString(node, {}, testFile);
    if (!evaluated.resolved || typeof evaluated.value !== 'string') return null;
    return targets.has(evaluated.value) || targets.has(path.resolve(cwd, evaluated.value)) ? configPath : null;
  }
  // 私有：只认可已绑定的文件读取 API，以及实际配置 import。
  function f_reads(node) {
    if (node?.type !== 'CallExpression') return false;
    const method = node.callee.type === 'MemberExpression' ? node.callee.property.name : f_binding(node.callee)?.imported;
    return f_FS.has(f_source(node.callee)) && ['readFile', 'readFileSync'].includes(method) && !!f_path(node.arguments[0]);
  }
  // 私有：追踪读取结果和配置派生值；普通函数不能凭同名方法伪造来源。
  function f_origin(node, seen = new Set()) {
    if (!node || seen.has(node)) return false;
    seen = new Set(seen).add(node);
    if (node.type === 'Identifier') {
      const binding = f_binding(node);
      if (binding?.kind === 'import') return binding.source.startsWith('.') && path.resolve(path.dirname(testFile), binding.source) === configPath;
      return f_origin(binding?.node, seen);
    }
    if (node.type === 'AwaitExpression' || node.type === 'ChainExpression') return f_origin(node.argument || node.expression, seen);
    if (node.type === 'MemberExpression') return f_origin(node.object, seen);
    if (node.type === 'CallExpression') {
      if (f_reads(node)) return true;
      const object = node.callee.type === 'MemberExpression' ? node.callee.object : null;
      if (object?.type === 'Identifier' && ['JSON', 'Object', 'Array'].includes(object.name) && !f_binding(object)) return node.arguments.some(arg => f_origin(arg, seen));
      return f_origin(object, seen);
    }
    if (['BinaryExpression', 'LogicalExpression', 'UnaryExpression'].includes(node.type)) return f_children(node).some(child => f_origin(child, seen));
    return false;
  }
  // 私有：字段须出现在实际比较表达式中，断言说明文本不提供证据。
  function f_fields(node) {
    if (!node) return false;
    if (node.type === 'Identifier' && f_binding(node)?.fields?.some(field => fields.includes(field)) && f_origin(node)) return true;
    if (node.type === 'MemberExpression' && fields.includes(node.computed ? node.property.value : node.property.name)) return true;
    if (node.type === 'Literal' && node.regex && fields.some(field => new RegExp(`\\b${field}\\b`).test(node.regex.pattern))) return true;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'hasOwn' && fields.includes(node.arguments[1]?.value)) return true;
    return f_children(node).some(f_fields);
  }
  // 私有：只进入实际注册的测试回调或已调用本地函数，未调用函数和 skip/todo 不作证。
  function f_live(node) {
    if (!node || f_FUNCTIONS.has(node.type)) return;
    if (node.type === 'IfStatement' && node.test.type === 'Literal') { f_live(node.test.value ? node.consequent : node.alternate); return; }
    if (node.type === 'ImportDeclaration' && node.source.value.startsWith('.') && path.resolve(path.dirname(testFile), node.source.value) === configPath) result.read = true;
    if (node.type === 'CallExpression') {
      if (f_reads(node)) result.read = true;
      if (f_ASSERT.has(f_source(node.callee))) {
        result.assertCall = true;
        if (f_origin(node.arguments[0]) && node.arguments.slice(0, 2).some(f_fields)) result.fieldAssert = true;
      }
      if (f_source(node.callee) === 'node:test') {
        if (node.callee.type === 'MemberExpression' && ['skip', 'todo'].includes(node.callee.property.name)) return;
        if (node.arguments.some(arg => arg.type === 'ObjectExpression' && arg.properties.some(prop => ['skip', 'todo'].includes(prop.key?.name) && prop.value?.value === true))) return;
        for (const arg of node.arguments) if (f_FUNCTIONS.has(arg.type)) f_live(arg.body);
      }
      const binding = f_binding(node.callee);
      if (binding?.kind === 'function' && !active.has(binding.node)) { active.add(binding.node); f_live(binding.node.body); active.delete(binding.node); }
    }
    for (const child of f_children(node)) f_live(child);
  }
  f_live(ast);
  return result;
}

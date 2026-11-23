// 模块访问的静态归因：文件路径按真实包归属判定，包名加载保留 Node 入口语义。
// 不执行模块；常量与标准 path/URL 构造按真实绑定解析，未知目标交由调用方决定诊断策略。
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isBuiltin } from 'node:module';
import { i_packageNameOf, i_projectRootOf, i_repoRelative } from './attributions.mjs';
import { i_testApiAnalysis, i_testProperty } from './test-quality-analysis.mjs';

function f_realpath(file) {
  try { return fs.realpathSync(file); } catch { return path.resolve(file); }
}

function f_manifest(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { return {}; }
}

// 私有：标准条件遵循声明顺序，import 与 require 不能互相借用另一分支。
function f_condition(value, mode) {
  if (typeof value === 'string' || value === null) return value;
  if (Array.isArray(value)) return value.map(item => f_condition(item, mode)).find(item => typeof item === 'string') ?? null;
  if (value && typeof value === 'object') {
    for (const [condition, target] of Object.entries(value)) {
      if (['node', 'node-addons', mode, 'default'].includes(condition)) return f_condition(target, mode);
    }
  }
  return null;
}

// 私有：精确子路径优先于通配模式，显式 null 不回退到其他入口。
function f_mapping(map, key, mode) {
  if (Object.hasOwn(map, key)) return f_condition(map[key], mode);
  const patterns = Object.keys(map).filter(pattern => pattern.includes('*')).sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length);
  for (const pattern of patterns) {
    const [prefix, suffix] = pattern.split('*');
    if (!key.startsWith(prefix) || !key.endsWith(suffix) || key.length < prefix.length + suffix.length) continue;
    const target = f_condition(map[pattern], mode);
    return typeof target === 'string' ? target.replaceAll('*', key.slice(prefix.length, suffix ? -suffix.length : undefined)) : null;
  }
  return null;
}

function f_packageTarget(manifest, subpath, mode) {
  if (manifest.exports === undefined) return subpath || manifest.main || 'index.js';
  const value = manifest.exports;
  const map = value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).some(key => key.startsWith('.')) ? value : { '.': value };
  return f_mapping(map, subpath ? './' + subpath : '.', mode);
}

// 内部：同一文件共享常量、加载器和模块归属分析；检查器不代替 Node 执行模块加载。
export function i_moduleAccess(context, { testDir, testing }) {
  const source = context.sourceCode || context.getSourceCode();
  const filename = f_realpath(path.resolve(context.filename || context.getFilename()));
  const root = i_projectRootOf(filename);
  const api = i_testApiAnalysis(source, filename);
  const cache = new Map();
  const f_global = (node, name) => node?.type === 'Identifier' && node.name === name && !api.binding(node)?.defs.length;
  const f_stable = variable => !variable.references.some(reference => reference.isWrite() && !reference.init);

  // 私有：补充 require 取得的内置对象身份，局部同名方法不能冒认加载器或 path/URL API。
  function f_symbol(node, seen = new Set()) {
    if (!node) return null;
    if (f_global(node, 'URL')) return { source: 'node:url', name: 'URL' };
    const known = api.symbol(node);
    if (known) return { ...known, source: isBuiltin(known.source) ? 'node:' + known.source.replace(/^node:/, '') : known.source };
    if (node.type === 'Identifier') {
      const variable = api.binding(node), def = variable?.defs[0];
      if (!variable || seen.has(variable) || !f_stable(variable) || def?.type !== 'Variable' || def.parent.kind !== 'const') return null;
      const value = f_symbol(def.node.init, new Set(seen).add(variable));
      if (value && def.node.id.type === 'ObjectPattern') {
        const property = def.node.id.properties.find(item => item.value === def.name);
        return property ? { ...value, name: value.name + '.' + (property.key.name || property.key.value) } : null;
      }
      return value;
    }
    if (node.type === 'MemberExpression') {
      const value = f_symbol(node.object, seen), key = i_testProperty(node);
      return value && key !== null ? { ...value, name: value.name + '.' + key } : null;
    }
    if (node.type === 'CallExpression' && f_global(node.callee, 'require') && node.arguments[0]?.type === 'Literal' && isBuiltin(node.arguments[0].value)) {
      return { source: 'node:' + node.arguments[0].value.replace(/^node:/, ''), name: 'default' };
    }
    return null;
  }

  // 私有：只求稳定常量；循环引用、运行时参数和来源不明的构造均不猜测。
  function f_static(node, seen = new Set()) {
    if (!node) return null;
    if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null;
    if (f_global(node, '__filename')) return filename;
    if (f_global(node, '__dirname')) return path.dirname(filename);
    if (node.type === 'Identifier') {
      const variable = api.binding(node), def = variable?.defs[0];
      if (!variable || seen.has(variable) || !f_stable(variable) || def?.type !== 'Variable' || def.parent.kind !== 'const' || def.node.id.type !== 'Identifier') return null;
      // URL 可被改写；发现绑定直接用于属性赋值后不再使用初值。
      if (variable.references.some(reference => reference.identifier.parent?.type === 'MemberExpression' && reference.identifier.parent.object === reference.identifier
        && reference.identifier.parent.parent?.type === 'AssignmentExpression' && reference.identifier.parent.parent.left === reference.identifier.parent)) return null;
      return f_static(def.node.init, new Set(seen).add(variable));
    }
    if (node.type === 'TemplateLiteral') {
      let value = node.quasis[0].value.cooked;
      for (let index = 0; index < node.expressions.length; index++) {
        const part = f_static(node.expressions[index], seen);
        if (typeof part !== 'string') return null;
        value += part + node.quasis[index + 1].value.cooked;
      }
      return value;
    }
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      const left = f_static(node.left, seen), right = f_static(node.right, seen);
      return typeof left === 'string' && typeof right === 'string' ? left + right : null;
    }
    if (node.type === 'MemberExpression') {
      const key = i_testProperty(node);
      if (node.object.type === 'MetaProperty' && node.object.meta.name === 'import') return { url: pathToFileURL(filename).href, dirname: path.dirname(filename), filename }[key] ?? null;
      const value = f_static(node.object, seen);
      return value instanceof URL && ['href', 'pathname'].includes(key) ? value[key] : null;
    }
    if (!['CallExpression', 'NewExpression'].includes(node.type)) return null;
    const symbol = f_symbol(node.callee);
    if (!symbol) return null;
    const args = node.arguments.map(argument => f_static(argument, seen));
    if (args.some(value => value === null)) return null;
    const name = symbol.name.replace(/^default\./, '');
    try {
      if (symbol.source === 'node:url') {
        if (name === 'URL') return new URL(...args);
        if (name === 'fileURLToPath') return fileURLToPath(...args);
        if (name === 'pathToFileURL') return pathToFileURL(...args);
      }
      if (symbol.source === 'node:path' && ['join', 'resolve', 'dirname'].includes(name)) {
        if (name === 'resolve' && !args.some(value => typeof value === 'string' && path.isAbsolute(value))) return null;
        return path[name](...args);
      }
    } catch { return null; }
    return null;
  }

  function f_loader(node, seen = new Set()) {
    if (!node) return null;
    if (f_global(node, 'require') || node.type === 'MemberExpression' && f_global(node.object, 'module') && i_testProperty(node) === 'require') return { base: filename };
    if (node.type === 'Identifier') {
      const variable = api.binding(node), def = variable?.defs[0];
      if (!variable || seen.has(variable) || def?.type !== 'Variable') return null;
      const loader = f_loader(def.node.init, new Set(seen).add(variable));
      return loader && (f_stable(variable) ? loader : { base: null });
    }
    if (node.type !== 'CallExpression') return null;
    if (node.callee.type === 'MemberExpression' && i_testProperty(node.callee) === 'bind') {
      const loader = f_loader(node.callee.object, seen);
      return loader ? { ...loader, argument: node.arguments[1] ?? loader.argument } : null;
    }
    const symbol = f_symbol(node.callee);
    if (symbol?.source !== 'node:module' || !/(?:^|\.)createRequire$/.test(symbol.name)) return null;
    const value = f_static(node.arguments[0]);
    try {
      if (value instanceof URL || typeof value === 'string' && value.startsWith('file:')) return { base: fileURLToPath(value) };
      return { base: typeof value === 'string' && path.isAbsolute(value) ? value : null };
    } catch { return { base: null }; }
  }

  // 私有：实际依赖可以经 node_modules 软链接安装，包名引用不因此误判为路径引用。
  function f_dependencyRoot(name, from) {
    const owner = i_projectRootOf(from);
    if (owner && f_manifest(owner).name === name) return owner;
    for (let directory = path.dirname(from); ; directory = path.dirname(directory)) {
      const candidate = path.join(directory, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return f_realpath(candidate);
      if (path.dirname(directory) === directory) return null;
    }
  }

  function f_sourceOf(specifier, from = filename, mode = 'import', aliases = new Set()) {
    if (typeof specifier !== 'string' || !from) return { f_error: 'unresolvedModuleTarget', f_specifier: specifier || '', f_external: true };
    const cacheKey = JSON.stringify([specifier, from, mode]);
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (isBuiltin(specifier)) return { f_specifier: 'node:' + specifier.replace(/^node:/, ''), f_external: true };
    if (specifier.startsWith('#')) {
      if (aliases.has(specifier)) return { f_error: 'unresolvedModuleTarget', f_specifier: specifier, f_external: true };
      const owner = i_projectRootOf(from) || root;
      const target = f_mapping(f_manifest(owner).imports || {}, specifier, mode);
      return f_sourceOf(target?.startsWith('./') ? path.resolve(owner, target) : target, from, mode, new Set(aliases).add(specifier));
    }
    const pathImport = specifier.startsWith('.') || path.isAbsolute(specifier) || specifier.startsWith('file:');
    let target;
    if (pathImport) {
      try { target = specifier.startsWith('file:') ? fileURLToPath(specifier) : path.resolve(path.dirname(from), specifier); }
      catch { return { f_error: 'unresolvedModuleTarget', f_specifier: specifier, f_external: true }; }
      if (mode === 'require') {
        const candidates = [target, ...['.js', '.json', '.node'].map(ext => target + ext)];
        target = candidates.find(file => { try { return fs.statSync(file).isFile(); } catch { return false; } }) || target;
      }
    } else {
      const name = i_packageNameOf(specifier), dependencyRoot = f_dependencyRoot(name, from);
      const entry = dependencyRoot && f_packageTarget(f_manifest(dependencyRoot), specifier.slice(name.length).replace(/^\//, ''), mode);
      if (typeof entry === 'string') target = path.resolve(dependencyRoot, entry);
    }
    if (!target) return { f_specifier: specifier, f_external: true, f_member: '' };
    target = f_realpath(target);
    const providerRoot = i_projectRootOf(target);
    const external = !providerRoot || i_repoRelative(providerRoot, root) !== '' || i_repoRelative(target, root) === null || i_repoRelative(target, root)?.split('/').includes('node_modules');
    const testTarget = /\.test\.[cm]?js$/.test(target) || providerRoot && i_repoRelative(target, path.resolve(providerRoot, testDir)) !== null;
    const result = { f_specifier: specifier, f_external: external, f_module: i_repoRelative(target, root), f_test: Boolean(testTarget), f_member: '', f_target: target };
    if (pathImport && external) result.f_error = 'crossPackagePath';
    else if (!testing && testTarget) result.f_error = 'productionDependsOnTests';
    cache.set(cacheKey, result);
    return result;
  }

  function f_argument(node, base = filename, mode = 'import') {
    const value = f_static(node);
    return f_sourceOf(value instanceof URL ? value.href : value, base, mode);
  }

  function f_call(node) {
    let loader, argument;
    if (node.callee.type === 'MemberExpression' && ['call', 'apply'].includes(i_testProperty(node.callee))) {
      loader = f_loader(node.callee.object);
      argument = i_testProperty(node.callee) === 'call' ? node.arguments[1] : node.arguments[1]?.type === 'ArrayExpression' ? node.arguments[1].elements[0] : null;
    } else {
      loader = f_loader(node.callee);
      argument = loader?.argument || node.arguments[0];
    }
    return loader ? { source: f_argument(argument, loader.base, 'require'), node: argument || node } : null;
  }

  return { sourceOf: f_sourceOf, argument: f_argument, call: f_call };
}

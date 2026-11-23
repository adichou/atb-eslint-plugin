// 禁止内部库反向导入业务：静态/动态导入、再导出和已识别的 require 共用实际路径判定。
// 只解析常量、标准 URL/path 构造与已识别的加载器；运行时路径和未知解析基准明确报告。
// 不执行源码，不推断任意工厂返回值；第三方包声明由清单确定，不递归审查依赖包内部。
import path from 'node:path';
import { isBuiltin } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { i_packageNameOf, i_projectRootOf, i_repoRelative } from '../lib/attributions.mjs';
import { i_testApiAnalysis, i_testProperty } from '../lib/test-quality-analysis.mjs';
import { i_testEntryManifest, i_resolveTestModule } from '../lib/test-entry-analysis.mjs';

// 私有：按 Node 的标准条件和声明顺序选择当前加载方式的目标，不合并 import/require 分支。
function f_condition(value, mode) {
  if (!value || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => f_condition(item, mode));
  for (const [key, target] of Object.entries(value)) {
    if (['node', 'node-addons', mode, 'default'].includes(key)) return f_condition(target, mode);
  }
  return null;
}

// 私有：解析清单 imports 的精确键和最长通配键；禁止将任意裸名冒认项目别名。
function f_importAlias(imports, specifier, mode) {
  if (!imports) return null;
  let key = Object.hasOwn(imports, specifier) ? specifier : null;
  if (!key) key = Object.keys(imports).filter(item => {
    const [prefix, suffix] = item.split('*');
    return item.includes('*') && specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length;
  }).sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length)[0];
  if (!key) return null;
  const value = f_condition(imports[key], mode);
  if (typeof value !== 'string') return null;
  const [prefix, suffix] = key.split('*');
  return key.includes('*') ? value.replaceAll('*', specifier.slice(prefix.length, suffix ? -suffix.length : undefined)) : value;
}
export default {
  meta: {
    type: 'problem',
    docs: { description: '禁止内部库反向导入库外业务；允许库内模块、Node 内置与运行依赖，未知目标明确报告' },
    schema: [{ type: 'object', properties: { libDir: { type: 'string', minLength: 1 } }, additionalProperties: false }],
    messages: {
      outsideLib: "内部库不能加载库外本地模块 '{{target}}'；请下沉共同实现或经参数注入",
      unresolvedTarget: '无法静态确定内部库的加载目标或解析基准；请使用明确的模块来源',
      undeclaredDependency: "内部库加载的包 '{{name}}' 未声明为运行依赖、可选依赖或 peer 依赖",
    },
  },
  create(context) {
    const filename = path.resolve(context.filename);
    const root = i_projectRootOf(filename);
    if (!root) return {};
    const libDirInput = context.options[0]?.libDir ?? 'scripts/lib';
    const libDir = path.resolve(root, libDirInput);
    if (path.isAbsolute(libDirInput) || i_repoRelative(libDir, root) === null) throw new Error('libDir 必须是项目根内的相对目录');
    if (i_repoRelative(filename, libDir) === null) return {};
    const info = i_testEntryManifest(root);
    const manifest = info.manifest;
    const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies };
    const source = context.sourceCode;
    const api = i_testApiAnalysis(source, filename);
    const virtualFiles = new Set([filename]);
    const f_report = (node, messageId, data) => context.report({ node, messageId, ...(data ? { data } : {}) });
    const f_unbound = (node, name) => node?.type === 'Identifier' && node.name === name && !api.binding(node)?.defs.length;
    // 私有：可解析常量必须未被重新赋值；URL 对象的属性写入和方法调用同样使初值失效。
    const f_stable = (variable, objectCalls = false) => !variable.references.some(reference => {
      if (reference.isWrite() && !reference.init) return true;
      let current = reference.identifier;
      while (current.parent?.type === 'MemberExpression' && current.parent.object === current) current = current.parent;
      const parent = current.parent;
      return parent?.type === 'AssignmentExpression' && parent.left === current && current !== reference.identifier
        || parent?.type === 'UpdateExpression' || parent?.type === 'UnaryExpression' && parent.operator === 'delete'
        || objectCalls && current !== reference.identifier && parent?.type === 'CallExpression' && parent.callee === current;
    });
    // 私有：只认真实导入来源及稳定别名，不把影子 path、URL、createRequire 当作原生 API。
    const f_symbol = (node, seen = new Set()) => {
      if (!node) return null;
      if (node.type === 'AwaitExpression' || node.type === 'ChainExpression') return f_symbol(node.argument || node.expression, seen);
      if (node.type === 'Identifier') {
        const variable = api.binding(node);
        if (!variable || !variable.defs.length) return node.name === 'URL' ? { source: 'node:url', name: 'URL' } : null;
        if (seen.has(variable) || !f_stable(variable)) return null;
        const def = variable.defs[0];
        if (def.type === 'ImportBinding') return api.symbol(node);
        if (def.type !== 'Variable' || def.parent.kind !== 'const') return null;
        const value = f_symbol(def.node.init, new Set(seen).add(variable));
        if (value && def.node.id.type === 'ObjectPattern') {
          const property = def.node.id.properties.find(item => item.value === def.name);
          return property ? { ...value, name: `${value.name}.${property.key.name || property.key.value}` } : null;
        }
        return value;
      }
      if (node.type === 'MemberExpression') {
        const base = f_symbol(node.object, seen), key = i_testProperty(node);
        return base && key !== null ? { ...base, name: `${base.name}.${key}` } : null;
      }
      if (node.type === 'ImportExpression') {
        const specifier = f_static(node.source, seen);
        return specifier === 'node:module' || specifier === 'module' ? { source: 'node:module', name: 'default' } : null;
      }
      if (node.type === 'CallExpression' && f_loader(node.callee, seen)) {
        const specifier = f_static(node.arguments[0], seen);
        return specifier === 'node:module' || specifier === 'module' ? { source: 'node:module', name: 'default' } : null;
      }
      return null;
    };
    // 私有：URL 是可变对象；别名修改或传给未知函数后，不能继续将初始 URL 当作目标。
    const f_urlStable = (variable, seen = new Set()) => {
      if (!variable || seen.has(variable) || !f_stable(variable, true)) return false;
      const next = new Set(seen).add(variable);
      return variable.references.every(reference => {
        if (!reference.isRead()) return true;
        const node = reference.identifier, parent = node.parent;
        if (parent?.type === 'MemberExpression' && parent.object === node && ['href', 'pathname'].includes(i_testProperty(parent))) return true;
        if (parent?.type === 'ImportExpression' && parent.source === node) return true;
        if (parent?.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'Identifier' && parent.parent.kind === 'const') return f_urlStable(api.binding(parent.id), next);
        const symbol = ['CallExpression', 'NewExpression'].includes(parent?.type) ? f_symbol(parent.callee) : null;
        return symbol?.source === 'node:url' && /(?:^|\.)(?:URL|fileURLToPath)$/.test(symbol.name);
      });
    };
    // 私有：只求静态字符串及标准路径/URL 值；循环绑定、变更后的值和任意函数不求值。
    const f_static = (node, seen = new Set()) => {
      if (!node) return null;
      if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null;
      if (node.type === 'Identifier') {
        if (f_unbound(node, '__filename')) return filename;
        if (f_unbound(node, '__dirname')) return path.dirname(filename);
        const variable = api.binding(node), def = variable?.defs[0];
        if (!def || seen.has(variable) || def.type !== 'Variable' || def.parent.kind !== 'const' || def.node.id.type !== 'Identifier' || !f_stable(variable, true)) return null;
        const value = f_static(def.node.init, new Set(seen).add(variable));
        return value instanceof URL && !f_urlStable(variable) ? null : value;
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
      try {
        if (node.type === 'NewExpression') {
          const symbol = f_symbol(node.callee, seen);
          if (symbol?.source !== 'node:url' || !/^(?:default\.)?URL$/.test(symbol.name)) return null;
          const args = node.arguments.map(argument => f_static(argument, seen));
          return args.some(value => value === null) ? null : new URL(...args);
        }
        if (node.type === 'CallExpression') {
          const symbol = f_symbol(node.callee, seen);
          if (!symbol) return null;
          const args = node.arguments.map(argument => f_static(argument, seen));
          if (args.some(value => value === null)) return null;
          if (symbol.source === 'node:url') {
            if (/(?:^|\.)fileURLToPath$/.test(symbol.name)) return fileURLToPath(...args);
            if (/(?:^|\.)pathToFileURL$/.test(symbol.name)) return pathToFileURL(...args);
          }
          if (symbol.source === 'node:path') {
            const name = symbol.name.replace(/^(?:default|\*)\./, '');
            const [group, method] = name.split('.');
            // 全相对 resolve 依赖运行时 cwd，不能借检查器自身的工作目录猜测目标。
            if (group === 'resolve' && !args.some(value => typeof value === 'string' && path.isAbsolute(value))) return null;
            if (['posix', 'win32'].includes(group) && method === 'resolve' && !args.some(value => typeof value === 'string' && path[group].isAbsolute(value))) return null;
            if (['join', 'resolve', 'dirname'].includes(group) && !method) return path[group](...args);
            if (['posix', 'win32'].includes(group) && ['join', 'resolve', 'dirname'].includes(method)) return path[group][method](...args);
          }
        }
      } catch { return null; }
      return null;
    };
    // 私有：跟随 require、module.require、标准 createRequire 及稳定别名，保留真实解析基准。
    const f_loader = (node, seen = new Set()) => {
      if (!node) return null;
      if (f_unbound(node, 'require')) return { base: filename };
      if (node.type === 'Identifier') {
        const variable = api.binding(node), def = variable?.defs[0];
        if (!def || seen.has(variable) || def.type !== 'Variable' || def.node.id.type !== 'Identifier') return null;
        const loader = f_loader(def.node.init, new Set(seen).add(variable));
        return loader && (f_stable(variable) ? loader : { base: null });
      }
      if (node.type === 'MemberExpression' && i_testProperty(node) === 'require' && f_unbound(node.object, 'module')) return { base: filename };
      if (node.type === 'CallExpression') {
        const symbol = f_symbol(node.callee, seen);
        if (symbol?.source !== 'node:module' || !/(?:^|\.)createRequire$/.test(symbol.name)) return null;
        const base = f_static(node.arguments[0], seen);
        try {
          if (base instanceof URL || typeof base === 'string' && base.startsWith('file:')) return { base: fileURLToPath(base) };
          if (typeof base === 'string' && path.isAbsolute(base)) return { base };
        } catch { return { base: null }; }
        return { base: null };
      }
      return null;
    };
    const f_check = (node, value, from = filename, mode = 'import', aliases = new Set()) => {
      const specifier = value instanceof URL ? value.href : value;
      if (typeof specifier !== 'string' || !from || aliases.has(specifier)) { f_report(node, 'unresolvedTarget'); return; }
      if (isBuiltin(specifier)) return;
      if (specifier.startsWith('#')) {
        const target = f_importAlias(manifest.imports, specifier, mode);
        f_check(node, target?.startsWith('./') ? path.resolve(root, target) : target, from, mode, new Set(aliases).add(specifier));
        return;
      }
      const self = manifest.name && (specifier === manifest.name || specifier.startsWith(`${manifest.name}/`));
      const local = self || specifier.startsWith('.') || path.isAbsolute(specifier) || specifier.startsWith('file:');
      if (!local) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(specifier) || specifier.startsWith('node:')) f_report(node, 'unresolvedTarget');
        else if (!Object.hasOwn(dependencies, i_packageNameOf(specifier))) f_report(node, 'undeclaredDependency', { name: i_packageNameOf(specifier) });
        return;
      }
      const selected = { ...info, exports: Object.fromEntries(Object.entries(info.exports).map(([key, target]) => [key, f_condition(target, mode)])) };
      const target = i_resolveTestModule(root, selected, from, specifier, virtualFiles);
      if (!target) { f_report(node, 'unresolvedTarget'); return; }
      if (i_repoRelative(target, libDir) === null) f_report(node, 'outsideLib', { target: i_repoRelative(target, root) ?? target });
    };
    return {
      ImportDeclaration(node) { f_check(node, node.source.value); },
      ExportNamedDeclaration(node) { if (node.source) f_check(node, node.source.value); },
      ExportAllDeclaration(node) { f_check(node, node.source.value); },
      ImportExpression(node) { f_check(node, f_static(node.source)); },
      CallExpression(node) {
        const loader = f_loader(node.callee);
        if (loader) f_check(node, f_static(node.arguments[0]), loader.base, 'require');
      },
    };
  },
};

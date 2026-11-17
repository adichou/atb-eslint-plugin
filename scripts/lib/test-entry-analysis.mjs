// 测试入口的静态调用分析：只读取 AST、清单和本地 helper，不执行被分析代码。
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { i_projectRootOf } from './attributions.mjs';

const f_FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const f_PROCESS_SOURCES = new Set(['node:child_process', 'child_process', 'litenvi-node/lite-child_process.mjs']);
const f_DRIVERS = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);

// 私有：仅枚举语法子节点，排除 ESLint 的父节点回链。
function f_children(node) {
  return Object.entries(node).flatMap(([key, value]) => key === 'parent' ? [] : Array.isArray(value) ? value.filter(item => item?.type) : value?.type ? [value] : []);
}

// 私有：路径包含关系以完整目录段为边界。
function f_inside(root, file) {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

// 私有：条件目标只收集字符串，不把清单键当文件路径。
function f_targets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(f_targets);
}

// 内部：取得严格来自 package.json 的入口，不混入其他规则的配置文件豁免。
export function i_testEntryManifest(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const binEntries = typeof manifest.bin === 'string' ? [[manifest.name?.split('/').at(-1), manifest.bin]] : Object.entries(manifest.bin || {});
  const commands = new Map(binEntries.filter(([name, value]) => name && typeof value === 'string').map(([name, value]) => [name, path.resolve(root, value)]));
  const exports = typeof manifest.exports === 'string' || Array.isArray(manifest.exports)
    ? { '.': manifest.exports }
    : manifest.exports && Object.keys(manifest.exports).some(key => key.startsWith('.')) ? manifest.exports : { '.': manifest.exports };
  return { manifest, exports, commands, bins: new Set(commands.values()), imports: [...f_targets(manifest.exports), ...(manifest.main ? [manifest.main] : [])] };
}

// 私有：按最长子路径模式匹配本包自引用，精确 null 导出优先拒绝。
function f_selfTarget(info, specifier) {
  const name = info.manifest.name;
  if (!name || (specifier !== name && !specifier.startsWith(`${name}/`))) return undefined;
  const subpath = specifier === name ? '.' : `.${specifier.slice(name.length)}`;
  if (Object.hasOwn(info.exports, subpath)) return f_targets(info.exports[subpath]);
  const patterns = Object.keys(info.exports).filter(key => key.includes('*')).sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length);
  for (const pattern of patterns) {
    const [prefix, suffix] = pattern.split('*');
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const capture = subpath.slice(prefix.length, suffix ? -suffix.length : undefined);
    return f_targets(info.exports[pattern]).map(target => target.replaceAll('*', capture));
  }
  return subpath === '.' && !info.manifest.exports && info.manifest.main ? [info.manifest.main] : [];
}

// 内部：解析本地模块或本包自引用；外部依赖与不存在的模块均不当成业务入口。
export function i_resolveTestModule(root, info, from, specifier, virtualFiles = new Set()) {
  let bases;
  if (specifier.startsWith('.')) bases = [path.resolve(path.dirname(from), specifier)];
  else if (specifier.startsWith('file:')) {
    try { bases = [fileURLToPath(specifier)]; } catch { return null; }
  } else if (path.isAbsolute(specifier)) bases = [specifier];
  else {
    const targets = f_selfTarget(info, specifier);
    if (targets === undefined) return null;
    bases = targets.map(target => path.resolve(root, target));
  }
  for (const base of bases) {
    const candidates = /\.[cm]?js$/.test(base) ? [base] : [base, ...['js', 'mjs', 'cjs'].flatMap(ext => [`${base}.${ext}`, path.join(base, `index.${ext}`)])];
    for (const target of candidates) {
      if (virtualFiles.has(target)) return target;
      try { if (fs.statSync(target).isFile()) return target; } catch { continue; }
    }
  }
  return null;
}

// 内部：判断目标是否属于清单公开面，通配符按 Node 的跨目录替换语义匹配。
export function i_isTestImportEntry(root, info, target) {
  if (!f_inside(root, target)) return false;
  const relative = path.relative(root, target).split(path.sep).join('/');
  return info.imports.some(pattern => {
    const normalized = pattern.replace(/^\.\//, '');
    const expression = normalized.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(relative);
  });
}

// 内部：解析简单命令词；带 shell 控制符的复合命令不猜测执行结果。
export function i_testCommandWords(command) {
  if (typeof command !== 'string' || /[;&|<>\n]/.test(command)) return null;
  const words = command.match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/g) || [];
  return words.map(word => /^['"]/.test(word) ? word.slice(1, -1) : word);
}

// 内部：为规则提供实际调用链中的进程、导入与页面导航证据。
export function i_analyzeTestEntries({ context, filename, root, testDir, info }) {
  const modules = new Map(), imports = [], drives = [], navigations = [], failures = [];
  const activeFunctions = new Set(), activeModules = new Set();
  const valueCaches = new WeakMap(), callContexts = new WeakMap(), analyzedCalls = new Set();
  const processSources = new Map();
  const copiedFiles = new Map(), temporaryPaths = new WeakMap();
  const jsonArrays = new WeakSet();
  let temporarySequence = 0;
  let budget = 200000;
  const parser = context.languageOptions.parser;

  // 私有：注册解构绑定，并保留属性路径供调用参数传递使用。
  function f_declare(scope, pattern, binding, keys = []) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') scope.bindings.set(pattern.name, { ...binding, keys });
    else if (pattern.type === 'AssignmentPattern') f_declare(scope, pattern.left, { ...binding, fallback: pattern.right }, keys);
    else if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) {
        if (property.type === 'Property') f_declare(scope, property.value, binding, [...keys, property.key.name ?? property.key.value]);
      }
    } else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((element, index) => f_declare(scope, element, binding, [...keys, index]));
  }

  // 私有：每个文件单独建词法作用域，不根据变量名字猜导入来源。
  function f_module(file, ast) {
    if (modules.has(file)) return modules.get(file);
    const module = { file, ast, scopes: new WeakMap(), exports: new Map(), assignments: [] };
    modules.set(file, module);
    const scope = { parent: null, bindings: new Map(), module };
    // 私有：索引声明，不执行函数体。
    function f_index(node, current, parent) {
      if (node.type === 'FunctionDeclaration' && node.id) f_declare(current, node.id, { kind: 'function', node, scope: current });
      if (f_FUNCTIONS.has(node.type) || node.type === 'BlockStatement') current = { parent: current, bindings: new Map(), module };
      module.scopes.set(node, current);
      if (f_FUNCTIONS.has(node.type)) {
        node.params.forEach((param, index) => f_declare(current, param, { kind: 'parameter', index, scope: current }));
      }
      if (node.type === 'VariableDeclarator') f_declare(current, node.id, { kind: 'definition', node: node.init, mutable: parent?.kind !== 'const', scope: current });
      if (node.type === 'ImportDeclaration') {
        for (const spec of node.specifiers) f_declare(current, spec.local, { kind: 'import', source: node.source.value, imported: spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported.name, scope: current });
      }
      if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') module.assignments.push(node);
      if (node.type === 'ExportDefaultDeclaration') module.exports.set('default', node.declaration);
      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration?.id) module.exports.set(node.declaration.id.name, node.declaration);
        for (const declaration of node.declaration?.declarations || []) if (declaration.id.type === 'Identifier') module.exports.set(declaration.id.name, declaration.id);
        for (const spec of node.specifiers) module.exports.set(spec.exported.name, node.source ? { type: 'EntryReexport', source: node.source.value, imported: spec.local.name } : spec.local);
      }
      for (const child of f_children(node)) f_index(child, current, node);
    }
    f_index(ast, scope);
    return module;
  }

  // 私有：helper 源码由当前 ESLint parser 解析，解析失败转为可定位诊断。
  function f_load(file, origin) {
    if (modules.has(file)) return modules.get(file);
    try {
      const text = fs.readFileSync(file, 'utf8');
      const options = { ecmaVersion: 'latest', sourceType: file.endsWith('.cjs') ? 'commonjs' : 'module', range: true, loc: true };
      const parsed = parser.parseForESLint ? parser.parseForESLint(text, options).ast : parser.parse(text, options);
      return f_module(file, parsed);
    } catch (error) {
      failures.push({ node: origin, file, message: error.message });
      return null;
    }
  }

  // 私有：沿词法父作用域查找绑定，函数参数由调用环境补值。
  function f_binding(node, ctx) {
    let scope = ctx.module.scopes.get(node);
    while (scope) {
      if (scope.bindings.has(node.name)) return scope.bindings.get(node.name);
      scope = scope.parent;
    }
    return null;
  }

  // 私有：读取抽象对象成员，不访问被分析模块的真实运行时对象。
  function f_member(value, key, ctx) {
    if (value?.kind === 'object') return value.members.get(key) ?? value.spreads.map(item => f_member(item, key, ctx)).find(item => item !== undefined);
    if (Array.isArray(value)) return key === 'filter' ? { kind: 'filter', items: value } : value[key];
    if (typeof value === 'string' && ['replace', 'match'].includes(key)) return { kind: key, value };
    if (value?.kind === 'external') {
      if (/lite-browser\.mjs$|^playwright$|^@playwright\/test$/.test(value.source) && key === 'page' && value.called) return { kind: 'page' };
      if (/^(node:)?process$|lite-process\.mjs$/.test(value.source) && key === 'execPath') return 'node';
      return { ...value, chain: [...value.chain, key], called: false };
    }
    if (value?.kind === 'page') return { kind: 'external', source: '@page', chain: [key] };
    if (value?.kind === 'url' && ['href', 'pathname'].includes(key)) {
      if (key === 'href') return value.value;
      try { return new URL(value.value).pathname; } catch { return undefined; }
    }
    return undefined;
  }

  // 私有：按所属包清单与真实文件确认门面身份，避免相对路径漏检或同名文件误认。
  function f_processSource(source, target) {
    if (!target) return source;
    if (!processSources.has(target)) {
      const realTarget = fs.realpathSync(target);
      const packageRoot = i_projectRootOf(realTarget);
      const packageInfo = packageRoot === root ? info : packageRoot ? i_testEntryManifest(packageRoot) : null;
      const canonical = 'litenvi-node/lite-child_process.mjs';
      const entry = packageInfo?.manifest.name === 'litenvi-node' ? i_resolveTestModule(packageRoot, packageInfo, realTarget, canonical) : null;
      processSources.set(target, entry && fs.realpathSync(entry) === realTarget ? canonical : null);
    }
    return processSources.get(target) || source;
  }

  // 私有：本地 helper 的导出按真实模块查找；生产模块只形成入口证据，不解析其内部实现。
  function f_importValue(binding, ctx) {
    const target = i_resolveTestModule(root, info, binding.scope.module.file, binding.source);
    if (target && f_inside(testDir, target)) {
      const module = f_load(target, ctx.origin);
      if (!module) return undefined;
      if (binding.imported === '*') return { kind: 'object', members: new Map([...module.exports].map(([name, node]) => [name, f_value(node, { ...ctx, module })])), spreads: [] };
      const node = module.exports.get(binding.imported);
      return node ? f_value(node, { ...ctx, module }) : undefined;
    }
    return { kind: 'external', source: f_processSource(binding.source, target), selfPublicApi: !!target && i_isTestImportEntry(root, info, target), chain: binding.imported === 'default' || binding.imported === '*' ? [] : [binding.imported] };
  }

  // 私有：为一次 helper 调用绑定参数，返回闭包环境。
  function f_callContext(fn, args, origin) {
    const calls = callContexts.get(fn.node) || [];
    const cached = calls.find(call => call.closure === fn.env && call.args.length === args.length && call.args.every((arg, index) => Object.is(arg, args[index])));
    if (cached) return { ...cached.context, origin };
    const env = new Map(fn.env);
    const scope = fn.module.scopes.get(fn.node);
    for (const binding of scope.bindings.values()) {
      if (binding.kind !== 'parameter') continue;
      let value = args[binding.index];
      for (const key of binding.keys) value = f_member(value, key, { module: fn.module });
      if (value === undefined && binding.fallback) value = f_value(binding.fallback, { module: fn.module, env, origin });
      env.set(binding, value);
    }
    const context = { module: fn.module, env, origin };
    calls.push({ closure: fn.env, args, context });
    callContexts.set(fn.node, calls);
    return context;
  }

  // 私有：只推导返回值，嵌套函数体不当成当前函数的执行语句。
  function f_return(fn, args, ctx, seen) {
    if (seen.has(fn.node)) return undefined;
    const next = new Set(seen).add(fn.node), call = f_callContext(fn, args, ctx.origin);
    if (fn.node.body.type !== 'BlockStatement') return f_value(fn.node.body, call, next);
    let value;
    // 私有：读取当前函数的返回表达式。
    function f_find(node) {
      if (f_FUNCTIONS.has(node.type)) return;
      if (node.type === 'ReturnStatement') { value ??= f_value(node.argument, call, next); return; }
      for (const child of f_children(node)) f_find(child);
    }
    f_find(fn.node.body);
    return value;
  }

  // 私有：有限静态求值，未知模板段只保留占位，供动态端口的结构核验使用。
  function f_value(node, ctx, seen = new Set()) {
    if (!node || seen.has(node)) return undefined;
    const cache = valueCaches.get(ctx.env) || new WeakMap();
    valueCaches.set(ctx.env, cache);
    if (cache.has(node)) return cache.get(node);
    const value = f_computeValue(node, ctx, seen);
    cache.set(node, value);
    return value;
  }

  // 私有：求值结果按本轮调用环境缓存，不跨 lint 或文件系统世界复用。
  function f_computeValue(node, ctx, seen) {
    if (!node || budget-- <= 0 || seen.has(node)) return undefined;
    seen = new Set(seen).add(node);
    const recur = child => f_value(child, ctx, seen);
    if (node.type === 'Literal') return node.value;
    if (node.type === 'AwaitExpression' || node.type === 'ChainExpression') return recur(node.argument || node.expression);
    if (f_FUNCTIONS.has(node.type)) return { kind: 'function', node, module: ctx.module, env: ctx.env };
    if (node.type === 'EntryReexport') return f_importValue({ source: node.source, imported: node.imported, scope: { module: ctx.module } }, ctx);
    if (node.type === 'Identifier') {
      const binding = f_binding(node, ctx);
      if (!binding) return node.name === 'process' ? { kind: 'external', source: 'node:process', chain: [] } : undefined;
      if (ctx.env.has(binding)) return ctx.env.get(binding);
      if (binding.kind === 'import') return f_importValue(binding, ctx);
      if (binding.kind === 'function') return { kind: 'function', node: binding.node, module: binding.scope.module, env: ctx.env };
      const assignments = ctx.module.assignments.filter(item => item.left.name === node.name && f_binding(item.left, ctx) === binding);
      const initializer = binding.mutable && assignments.length ? assignments.at(-1).right : binding.node;
      let value = f_value(initializer, ctx, seen);
      for (const key of binding.keys) value = f_member(value, key, ctx);
      if (value == null) {
        for (const assignment of assignments) value ??= f_value(assignment.right, ctx, seen);
      }
      return value === undefined && binding.fallback ? recur(binding.fallback) : value;
    }
    if (node.type === 'TemplateLiteral') return node.quasis.reduce((text, part, index) => {
      const value = index < node.expressions.length ? recur(node.expressions[index]) : '';
      return text + part.value.cooked + (['string', 'number', 'boolean'].includes(typeof value) ? String(value) : '__dynamic__');
    }, '');
    if (node.type === 'BinaryExpression' && node.operator === '+') {
      const left = recur(node.left), right = recur(node.right);
      return left !== undefined && right !== undefined ? left + right : undefined;
    }
    if (node.type === 'ArrayExpression') return node.elements.flatMap(item => item?.type === 'SpreadElement' ? recur(item.argument) || [undefined] : [recur(item)]);
    if (node.type === 'ObjectExpression') return { kind: 'object', members: new Map(node.properties.filter(item => item.type === 'Property').map(item => [item.key.name ?? item.key.value, recur(item.value)])), spreads: node.properties.filter(item => item.type === 'SpreadElement').map(item => recur(item.argument)) };
    if (node.type === 'MemberExpression') {
      if (node.object.type === 'MetaProperty' && node.property.name === 'url') return pathToFileURL(ctx.module.file).href;
      if (node.object.type === 'MetaProperty' && node.property.name === 'dirname') return path.dirname(ctx.module.file);
      return f_member(recur(node.object), node.computed ? recur(node.property) : node.property.name, ctx);
    }
    if (node.type === 'NewExpression' && node.callee.name === 'URL') {
      const args = node.arguments.map(recur);
      try { return { kind: 'url', value: new URL(...args).href }; } catch { return args[0] ? { kind: 'url', value: args[0] } : undefined; }
    }
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      const callee = recur(node.callee), args = node.arguments.map(recur);
      // 只求值已知内置装配操作，不执行被分析函数或动态源码。
      if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && !f_binding(node.callee.object, ctx)) {
        if (node.callee.object.name === 'Object' && node.callee.property.name === 'freeze') return args[0];
        if (node.callee.object.name === 'JSON' && node.callee.property.name === 'parse' && typeof args[0] === 'string') {
          try {
            // 私有：把 JSON 数据转换为抽象对象，供宿主遍历 handler；不解释字符串脚本。
            const f_convert = value => {
              if (Array.isArray(value)) { const items = value.map(f_convert); jsonArrays.add(items); return items; }
              return value && typeof value === 'object' ? { kind: 'object', members: new Map(Object.entries(value).map(([key, item]) => [key, f_convert(item)])), spreads: [] } : value;
            };
            return f_convert(JSON.parse(args[0]));
          } catch { return undefined; }
        }
      }
      if (callee?.kind === 'replace' && typeof args[0] === 'string' && typeof args[1] === 'string') return callee.value.replace(args[0], () => args[1]);
      if (callee?.kind === 'match' && args[0] instanceof RegExp) return callee.value.match(args[0]);
      if (callee?.kind === 'filter') {
        const items = callee.items.filter((item, index) => args[0]?.kind !== 'function' || f_return(args[0], [item, index, callee.items], ctx, seen) !== false);
        if (jsonArrays.has(callee.items)) jsonArrays.add(items);
        return items;
      }
      if (callee?.kind === 'function') return f_return(callee, args, ctx, seen);
      if (callee?.kind !== 'external') return undefined;
      const method = callee.chain.at(-1);
      if (callee.source === 'node:process' && method === 'getBuiltinModule' && ['node:fs', 'fs'].includes(args[0])) return { kind: 'external', source: 'node:fs', chain: [] };
      if (['node:fs', 'fs', 'litenvi-node/lite-fs.mjs'].includes(callee.source)) {
        const file = args[0]?.kind === 'url' ? args[0].value.startsWith('file:') ? fileURLToPath(args[0].value) : undefined : args[0];
        if (method === 'readFileSync' && typeof file === 'string' && info.hookConfigs?.has(path.resolve(root, file))) return fs.readFileSync(path.resolve(root, file), 'utf8');
        if (method === 'mkdtempSync') {
          if (!temporaryPaths.has(node)) temporaryPaths.set(node, `/__atb_static_fixture__/${++temporarySequence}`);
          return temporaryPaths.get(node);
        }
      }
      if (/^(node:)?path$/.test(callee.source) && ['join', 'resolve', 'dirname'].includes(method) && args.every(arg => typeof arg === 'string')) return method === 'resolve' ? path.resolve(root, ...args) : path[method](...args);
      if (/^(node:)?url$/.test(callee.source) && method === 'fileURLToPath') {
        try { return fileURLToPath(args[0]?.kind === 'url' ? args[0].value : args[0]); } catch { return undefined; }
      }
      if (/lite-browser\.mjs$|^playwright$|^@playwright\/test$/.test(callee.source) && ['page', 'newPage'].includes(method)) return { kind: 'page' };
      return { ...callee, called: true };
    }
    return undefined;
  }

  // 私有：只分析实际被调用的函数，循环调用按当前调用栈截断。
  function f_invoke(fn, args, ctx) {
    if (activeFunctions.has(fn.node)) return;
    const call = f_callContext(fn, args, ctx.origin);
    if (analyzedCalls.has(call.env)) return;
    analyzedCalls.add(call.env);
    activeFunctions.add(fn.node);
    f_activate(fn.module, ctx.origin);
    f_visit(fn.node.body, call);
    activeFunctions.delete(fn.node);
  }

  // 私有：归一 node 启动与选项，不把 --test 等参数当脚本目标。
  function f_drive(node, callee, ctx) {
    const method = callee.chain.at(-1);
    if (!f_PROCESS_SOURCES.has(callee.source) || !f_DRIVERS.has(method)) return;
    const record = drive => drives.push({ ...drive, node: ctx.origin || node, file: ctx.module.file, source: callee.source, selfPublicApi: callee.selfPublicApi === true });
    let command = f_value(node.arguments[0], ctx), args;
    if (method === 'exec' || method === 'execSync') {
      const words = i_testCommandWords(command);
      if (!words) return;
      [command, ...args] = words;
    } else if (method === 'fork') {
      const values = f_value(node.arguments[1], ctx);
      args = [command, ...(Array.isArray(values) ? values : [])]; command = 'node';
    }
    else args = f_value(node.arguments[1], ctx);
    const second = f_value(node.arguments[1], ctx);
    const options = method === 'exec' || method === 'execSync' || second?.kind === 'object' ? second : f_value(node.arguments[2], ctx);
    const cwd = f_member(options, 'cwd', ctx) || root;
    if (typeof command !== 'string') return;
    if (!['node', 'node.exe'].includes(path.basename(command))) {
      if (['bash', 'sh', 'zsh', 'python', 'python3'].includes(path.basename(command)) && Array.isArray(args)) {
        const at = args.findIndex(arg => typeof arg === 'string' && !arg.startsWith('-'));
        const head = args[at];
        const target = typeof head === 'string' && typeof cwd === 'string' ? path.resolve(cwd, head) : null;
        if (info.scriptEntries?.has(target)) { record({ head, target, args: args.slice(at) }); return; }
      }
      const target = info.commands.get(command) || (typeof cwd === 'string' ? path.resolve(cwd, command) : null);
      record({ mode: (info.scriptEntries || info.bins).has(target) ? 'script' : 'command', head: command, target, args: [target, ...(Array.isArray(args) ? args : [])] });
      return;
    }
    let at = 0;
    if (Array.isArray(args)) {
      while (typeof args[at] === 'string' && args[at].startsWith('-')) {
        const option = args[at++];
        if (['-e', '--eval', '-p', '--print'].includes(option)) {
          record({ mode: 'inline', target: null });
          return;
        }
        if (['--import', '--require', '-r', '--loader', '--conditions'].includes(option)) at++;
        if (option === '--') break;
      }
    }
    const head = args?.[at];
    let target = typeof head === 'string' && !head.includes('__dynamic__') ? path.isAbsolute(head) ? path.normalize(head) : typeof cwd === 'string' ? path.resolve(cwd, head) : null : null;
    // 临时副本只有明确的 copyFileSync 来源才可归回声明入口，不按文件名猜测。
    const seen = new Set();
    while (copiedFiles.has(target) && !seen.has(target)) { seen.add(target); target = copiedFiles.get(target); }
    record({ head, args: args?.slice(at), target });
  }

  // 私有：收集调用本身及框架实际执行的回调，字符串测试输入不会作为源码递归执行。
  function f_copiesScript(node) {
    if (f_FUNCTIONS.has(node.type)) return false;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'copyFileSync') return true;
    return f_children(node).some(f_copiesScript);
  }

  // 私有：收集实际调用与 hook 装配，不展开无关业务数据矩阵的排列组合。
  function f_visit(node, ctx) {
    if (!node || budget-- <= 0 || f_FUNCTIONS.has(node.type)) return;
    if (node.type === 'ForOfStatement' && node.left.type === 'VariableDeclaration' && node.left.declarations[0]?.id.type === 'Identifier') {
      const items = f_value(node.right, ctx);
      // 只展开 hook JSON 和明确复制脚本的路径列表，普通业务循环沿一般调用图处理。
      if (Array.isArray(items) && (jsonArrays.has(items) || items.every(item => typeof item === 'string') && f_copiesScript(node.body))) {
        const binding = f_binding(node.left.declarations[0].id, ctx);
        for (const item of items) {
          if (budget <= 0) break;
          const env = new Map(ctx.env); env.set(binding, item);
          f_visit(node.body, { ...ctx, env });
        }
        return;
      }
    }
    // 字面量已确定不会执行的分支不提供入口证据；未知条件保留两条可能路径。
    if (node.type === 'IfStatement' && node.test.type === 'Literal') {
      f_visit(node.test.value ? node.consequent : node.alternate, ctx);
      return;
    }
    if (node.type === 'LogicalExpression' && node.left.type === 'Literal') {
      const executesRight = node.operator === '&&' ? !!node.left.value : node.operator === '||' ? !node.left.value : node.left.value == null;
      if (executesRight) f_visit(node.right, ctx);
      return;
    }
    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      const callee = f_value(node.callee, ctx), args = node.arguments.map(arg => f_value(arg, ctx));
      if (callee?.kind === 'function') f_invoke(callee, args, { ...ctx, origin: ctx.origin || node });
      if (callee?.kind === 'external') {
        if (['node:fs', 'fs', 'litenvi-node/lite-fs.mjs'].includes(callee.source) && callee.chain.at(-1) === 'copyFileSync' && args.slice(0, 2).every(arg => typeof arg === 'string')) copiedFiles.set(path.resolve(root, args[1]), path.resolve(root, args[0]));
        f_drive(node, callee, ctx);
        if (callee.source === '@page' && callee.chain.at(-1) === 'goto') navigations.push({ node: ctx.origin || node, url: args[0] });
        if (['node:test', 'node:assert', 'node:assert/strict', '@playwright/test'].includes(callee.source) || ['then', 'catch', 'finally'].includes(callee.chain.at(-1))) {
          if (callee.chain.some(name => name === 'skip' || name === 'todo') || args.some(arg => f_member(arg, 'skip', ctx) === true || f_member(arg, 'todo', ctx) === true)) return;
          const callbackArgs = callee.source === '@playwright/test' ? [{ kind: 'object', members: new Map([['page', { kind: 'page' }]]), spreads: [] }] : [];
          for (const arg of args) if (arg?.kind === 'function') f_invoke(arg, callbackArgs, { ...ctx, origin: ctx.origin || node });
        }
      }
    }
    if (node.type === 'ImportExpression') {
      const specifier = f_value(node.source, ctx);
      if (typeof specifier === 'string') imports.push({ node: ctx.origin || node, file: ctx.module.file, specifier });
    }
    for (const child of f_children(node)) f_visit(child, ctx);
  }

  // 私有：仅实际调用链上的 helper 才激活其顶层装配与导入。
  function f_activate(module, origin) {
    if (activeModules.has(module.file)) return;
    activeModules.add(module.file);
    for (const node of module.ast.body) if (node.type === 'ImportDeclaration') imports.push({ node: origin || node, file: module.file, specifier: node.source.value });
    f_visit(module.ast, { module, env: new Map(), origin });
  }

  const module = f_module(filename, context.sourceCode.ast);
  f_activate(module, null);
  if (budget <= 0) failures.push({ node: context.sourceCode.ast, file: filename, message: '静态调用分析超过预算，请收敛 helper 调用链' });
  return { imports, drives, navigations, failures };
}

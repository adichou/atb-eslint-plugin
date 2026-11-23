// 按模块和接口契约追踪观察引用；只分析当前文件，不执行受检代码。
import { i_testProperty } from './test-quality-analysis.mjs';

const f_MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'sort', 'fill', 'copyWithin']);
const f_WRITERS = new Set(['Object.assign', 'Object.defineProperty', 'Object.defineProperties', 'Object.setPrototypeOf', 'Object.freeze', 'Object.seal', 'Object.preventExtensions', 'Reflect.set', 'Reflect.deleteProperty', 'Reflect.defineProperty', 'Reflect.setPrototypeOf', 'Reflect.preventExtensions']);
const f_FUNCTION = /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/;
const f_object = (props = new Map(), readonly = false, sharedUnknown = false) => ({ kind: 'object', props, readonly, sharedUnknown });
const f_array = (element, readonly = false, items = []) => ({ kind: 'array', props: new Map(), element, readonly, items });
const f_values = value => value?.kind === 'union' ? value.values : [value];
const f_join = values => {
  const unique = [...new Set(values.flatMap(f_values))];
  return unique.length === 1 ? unique[0] : { kind: 'union', values: unique };
};

// 私有：登记真实公开接口；其他 t_ 接口和普通同名方法不成为观察源。
function f_observation(source, name) {
  if (source === 'litenvi-node/lite-child_process.mjs' && name === 'default.t_calls') {
    return f_array(f_object(new Map([['command', undefined], ['args', f_array(undefined, true)], ['options', f_object(new Map(), true)]]), true), true);
  }
  if (source === 'litenvi-node/lite-server.mjs' && name === 'default.t_requests') return f_array(f_object(new Map(), true), true);
  if (source === 'litenvi-node/lite-process.mjs' && name === 'liteProcess.t_exitCodes'
    || source === 'litenvi-node/lite-cmd-mgr.mjs' && name === 'default.t_defined') return f_array(undefined, true);
  return undefined;
}

// 内部：以词法绑定维护别名和共享关系，诊断落在实际写入处。
export function i_checkReadonlyObservations(sourceCode, api, report) {
  const reported = new WeakSet(), active = new Set(), scanned = new WeakSet(), pending = new Set(), returns = [];
  const warn = node => { if (!reported.has(node)) { reported.add(node); report(node); } };
  const readonly = value => f_values(value).some(item => item?.readonly);
  const keyOf = node => node?.type === 'Literal' ? String(node.value) : node?.name;
  const closure = (node, env) => {
    const value = { kind: 'function', node, env };
    pending.add(value);
    return value;
  };
  const read = (base, key) => {
    if (base?.kind === 'union') return f_join(base.values.map(value => read(value, key)));
    if (!base) return undefined;
    if (base.kind === 'api') return { ...base, name: base.name === '*' ? key : `${base.name}.${key}` };
    if (base.kind === 'builtin') return { ...base, name: `${base.name}.${key}` };
    if (base.props?.has(key)) return base.props.get(key);
    if (key === 'length') return undefined;
    if (base.kind === 'array' && (key === null || /^\d+$/.test(key))) return base.items[Number(key)] ?? base.element;
    if (f_MUTATORS.has(key)) return { kind: 'method', target: base, key };
    // 未知字段仍可能是共享对象；已知的基础值字段不会被当作容器。
    if (base.kind === 'object' && (base.readonly || base.sharedUnknown)) {
      if (['command', 'method', 'url', 'path', 'status', 'statusCode', 'finished', 'aborted'].includes(key)) return undefined;
      const child = f_object(new Map(), true);
      if (key !== null) base.props.set(key, child);
      return child;
    }
    return { kind: 'method', target: base, key };
  };
  const assign = (pattern, value, env, operation) => {
    if (!pattern) return;
    if (pattern.type === 'Identifier') { env.set(api.binding(pattern), value); return; }
    if (pattern.type === 'AssignmentPattern') { assign(pattern.left, value ?? evaluate(pattern.right, env), env, operation); return; }
    if (pattern.type === 'RestElement') { assign(pattern.argument, value, env, operation); return; }
    if (pattern.type === 'ArrayPattern') {
      pattern.elements.forEach((item, index) => assign(item,
        item?.type === 'RestElement' ? f_array(value?.element, false, value?.items?.slice(index)) : read(value, String(index)), env, operation));
      return;
    }
    if (pattern.type === 'ObjectPattern') {
      for (const property of pattern.properties) assign(property.type === 'RestElement' ? property.argument : property.value,
        property.type === 'RestElement' ? copy(value) : read(value, keyOf(property.key)), env, operation);
      return;
    }
    if (pattern.type === 'MemberExpression') {
      const target = evaluate(pattern.object, env);
      if (pattern.computed) evaluate(pattern.property, env);
      if (readonly(target)) warn(operation);
      else for (const item of f_values(target)) item?.props?.set(String(i_testProperty(pattern)), value);
    }
  };
  const copy = value => {
    if (value?.kind === 'union') return f_join(value.values.map(copy));
    if (value?.kind === 'array') return f_array(value.element, false, [...value.items]);
    return f_object(new Map(value?.props), false, value?.readonly || value?.sharedUnknown);
  };
  const invoke = (fn, args, node, receiver) => {
    if (fn?.kind === 'union') return f_join(fn.values.map(value => invoke(value, args, node, receiver)));
    if (!fn) return undefined;
    if (fn.kind === 'bound') return invoke(fn.fn, [...fn.args, ...args], node, fn.receiver);
    if (fn.kind === 'api') {
      if (['litenvi-node/lite-child_process.mjs', 'litenvi-node/lite-server.mjs'].includes(fn.source) && fn.name === 'default.t_mock') return { ...fn, name: 'default' };
      return f_observation(fn.source, fn.name);
    }
    if (fn.kind === 'function') {
      if (active.has(fn.node)) return undefined;
      active.add(fn.node);
      scanned.add(fn.node);
      const env = new Map(fn.env);
      fn.node.params.forEach((parameter, index) => assign(parameter, args[index], env, node));
      const returned = [];
      returns.push(returned);
      const result = fn.node.body.type === 'BlockStatement' ? statement(fn.node.body, env)?.value : evaluate(fn.node.body, env);
      returns.pop();
      const own = new Set(sourceCode.getDeclaredVariables(fn.node));
      for (const binding of fn.env.keys()) if (!own.has(binding)) fn.env.set(binding, env.get(binding));
      active.delete(fn.node);
      return f_join([result, ...returned]);
    }
    if (fn.kind === 'builtin') {
      if (fn.name === 'Reflect.apply') return invoke(args[0], args[2]?.items || [], node, args[1]);
      if (fn.name === 'require' && typeof args[0]?.literal === 'string') return { kind: 'api', source: api.moduleSource(args[0].literal), name: '*' };
      if (f_WRITERS.has(fn.name)) {
        if (readonly(args[0])) warn(node);
        if (fn.name === 'Object.assign') {
          if (!readonly(args[0])) for (const source of args.slice(1)) {
            if (args[0]?.props) args[0].sharedUnknown ||= source?.readonly || source?.sharedUnknown;
            for (const [key, value] of source?.props || []) args[0]?.props?.set(key, value);
          }
          return args[0];
        }
        return undefined;
      }
      if (fn.name === 'structuredClone') return undefined;
      if (fn.name === 'Array.from') return args[1] ? f_array(invoke(args[1], [args[0]?.element, undefined], node)) : copy(args[0]);
      if (fn.name === 'Object.values') return f_array(f_join([...(args[0]?.props?.values() || [])]));
      if (fn.name === 'Object.entries') return f_array(f_array(f_join([...(args[0]?.props?.values() || [])]), false, [undefined, f_join([...(args[0]?.props?.values() || [])])]));
      if (/^Array\.prototype\./.test(fn.name)) return invoke({ kind: 'method', target: receiver, key: fn.name.split('.').at(-1) }, args, node);
      return undefined;
    }
    if (fn.kind !== 'method') return undefined;
    const { key } = fn;
    const target = receiver === undefined ? fn.target : receiver;
    if (key === 'bind') return { kind: 'bound', fn: target, receiver: args[0], args: args.slice(1) };
    if (key === 'call') return invoke(target, args.slice(1), node, args[0]);
    if (key === 'apply') return invoke(target, args[1]?.items || [], node, args[0]);
    if (f_MUTATORS.has(key)) {
      if (readonly(target)) warn(node);
      if (target?.kind === 'array' && !target.readonly && ['push', 'unshift', 'splice', 'fill'].includes(key)) {
        const added = key === 'splice' ? args.slice(2) : key === 'fill' ? args.slice(0, 1) : args;
        target.element = f_join([target.element, ...added]);
      }
      if (['sort', 'reverse', 'fill', 'copyWithin'].includes(key)) return target;
      return ['pop', 'shift'].includes(key) ? target?.element : undefined;
    }
    if (target?.kind !== 'array') return undefined;
    const element = target.element;
    if (key === 'values') return copy(target);
    if (key === 'entries') return f_array(f_array(element, false, [undefined, element]));
    if (['map', 'flatMap', 'forEach', 'filter', 'find', 'findLast', 'findIndex', 'findLastIndex', 'some', 'every'].includes(key)) {
      const mapped = invoke(args[0], [element, undefined, target], node);
      if (key === 'map') return f_array(mapped);
      if (key === 'flatMap') return f_array(mapped?.element);
      if (key === 'filter') return copy(target);
      if (['find', 'findLast'].includes(key)) return element;
      return undefined;
    }
    if (key === 'at') return element;
    if (['slice', 'toSorted', 'toReversed', 'toSpliced', 'with'].includes(key)) return copy(target);
    if (key === 'concat') return f_array(f_join([element, ...args.map(value => value?.kind === 'array' ? value.element : value)]));
    if (key === 'reduce' || key === 'reduceRight') return invoke(args[0], [args[1], element, undefined, target], node);
    return undefined;
  };
  const evaluate = (node, env) => {
    if (!node) return undefined;
    if (f_FUNCTION.test(node.type)) return closure(node, env);
    switch (node.type) {
      case 'Identifier': {
        const binding = api.binding(node);
        if (env.has(binding)) return env.get(binding);
        if (binding?.defs[0]?.type === 'ImportBinding') return { kind: 'api', ...api.symbol(node) };
        if (!binding?.defs.length && ['Object', 'Reflect', 'Array', 'structuredClone', 'require'].includes(node.name)) return { kind: 'builtin', name: node.name };
        return undefined;
      }
      case 'Literal': return { kind: 'primitive', literal: node.value };
      case 'ChainExpression': return evaluate(node.expression, env);
      case 'AwaitExpression': return evaluate(node.argument, env);
      case 'ImportExpression': {
        const target = evaluate(node.source, env)?.literal;
        return typeof target === 'string' ? { kind: 'api', source: api.moduleSource(target), name: '*' } : undefined;
      }
      case 'MemberExpression': {
        const base = evaluate(node.object, env);
        if (node.computed) evaluate(node.property, env);
        const key = i_testProperty(node);
        if (['bind', 'call', 'apply'].includes(key) && !(base?.kind === 'builtin' && ['Object', 'Reflect', 'Array'].includes(base.name))) return { kind: 'method', target: base, key };
        return read(base, key === null ? null : String(key));
      }
      case 'CallExpression': case 'NewExpression': {
        const fn = evaluate(node.callee, env);
        const args = node.arguments.map(argument => evaluate(argument.type === 'SpreadElement' ? argument.argument : argument, env));
        const result = invoke(fn, args, node);
        // 测试框架等外部回调入口仍需检查回调体；参数不猜成观察值。
        if (!fn || fn.kind === 'api') for (const argument of args) if (argument?.kind === 'function' && !scanned.has(argument.node)) invoke(argument, [], node);
        return result;
      }
      case 'ArrayExpression': {
        const items = node.elements.map(item => evaluate(item?.type === 'SpreadElement' ? item.argument : item, env));
        return f_array(f_join(items.map((value, index) => node.elements[index]?.type === 'SpreadElement' ? value?.element : value)), false,
          node.elements.some(item => item?.type === 'SpreadElement') ? [] : items);
      }
      case 'ObjectExpression': {
        const result = f_object();
        for (const property of node.properties) {
          if (property.type === 'SpreadElement') {
            const source = evaluate(property.argument, env);
            result.sharedUnknown ||= source?.readonly || source?.sharedUnknown;
            for (const [key, value] of source?.props || []) result.props.set(key, value);
          }
          else result.props.set(keyOf(property.key), evaluate(property.value, env));
        }
        return result;
      }
      case 'AssignmentExpression': {
        const value = evaluate(node.right, env);
        assign(node.left, value, env, node);
        return value;
      }
      case 'UpdateExpression': case 'UnaryExpression': {
        if (node.type === 'UpdateExpression' || node.operator === 'delete') assign(node.argument, undefined, env, node);
        else evaluate(node.argument, env);
        return undefined;
      }
      case 'ConditionalExpression': case 'LogicalExpression': {
        evaluate(node.test || node.left, env);
        return f_join([evaluate(node.consequent || node.left, new Map(env)), evaluate(node.alternate || node.right, new Map(env))]);
      }
      case 'SequenceExpression': return node.expressions.map(item => evaluate(item, env)).at(-1);
      default:
        for (const [key, value] of Object.entries(node)) {
          if (['parent', 'tokens', 'comments'].includes(key)) continue;
          if (value?.type) evaluate(value, env);
          else if (Array.isArray(value)) for (const item of value) if (item?.type) evaluate(item, env);
        }
        return undefined;
    }
  };
  const statement = (node, env) => {
    if (!node) return null;
    if (['Program', 'BlockStatement'].includes(node.type)) {
      for (const child of node.body) if (child.type === 'FunctionDeclaration') {
        const binding = sourceCode.getDeclaredVariables(child).find(variable => variable.defs.some(def => def.type === 'FunctionName'));
        env.set(binding, closure(child, env));
      }
      for (const child of node.body) { const result = statement(child, env); if (result) return result; }
      return null;
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'ImportDeclaration') return null;
    if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) assign(declaration.id, evaluate(declaration.init, env), env, declaration);
      return null;
    }
    if (node.type === 'ReturnStatement') {
      const value = evaluate(node.argument, env);
      returns.at(-1)?.push(value);
      return { value };
    }
    if (node.type === 'IfStatement') {
      evaluate(node.test, env);
      const left = new Map(env), right = new Map(env);
      const a = statement(node.consequent, left), b = statement(node.alternate, right);
      for (const key of new Set([...left.keys(), ...right.keys()])) env.set(key, f_join([left.get(key), right.get(key)]));
      return a && b ? { value: f_join([a.value, b.value]) } : null;
    }
    if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
      const collection = evaluate(node.right, env);
      const pattern = node.left.type === 'VariableDeclaration' ? node.left.declarations[0].id : node.left;
      assign(pattern, node.type === 'ForOfStatement' ? collection?.element : undefined, env, node);
      statement(node.body, env);
      return null;
    }
    if (node.type === 'TryStatement') {
      const result = statement(node.block, env);
      statement(node.handler?.body, env);
      statement(node.finalizer, env);
      return result;
    }
    if (node.type === 'ExpressionStatement') { evaluate(node.expression, env); return null; }
    if (/Expression$/.test(node.type)) { evaluate(node, env); return null; }
    for (const [key, value] of Object.entries(node)) {
      if (['parent', 'tokens', 'comments'].includes(key)) continue;
      if (value?.type) statement(value, env);
      else if (Array.isArray(value)) for (const item of value) if (item?.type) statement(item, env);
    }
    return null;
  };
  statement(sourceCode.ast, new Map());
  // 主流程完成后再检查未调用函数，避免将其赋值误当成主流程已经执行。
  for (const value of pending) if (!scanned.has(value.node)) invoke({ ...value, env: new Map(value.env) }, [], value.node);
}

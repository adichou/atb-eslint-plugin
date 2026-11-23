// 生产、工具和测试共用的吞错检查：空 catch 与可确认 Promise 的空拒绝回调均报告。
// 只判断空块，不证明非空处理是否有效；未知工厂和普通同名 catch 方法不猜成 Promise。
const f_FACTORIES = new Set(['resolve', 'reject', 'all', 'allSettled', 'race', 'any']);
const f_CHAINS = new Set(['then', 'catch', 'finally']);
const f_property = node => node?.type === 'MemberExpression'
  ? node.computed ? node.property.type === 'Literal' ? node.property.value : null : node.property.name : null;

export default {
 meta: {
 type: 'problem',
 docs: { description: '统一吞错检查：空 catch 块与可确认 Promise 的空拒绝回调报错' },
 schema: [],
 messages: {
 swallowedError: '吞错：catch 块为空或仅含注释，失败既未处理也未上抛（{{file}}）；请处理错误、重新抛出、记录或转为显式预期失败流程',
 swallowedPromiseError: '吞错：Promise.catch 的拒绝回调为空或仅含注释，失败未被处理（{{file}}）；请处理错误、重新抛出或记录',
 },
 },

 create(context) {
 const filename = context.filename || context.getFilename();
 const source = context.sourceCode;
 const binding = node => node?.type === 'Identifier'
   ? source.getScope(node).references.find(reference => reference.identifier === node)?.resolved || source.getScope(node).set.get(node.name) : null;
 // 变量或其成员被改写时停止沿用初值，不把过期别名当成确定来源。
 const stable = variable => !variable.references.some(reference => {
   if (reference.isWrite() && !reference.init) return true;
   let current = reference.identifier;
   while (current.parent?.type === 'MemberExpression' && current.parent.object === current) current = current.parent;
   const parent = current.parent;
   return current !== reference.identifier && (parent?.type === 'AssignmentExpression' && parent.left === current
     || parent?.type === 'UpdateExpression' || parent?.type === 'UnaryExpression' && parent.operator === 'delete');
 });
 const member = (base, key, seen) => {
   if (base?.native && f_FACTORIES.has(key)) return { factory: true };
   if (base?.object) {
     const property = base.object.properties.find(item => item.type === 'Property'
       && (!item.computed || item.key.type === 'Literal') && (item.key.name || item.key.value) === key);
     return property ? symbol(property.value, seen) : null;
   }
   return null;
 };
 const symbol = (node, seen = new Set()) => {
   if (!node) return null;
   if (node.type === 'ChainExpression') return symbol(node.expression, seen);
   if (/^(?:FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) return { fn: node };
   if (node.type === 'ObjectExpression') return { object: node };
   if (node.type === 'Identifier') {
     const variable = binding(node);
     if (!variable?.defs.length) return node.name === 'Promise' ? { native: true } : node.name === 'fetch' ? { factory: true } : null;
     if (seen.has(variable) || !stable(variable)) return null;
     const def = variable.defs[0], next = new Set(seen).add(variable);
     if (def.type === 'FunctionName') return { fn: def.node };
     if (def.type !== 'Variable') return null;
     const value = symbol(def.node.init, next);
     if (def.node.id.type === 'ObjectPattern') {
       const property = def.node.id.properties.find(item => item.value === def.name);
       return property ? member(value, property.key.name || property.key.value, next) : null;
     }
     return value;
   }
   return node.type === 'MemberExpression' ? member(symbol(node.object, seen), f_property(node), seen) : null;
 };
 const promise = (node, seen = new Set()) => {
   if (!node) return false;
   if (node.type === 'ChainExpression') return promise(node.expression, seen);
   if (node.type === 'Identifier') {
     const variable = binding(node), def = variable?.defs[0];
     return !!def && def.type === 'Variable' && def.node.id.type === 'Identifier' && !seen.has(variable) && stable(variable)
       && promise(def.node.init, new Set(seen).add(variable));
   }
   if (node.type === 'NewExpression') return !!symbol(node.callee, seen)?.native;
   if (node.type !== 'CallExpression') return false;
   const callee = symbol(node.callee, seen);
   return !!(callee?.factory || callee?.fn?.async && !callee.fn.generator
     || node.callee.type === 'MemberExpression' && f_CHAINS.has(f_property(node.callee)) && promise(node.callee.object, seen));
 };
 return {
 CatchClause(node) {
 if (node.body.body.length > 0) return;
 context.report({ node: node.body, messageId: 'swallowedError', data: { file: filename } });
 },
 CallExpression(node) {
   if (f_property(node.callee) !== 'catch' || !promise(node.callee.object)) return;
   const callback = symbol(node.arguments[0])?.fn;
   if (callback?.body.type === 'BlockStatement' && !callback.body.body.length) {
     context.report({ node: callback.body, messageId: 'swallowedPromiseError', data: { file: filename } });
   }
 },
 };
 },
};

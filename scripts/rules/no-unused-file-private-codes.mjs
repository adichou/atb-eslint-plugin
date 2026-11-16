// atb/no-unused-file-private-codes — 文件内无引用的 f_ 绑定（死文件私有代码）。
// f_ 前缀的契约是「仅本文件可用」（跨文件引用由 no-out-of-level-access 拦截），因此本文件
// 内零引用的 f_ 绑定必然是死代码——不需要跨文件分析，ESLint 作用域引用计数即可判准。
// 检查面与 no-wrong-access-level 同界：模块顶层绑定（函数声明、var/let/const 声明——函数
// 值与数据值都查，f_ 数据常量同属文件私有）；嵌套作用域内的 f_ 局部名不查（顶层语义与其
// 一致，函数内局部未用是 core no-unused-vars 的领域，本生态经典脚本桥接形态启用 core 规则
// 误报面大，不代其表态）。
// 导出面跳过：export 声明 / export 名单 / export default 引用的 f_ 不在本规则报——导出面
// 的 f_ 违规由 no-out-of-level-access 的 filePrivateExport 口径统一报告，避免同面双报。
// 引用形态按作用域事实：标识符引用（调用、传参、shorthand 键、模板插值）都算；字符串字面
// 量里的同文名不算引用（AST 作用域分析天然区分）。
export default {
 meta: {
 type: 'problem',
 docs: { description: '文件内无引用的 f_ 绑定（文件私有死代码；顶层绑定，嵌套局部不查；导出面移交 no-out-of-level-access）' },
 schema: [],
 messages: {
 unusedFilePrivateCodes: "文件私有绑定 '{{name}}' 在本文件内无任何引用：f_ 声明仅本文件可用，无人使用即死代码，请删除或接入使用",
 },
 },

 create(context) {
 const sourceCode = context.sourceCode || context.getSourceCode();
 // 名单/default 导出引用的本地名集合（这些 f_ 由导出面规则表态）。
 const exportReferenced = new Set();
 return {
 ExportNamedDeclaration(node) {
 if (!node.declaration) {
 for (const spec of node.specifiers) exportReferenced.add(spec.local.name);
 }
 },
 ExportDefaultDeclaration(node) {
 if (node.declaration.type === 'Identifier') exportReferenced.add(node.declaration.name);
 },
 'Program:exit'(programNode) {
 // 顶层声明的作用域按模块形态落位：ESM 在 globalScope 的 module 子作用域，经典脚本直接
 // 在 globalScope——两面并集遍历。
 const globalScope = sourceCode.getScope(programNode);
 const topScopes = [globalScope, ...globalScope.childScopes.filter((s) => s.type === 'module')];
 for (const scope of topScopes) {
 for (const [name, binding] of scope.set) {
 if (!name.startsWith('f_')) continue;
 if (exportReferenced.has(name)) continue;
 // 声明形态的导出（export function f_x / export const f_x）同样移交导出面规则。
 const defNode = binding.defs[0] && binding.defs[0].node;
 if (defNode && defNode.parent && defNode.parent.type === 'ExportNamedDeclaration') continue;
 // 引用计数排除声明自身：本版本作用域分析把 var/let/const 声明标识符也计入 references
 //（函数声明不计），真实引用 = 非声明节点的引用。
 const realRefs = binding.references.filter((ref) => !binding.defs.some((d) => d.name === ref.identifier
 || (d.name && d.name.range && ref.identifier.range && d.name.range[0] === ref.identifier.range[0] && d.name.range[1] === ref.identifier.range[1])));
 if (realRefs.length > 0) continue;
 // 报点取首个定义的标识符节点（Binding 本体不携带 AST 节点）。
 const nameNode = binding.defs[0] && binding.defs[0].name;
 if (!nameNode) continue;
 context.report({
 node: nameNode,
 messageId: 'unusedFilePrivateCodes',
 data: { name },
 });
 }
 }
 },
 };
 },
};

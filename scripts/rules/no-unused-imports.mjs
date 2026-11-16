// atb/no-unused-imports — 导入但未使用的绑定（死导入）。
// import 绑定（具名/默认/命名空间/别名，无论前缀）在文件内零引用即死代码——文件内作用域
// 引用计数判准（与 no-unused-file-private-codes 同骨架），报告带来源说明符指明删哪行。
// 边界（如实声明）：副作用导入（import 'x'）无绑定、其存在即意义，不检；CommonJS require
// 声明与普通变量未用不在此——前者生态经典脚本桥接形态留白，后者 core no-unused-vars 领域
//（本生态经典脚本形态启用 core 规则误报面大，不代其表态）。
export default {
 meta: {
 type: 'problem',
 docs: { description: '导入但未使用的绑定（具名/默认/命名空间/别名全形态；副作用导入无绑定不检）' },
 schema: [],
 messages: {
 unusedImports: "导入 '{{name}}'（来自 '{{source}}'）未使用：死导入应删除",
 },
 },

 create(context) {
 const sourceCode = context.sourceCode || context.getSourceCode();
 // 本文件导入绑定清单：local 标识符 + 来源说明符（副作用导入无 specifier 不入清单）。
 const imports = [];
 return {
 ImportDeclaration(node) {
 for (const spec of node.specifiers) {
 imports.push({ local: spec.local, source: node.source.value });
 }
 },
 'Program:exit'() {
 for (const { local, source } of imports) {
 const binding = sourceCode.getScope(local).set.get(local.name);
 if (!binding) continue;
 // 引用计数排除声明自身（作用域分析对部分声明形态计入声明标识符，与家族口径一致）。
 const realRefs = binding.references.filter((ref) => !binding.defs.some((d) => d.name === ref.identifier));
 if (realRefs.length > 0) continue;
 context.report({ node: local, messageId: 'unusedImports', data: { name: local.name, source } });
 }
 },
 };
 },
};

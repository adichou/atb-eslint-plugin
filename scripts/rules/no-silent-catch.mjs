// atb/no-silent-catch — 生产侧吞错检查。
// 生产与工具代码的 catch 块为空或仅含注释时按吞错报错：错误须被处理、上抛、记录或交给
// 显式断言/清理流程；测试分区的同型检查由 atb/no-bad-test-patterns 承担，两分区口径一致。
// 合法形态不误报：catch 内有语句（含 finally 清理、rethrow、日志、返回错误值）均放行。
export default {
 meta: {
 type: 'problem',
 docs: { description: '生产与工具代码吞错检查：空或仅注释 catch 块报错' },
 schema: [],
 messages: {
 swallowedError: '吞错：catch 块为空或仅含注释，失败既未处理也未上抛（{{file}}）；请处理错误、重新抛出、记录或转为显式预期失败流程',
 },
 },

 create(context) {
 const filename = context.filename || context.getFilename();
 return {
 CatchClause(node) {
 if (node.body.body.length > 0) return;
 context.report({ node: node.body, messageId: 'swallowedError', data: { file: filename } });
 },
 };
 },
};

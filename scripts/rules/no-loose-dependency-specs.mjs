// atb/no-loose-dependency-specs — package.json 依赖版本政策。
// 插件 0.91.2 无 restrict-dist-tags：本规则补齐——禁止全部 dist-tag 依赖标签（latest/next
// 等裸词非精确版本即报），registry 依赖须为可复现的精确版本。
// 本地来源（file:/link:）不在本规则检测：它是开发分支的平级仓联调形态（非 main 分支允许
// 使用）；合入 main 前替换为依赖包正式版本属交付流程约束，由看板需求承接（main 分支守护
// 不走 ESLint）。git/URL 来源策略待确认，同样不在本规则表态。
// 精确版本范围（^/~）由 package-json/restrict-dependency-ranges 承接，此处不重复报。
export default {
 meta: {
 type: 'problem',
 docs: { description: 'package.json 依赖版本政策：dist-tag 禁令（本地来源与 git/URL 如实留白，main 分支守护归交付流程）' },
 schema: [{
 type: 'object',
 properties: {},
 additionalProperties: false,
 }],
 messages: {
 distTag: "依赖 {{group}}/{{name}} 使用 dist-tag 标签 '{{spec}}'：registry 依赖须为精确版本，禁止全部 dist-tag",
 unresolvableSpec: "依赖 {{group}}/{{name}} 的版本 '{{spec}}' 既非精确版本也无法归类",
 },
 },

 create(context) {
 function checkManifest() {
 let manifest;
 try {
 manifest = JSON.parse(context.sourceCode.text);
 } catch {
 return; // valid-package-definition 已报 JSON 解析问题
 }
 for (const [group, deps] of f_depGroups(manifest)) {
 for (const [name, spec] of Object.entries(deps)) {
 if (typeof spec !== 'string') continue;
 if (spec.startsWith('file:') || spec.startsWith('link:')) continue; // 本地来源：开发分支联调形态，不检
 if (spec.startsWith('git') || spec.startsWith('http://') || spec.startsWith('https://') || spec.startsWith('github:')) {
 continue; // git/URL 来源政策待确认，不在本规则表态
 }
 if (EXACT_VERSION.test(spec.replace(/^v/, ''))) continue;
 if (BARE_TAG.test(spec)) {
 // 全部裸词（dist-tag 家族及变体）按浮动标签处理：registry 依赖只认精确版本。
 context.report({ node: context.sourceCode.ast, messageId: 'distTag', data: { group, name, spec } });
 }
 // 其余（^ ~/ >= 等 range、*）由 package-json/restrict-dependency-ranges 报告。
 }
 }
 }

 return {
 Program: checkManifest,
 };
 },
};

// 私有：依赖分组遍历（含本地来源组，本地来源在循环内跳过）。
function f_depGroups(manifest) {
 return ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
 .map((group) => [group, manifest[group] || {}]);
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
const BARE_TAG = /^[A-Za-z][\w.-]*$/;

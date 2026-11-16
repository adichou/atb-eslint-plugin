// atb/no-loose-dependency-specs — package.json 依赖来源项目政策。
// 插件 0.91.2 无 restrict-dist-tags 且不管理本地来源白名单：本规则补齐——
// ① 禁止全部 dist-tag 依赖标签（latest/next 等裸词非精确版本即报）；
// ② 本地 file:/link: 来源按「明确包名 + 规范化目标路径」白名单管理，不整体放行本地来源；
// ③ git/URL 来源策略待确认，暂不在本规则表态（不从本地白名单推导获准或被禁）。
// 精确版本范围（^/~）由 package-json/restrict-dependency-ranges 承接，此处不重复报。
import path from 'node:path';
import fs from '../../../litenvi-node/scripts/lite-fs.mjs';

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
const BARE_TAG = /^[A-Za-z][\w.-]*$/;
const DIST_TAGS = new Set(['latest', 'next', 'nightly', 'rc', 'beta', 'alpha', 'canary', 'insiders', 'legacy']);

function f_depGroups(manifest) {
 return ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
 .map((group) => [group, manifest[group] || {}]);
}

export default {
 meta: {
 type: 'problem',
 docs: { description: 'package.json 依赖来源政策：dist-tag 禁令与本地来源白名单' },
 schema: [{
 type: 'object',
 properties: {
 localWhitelist: {
 type: 'array',
 items: {
 type: 'object',
 properties: {
 name: { type: 'string' },
 spec: { type: 'string' },
 },
 required: ['name', 'spec'],
 additionalProperties: false,
 },
 },
 },
 additionalProperties: false,
 }],
 messages: {
 distTag: "依赖 {{group}}/{{name}} 使用 dist-tag 标签 '{{spec}}'：registry 依赖须为精确版本，禁止全部 dist-tag",
 unresolvableSpec: "依赖 {{group}}/{{name}} 的版本 '{{spec}}' 既非精确版本也无法归类",
 localNotWhitelisted: "依赖 {{group}}/{{name}} 的本地来源 '{{spec}}' 不在白名单：本地来源须按明确包名与规范化目标路径登记",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 const whitelist = options.localWhitelist || [];

 function checkManifest() {
 let manifest;
 try {
 manifest = JSON.parse(context.sourceCode.text);
 } catch {
 return; // valid-package-definition 已报 JSON 解析问题
 }
 const packageDir = path.dirname(context.filename);
 for (const [group, deps] of f_depGroups(manifest)) {
 for (const [name, spec] of Object.entries(deps)) {
 if (typeof spec !== 'string') continue;
 if (spec.startsWith('file:') || spec.startsWith('link:')) {
 const allowed = whitelist.find((entry) => entry.name === name && entry.spec === spec);
 if (allowed) {
 // 规范化目标路径核验：白名单目标须真实存在
 const target = path.resolve(packageDir, spec.replace(/^(?:file|link):/, ''));
 if (!fs.existsSync(target)) {
 context.report({ node: context.sourceCode.ast, messageId: 'localNotWhitelisted', data: { group, name, spec } });
 }
 continue;
 }
 context.report({ node: context.sourceCode.ast, messageId: 'localNotWhitelisted', data: { group, name, spec } });
 continue;
 }
 if (spec.startsWith('git') || spec.startsWith('http://') || spec.startsWith('https://') || spec.startsWith('github:')) {
 continue; // git/URL 来源政策待确认，不在本规则表态
 }
 if (EXACT_VERSION.test(spec.replace(/^v/, ''))) continue;
 if (BARE_TAG.test(spec) && DIST_TAGS.has(spec)) {
 context.report({ node: context.sourceCode.ast, messageId: 'distTag', data: { group, name, spec } });
 continue;
 }
 if (BARE_TAG.test(spec)) {
 // 其余裸词（如 next-tag 变体）同样按 dist-tag 处理：registry 依赖只认精确版本
 context.report({ node: context.sourceCode.ast, messageId: 'distTag', data: { group, name, spec } });
 }
 // 其余（^ ~/ >= 等 range、*）由 package-json/restrict-dependency-ranges 报告
 }
 }
 }

 return {
 Program: checkManifest,
 };
 },
};

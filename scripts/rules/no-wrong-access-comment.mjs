// atb/no-wrong-access-comment — 本仓方法访问级别注释一致性核验。
// 受检范围：当前项目（scanPath 内）的实现文件；scanPath 外不受检（由其所属仓库核验）。
// ATB 访问级别政策：CLI/hooks/ESLint 入口导出为外部接口，其余生产导出至少 i_（包内协作），级别由使用方
// 以访问级别注释自行声明（外部：/内部：/私有：），未导出方法一律 f_（由 no-wrong-access-
// level 承接，不要求注释）；ATB 生产区无 t_ 接口。
// 本规则只做一致性核验，不要求注释必须存在：定义紧邻注释出现级别标注时，标注须与方法名
// 前缀及导出情况相符——f_ 只允许「私有」、i_ 只允许「内部」、t_ 只允许「测试专用」、
// 无前缀导出方法允许「内部/外部」（标注「私有/测试专用」即矛盾，如导出方法标注「私有」）。
// 注释标注不构成对导出面的级别检查（导出面不做消费方推导）。
// 注释取定义紧邻的连续注释块（无空行间隔）；正文偶然出现的级别词不构成标注。
import path from 'node:path';

const DEFAULT_TAGS = { filePrivate: '私有', internal: '内部', testOnly: '测试专用', public: '外部' };
// 级别标注：行首（含块注释的 * 前缀行）出现「私有/内部/测试专用/外部」紧跟冒号才构成标注。
const LEVEL_TAG_RE = /(?:^|\n)\s*\*?\s*(?:私有|内部|测试专用|外部)\s*[：:]/;

function f_classify(name, prefixes) {
 if (name.startsWith(prefixes.filePrivate)) return 'filePrivate';
 if (name.startsWith(prefixes.internal)) return 'internal';
 if (name.startsWith(prefixes.testOnly)) return 'testOnly';
 return 'public';
}

function f_definedName(node) {
 if (node.type === 'MethodDefinition' || node.type === 'Property' || node.type === 'PropertyDefinition') {
 if (node.computed) return null;
 if (node.key.type === 'Identifier') return node.key.name;
 if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value;
 return null;
 }
 // 仅剩 FunctionDeclaration（调用方为四类 visitor）；匿名导出函数无 id 返回 null
 return node.id ? node.id.name: null;
}

function f_isExportedDefinition(node) {
 let current = node.parent;
 while (current) {
 if (current.type === 'ExportNamedDeclaration' || current.type === 'ExportDefaultDeclaration') return true;
 if (current.type === 'Program' || current.type === 'CallExpression') return false;
 current = current.parent;
 }
 return false;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: '本仓方法访问级别注释一致性核验：f_ 私有、i_ 内部、t_ 测试专用、导出面内部/外部' },
 schema: [{
 type: 'object',
 properties: {
 scanPath: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 methodCommentConflict: "方法 '{{name}}' 注释标注「{{found}}」与访问级别「{{expected}}」矛盾（{{reason}}）",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 const scanPath = path.resolve(options.scanPath || process.cwd());
 const filename = path.resolve(context.filename || context.getFilename());
 const relative = path.relative(scanPath, filename).split(path.sep).join('/');
 // scanPath 之外的文件不受检：由其所属仓库核验。
 if (relative.startsWith('../')) return {};

 const sourceCode = context.sourceCode || context.getSourceCode();
 const tags = DEFAULT_TAGS;

 // 级别标注与 (前缀分类, 导出情况) 的允许关系：不符即矛盾。
 function f_allowedTags(kind, exported) {
 if (kind === 'filePrivate') return new Set([tags.filePrivate]);
 if (kind === 'internal') return new Set([tags.internal]);
 if (kind === 'testOnly') return new Set([tags.testOnly]);
 // 无前缀：导出面（含经导出对象可达的方法）只允许 内部/外部；未导出实现不作约束
 //（其命名归 no-wrong-access-level 管）。
 return exported ? new Set([tags.internal, tags.public]): null;
 }

 // 私有：定义紧邻的连续注释块（无空行间隔）内出现的级别标注集合。
 function f_annotationTags(anchorNode, fallbackNode) {
 const comments = sourceCode.getCommentsBefore(anchorNode);
 if (!comments.length) return [];
 const last = comments[comments.length - 1];
 // 注释块与定义之间不允许空行——隔行即视为无关说明，不构成标注。
 const definitionLine = (fallbackNode || anchorNode).loc.start.line;
 if (definitionLine - last.loc.end.line > 1) return [];
 const block = [last];
 for (let i = comments.length - 2; i >= 0; i--) {
 if (last.loc.start.line - comments[i].loc.end.line > 1) break;
 block.unshift(comments[i]);
 }
 const text = block.map((c) => (c.type === 'Block' ? c.value.replace(/\*/g, ' '): c.value)).join('\n');
 const found = new Set();
 for (const tag of Object.values(tags)) {
 const tagAtLineStart = new RegExp(`(?:^|\\n)\\s*\\*?\\s*${tag}\\s*[：:]`);
 if (tagAtLineStart.test(text)) found.add(tag);
 }
 return [...found];
 }

 function checkDefinition(node) {
 let defined = node;
 if (node.type === 'MethodDefinition' || node.type === 'Property' || node.type === 'PropertyDefinition') {
 if (!node.value || !['FunctionExpression', 'ArrowFunctionExpression'].includes(node.value.type)) return;
 defined = node;
 }
 const name = f_definedName(defined);
 if (!name) return;
 const kind = f_classify(name, { filePrivate: 'f_', internal: 'i_', testOnly: 't_' });
 // 导出函数的注释锚点取 export 语句（注释紧邻 export 关键字之前）
 const anchor = defined.type === 'FunctionDeclaration' && node.parent
 && (node.parent.type === 'ExportNamedDeclaration' || node.parent.type === 'ExportDefaultDeclaration') ? node.parent: node;
 const present = f_annotationTags(anchor, defined);
 if (present.length === 0) return; // 缺失不报：级别由使用方自行声明，本规则只对账已声明者
 const exported = f_isExportedDefinition(defined);
 const allowed = f_allowedTags(kind, exported);
 if (!allowed) return;
 const conflicts = present.filter((tag) => !allowed.has(tag));
 if (conflicts.length === 0) return;
 const reason = exported && kind === 'public' ? '无前缀方法已对外导出，不得标注私有/测试专用'
 : exported ? '导出方法级别由注释声明，须为 内部 或 外部'
 : `与方法名前缀不符，${kind === 'filePrivate' ? 'f_ 方法只能标注 私有': kind === 'internal' ? 'i_ 方法只能标注 内部': 't_ 方法只能标注 测试专用'}`;
 context.report({
 node: defined.type === 'FunctionDeclaration' ? defined.id: defined.key,
 messageId: 'methodCommentConflict',
 data: { name, found: conflicts.join('／'), expected: [...allowed].join('／'), reason },
 });
 }

 return {
 MethodDefinition: checkDefinition,
 Property: checkDefinition,
 PropertyDefinition: checkDefinition,
 FunctionDeclaration: checkDefinition,
 };
 },
};

// atb/no-unmanaged-js — 受管路径外的 JavaScript 文件检查。
// scanPath（仓库根）内被 ESLint 枚举到的 .js/.mjs/.cjs 文件，相对路径不命中 managedPaths
// 即报错——受管路径是封闭集合：落在集合外的文件得不到对应角色的边界检查（越级访问、依赖
// 作用域、f_ 分级等经分区 files 分发），不能静默放行。根 eslint.config.mjs 是配置不是代码，
// 经 managedPaths 登记豁免；scanPath 之外（相邻包、系统路径）不归本仓判定。managedPaths
// 缺省为空：未配置即全部报错（fail-loud），配置方必须显式声明受管路径。
import path from 'node:path';
import { minimatch } from '../lib/attributions.mjs';

export default {
 meta: {
 type: 'problem',
 docs: { description: '受管路径外的 JavaScript 文件检查：不在 managedPaths 内明确报错' },
 schema: [{
 type: 'object',
 properties: {
 scanPath: { type: 'string' },
 managedPaths: { type: 'array', items: { type: 'string' } },
 },
 additionalProperties: false,
 }],
 messages: {
 unmanagedFile: "文件 {{file}} 不在受管路径（managedPaths）内，边界检查无法覆盖（检查死角）：请移入受管目录，或在 eslint.config.mjs 的 managedPaths 登记该路径",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 const scanPath = path.resolve(options.scanPath || process.cwd());
 const managedPaths = options.managedPaths || [];
 const filename = path.resolve(context.filename || context.getFilename());
 const relative = path.relative(scanPath, filename).split(path.sep).join('/');
 // 仓库根之外的文件（相邻包、系统路径）不属于本仓受管范围，不在此判定。
 if (relative.startsWith('../')) return {};
 const managed = managedPaths.some((pattern) => minimatch(relative, pattern));
 if (managed) return {};
 return {
 Program(node) {
 context.report({ node, messageId: 'unmanagedFile', data: { file: relative } });
 },
 };
 },
};

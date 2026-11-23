// 包入口不能发布可执行测试或构建工具；测试目录的精确辅助模块可作为对外 t_ 接口。
// main/exports 中的精确辅助模块由定义侧继续检查接口级别；测试目录的 bin 仍禁止。
// 测试目录通配模式可能暴露用例，沿原有保守规则拒绝；不新增任意文件豁免。
import path from 'node:path';
import { i_minimatch } from '../lib/attributions.mjs';

const DEFAULT_TEST_DIR = 'scripts/tests';

// 私有：manifest 的入口面目标展开（带声明标签）：main、bin（字符串与对象形态）、exports
//（顶层键为路径模式，其值可为条件对象/数组/目标串）。
function f_faceTargets(manifest) {
 const targets = [];
 if (typeof manifest.main === 'string') targets.push({ face: 'main', target: manifest.main });
 if (typeof manifest.bin === 'string') targets.push({ face: 'bin', target: manifest.bin });
 for (const [command, target] of Object.entries(manifest.bin || {})) {
 if (typeof target === 'string') targets.push({ face: `bin/${command}`, target });
 }
 const collect = (key, value) => {
 if (!value) return;
 if (typeof value === 'string') { targets.push({ face: `exports/${key}`, target: value }); return; }
 if (Array.isArray(value)) { value.forEach((item) => collect(key, item)); return; }
 if (typeof value === 'object') {
 for (const condition of ['node', 'import', 'require', 'default']) collect(key, value[condition]);
 }
 };
 const exports = manifest.exports;
 if (exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some(key => key.startsWith('.'))) {
 for (const [key, value] of Object.entries(exports)) collect(key, value);
 } else collect('.', exports);
 return targets;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: '禁止包入口暴露可执行测试与构建工具；允许精确登记测试辅助模块，接口级别另行校验' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 buildToolDir: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 faceTargetInternal: "入口面 {{face}} 的目标 '{{target}}' 指向{{kind}}文件：测试命令、可执行测试与构建工具不能作为对外入口；测试辅助模块只能精确登记为导入入口",
 patternTargetInternal: "入口面 {{face}} 的通配模式 '{{target}}' 可命中{{kind}}文件：测试与构建工具代码不得经 exports 模式暴露",
 },
 },

 create(context) {
 return {
 Program(node) {
 let manifest;
 try { manifest = JSON.parse(context.sourceCode.text); } catch { return; }
 const packageDir = path.dirname(path.resolve(context.filename || context.getFilename()));
 // 内部目录判定基准：testDir 相对 ESLint 运行目录（绝对路径抛错，家族前提约束）；
 // buildToolDir 相对包根（与依赖三级链同名同语义）。
 const options = context.options[0] || {};
 const cwd = context.cwd || context.getCwd();
 const testDirInput = options.testDir || DEFAULT_TEST_DIR;
 if (path.isAbsolute(testDirInput)) {
 throw new Error(`testDir 必须是相对仓库根的相对路径（前提约束：ESLint 运行目录必须在仓库根），不接受绝对路径：${testDirInput}`);
 }
 const internalDirs = [
 { kind: '测试', dir: path.resolve(cwd, testDirInput) },
 ...(options.buildToolDir ? [{ kind: '构建工具', dir: path.resolve(packageDir, options.buildToolDir) }] : []),
 ];
 const hitsInternal = (absolute) => internalDirs.find(({ dir }) => absolute === dir || absolute.startsWith(`${dir}${path.sep}`));
 for (const { face, target } of f_faceTargets(manifest)) {
 if (typeof target !== 'string' || !target || target.startsWith('!')) continue;
 if (target.includes('*')) {
 // 通配模式以探测文件近似判定：npm exports 的 '*' 是跨斜杠任意序列，折算 glob '**'。
 const pattern = target.replace(/^\.\//, '').replaceAll('*', '**');
 for (const { kind, dir } of internalDirs) {
 const probe = `${path.relative(packageDir, dir).split(path.sep).join('/')}/probe.mjs`;
 const prefix = path.resolve(packageDir, target.split('*')[0].replace(/^\.\//, ''));
 if (i_minimatch(probe, pattern) || prefix === dir || prefix.startsWith(`${dir}${path.sep}`)) {
 context.report({ node, messageId: 'patternTargetInternal', data: { face, target, kind } });
 break;
 }
 }
 continue;
 }
 const hit = hitsInternal(path.resolve(packageDir, target.replace(/^\.\//, '')));
 if (hit && (hit.kind !== '测试' || face.startsWith('bin') || /\.test\.[cm]?js$/.test(target))) {
 context.report({ node, messageId: 'faceTargetInternal', data: { face, target, kind: hit.kind } });
 }
 }
 },
 };
 },
};

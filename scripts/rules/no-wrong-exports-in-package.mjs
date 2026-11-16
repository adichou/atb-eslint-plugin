// atb/no-wrong-exports-in-package — package.json 入口面（bin/main/exports）不得指向测试文件
// 或构建工具目录文件。
// 测试文件不产出对外接口（testDir 是受管测试代码唯一居所，与 no-wrong-access-level 同名
// 同语义）；buildToolDir 是构建期/开发期辅助支撑（与 no-undeclared-dependencies-imports
// 同名同语义）——两者都不是对外交付面，出现在 bin/main/exports 目标上即配置错误：外部将
// 经入口面 import/执行到测试或构建工具代码。
// 目标按字面路径判定；exports 通配模式以探测文件近似判定（模式能命中 testDir/buildToolDir
// 下任意文件即报——模式本身无法枚举，如实声明为近似）。git/URL 类非路径目标不在本规则
//（exports 值恒为包内相对路径，无需特判）。
// 本规则运行在 package.json 上（经 JSON parser 接线，如 eslint-plugin-package-json）；testDir
// 相对 ESLint 运行目录解析（前提约束：运行目录必须在仓库根，绝对路径传入即抛，与家族口径
// 一致），buildToolDir 相对包根（manifest 所在目录）解析；报告落在清单 Program 节点。
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
 for (const [key, value] of Object.entries(manifest.exports || {})) collect(key, value);
 return targets;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: 'package.json 入口面（bin/main/exports）不得指向测试文件（testDir）或构建工具目录（buildToolDir）文件——它们不产出对外接口' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 buildToolDir: { type: 'string' },
 },
 additionalProperties: false,
 }],
 messages: {
 faceTargetInternal: "入口面 {{face}} 的目标 '{{target}}' 指向{{kind}}文件：测试与构建工具代码不产出对外接口，入口面（bin/main/exports）必须指向生产代码",
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
 if (i_minimatch(probe, pattern)) {
 context.report({ node, messageId: 'patternTargetInternal', data: { face, target, kind } });
 break;
 }
 }
 continue;
 }
 const hit = hitsInternal(path.resolve(packageDir, target.replace(/^\.\//, '')));
 if (hit) {
 context.report({ node, messageId: 'faceTargetInternal', data: { face, target, kind: hit.kind } });
 }
 }
 },
 };
 },
};

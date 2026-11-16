// atb/no-undeclared-entry-in-test — 测试三分区入口模型：bin / export / ui。
// 测试文件（*.test.*）必须落在 testDir 下三个分区子目录之一，分区即测试类型声明：
// - bin/：命令业务测试——进程驱动（spawn 家族，node + 脚本）目标必须 ∈ package.json bin
//   声明块的目标集合（命令参数自由，测的就是命令业务）；testDir 内互驱（测试基建 runner）
//   放行；目标静态不可解析 fail-loud 报错。
// - export/：导出 API 业务测试——import 的生产模块必须 ∈ package.json exports/main 声明面
// （面内文件的公开函数与成员即测试入口）；testDir 内互导、node: 内建与依赖包放行；相对
//   说明符解析为受管文件但不在声明面即报。静态边界：解析不到目标（不存在/出根）放行不误报。
// - ui/：用户界面业务测试（按 uiTest 参数启用）——进程驱动必须匹配 uiTest.startup 声明的
//   node 命令（入口文件 + 参数，驱动参数以声明参数为前缀）；startup 的入口文件必须在 bin
//   声明块中声明（自洽校验，配置错每测试文件报告直至修正）。
// 分区外兜底：测试文件不在三个分区目录内（或 ui 分区未启用却出现 ui/ 测试）一律报错——
// 每篇测试必须先回答「测的是哪类业务」。非测试文件（fixtures / 世界装配 / helpers 基建）
// 不受分区约束。
// 入口事实源全部自锚定包根读 manifest（i_entryFacesOf，与死导出/入口面指向核验共享），
// monorepo 各包自查；无手写 entry 清单、无 exceptionFiles 豁免。testDir 与家族同名同语义
//（相对 ESLint 运行目录，绝对路径传入即抛）。静态边界：不追运行时传值；exec 字符串形态
// 仅识别 'node <script> [args…]' 前缀词序列。
import fs from '../../../litenvi-node/scripts/lite-fs.mjs';
import path from 'node:path';
import { i_entryFacesOf, i_evaluateStaticString, i_minimatch, i_projectRootOf } from '../lib/attributions.mjs';

const DEFAULT_TEST_DIR = 'scripts/tests';
const f_DRIVE_METHODS = new Set(['spawn', 'spawnSync', 'exec', 'execFileSync', 'execFile', 'execSync']);
const f_NODE_BASENAMES = new Set(['node', 'node.exe']);
const JS_EXT = /\.(?:js|mjs|cjs)$/;
const TEST_FILE = /\.test\.[cm]?js$/;

// 私有：归一相对路径（posix 分隔符）
function f_rel(from, to) {
 return path.relative(from, to).split(path.sep).join('/');
}

// 私有：相对说明符 → 受管文件路径（补扩展名与 /index.*；不存在返回 null）。
function f_resolveModule(dir, spec) {
 if (!spec.startsWith('.')) return null;
 const base = path.resolve(dir, spec);
 const candidates = JS_EXT.test(spec) ? [base] : [
 `${base}.js`, `${base}.mjs`, `${base}.cjs`,
 path.join(base, 'index.js'), path.join(base, 'index.mjs'), path.join(base, 'index.cjs'),
 ];
 for (const candidate of candidates) {
 if (fs.existsSync(candidate)) return candidate;
 }
 return null;
}

export default {
 meta: {
 type: 'problem',
 docs: { description: '测试三分区入口模型：测试文件必须归入 bin/export/ui 分区，各分区绑定入口纪律（bin 命令驱动 / export 声明面 import / ui 按 startup 命令）' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 uiTest: {
 type: 'object',
 properties: {
 enabled: { type: 'boolean' },
 startup: { type: 'string' },
 },
 additionalProperties: false,
 },
 },
 additionalProperties: false,
 }],
 messages: {
 testOutsidePartitions: "测试文件 '{{file}}' 不在测试分区（bin/export/ui）内：每篇测试必须归入一个分区声明所测业务——bin（命令业务）/ export（导出 API 业务）/ ui（界面业务，按 uiTest 启用）",
 undeclaredEntry: "bin 分区测试的驱动目标 '{{file}}' 不在 package.json bin 声明块：命令业务测试只能经 bin 声明的入口文件驱动",
 unresolvableEntry: "进程驱动的脚本目标无法静态解析，请改为明确路径常量以便入口核验",
 importOffExportFace: "export 分区测试 import 的 '{{file}}' 不在 package.json exports/main 声明面：导出 API 业务测试只能经声明面文件的公开成员测试",
 driveOffStartup: "ui 分区测试的驱动与 uiTest.startup（'{{startup}}'）不符：UI 业务测试必须按 startup 声明的 node 命令（入口文件与参数）驱动",
 configStartupMissing: "uiTest 已启用但未声明 startup：UI 分区启用时必须声明启动命令（入口文件 + 参数，入口文件须在 bin 声明块中声明）",
 startupOffBin: "uiTest.startup 的入口文件 '{{file}}' 不在 package.json bin 声明块：UI 启动命令的入口必须经 bin 声明",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 // testDir 与 no-wrong-access-level 同名同语义（前提约束：ESLint 运行目录必须在仓库根）。
 const cwd = context.cwd || context.getCwd();
 const testDirInput = options.testDir || DEFAULT_TEST_DIR;
 if (path.isAbsolute(testDirInput)) {
 throw new Error(`testDir 必须是相对仓库根的相对路径（前提约束：ESLint 运行目录必须在仓库根），不接受绝对路径：${testDirInput}`);
 }
 const testDir = path.resolve(cwd, testDirInput);
 const filename = path.resolve(context.filename || context.getFilename());
 if (f_rel(testDir, filename).startsWith('../')) return {};
 // 基建文件（非 *.test.*）不受分区约束——它们是测试装置不是测试用例。
 if (!TEST_FILE.test(path.basename(filename))) return {};

 const sourceCode = context.sourceCode || context.getSourceCode();
 // 入口事实源：自锚定包根读 manifest（binFaces 命令目标 / importFaces+patterns 导入面）。
 const projectRoot = i_projectRootOf(filename);
 if (projectRoot === null) return {};
 const { binFaces, importFaces, patterns } = i_entryFacesOf(projectRoot);

 // uiTest：显式传入才接线（enabled 缺省 true，可 false 关闭）；startup 为「入口文件 +
 // 参数」词序列，入口文件须 ∈ bin。未传参数 = 本仓无 UI 面，ui/ 不设区。
 const uiTest = options.uiTest || null;
 const uiEnabled = Boolean(uiTest) && uiTest.enabled !== false;
 const startupWords = uiEnabled && typeof uiTest.startup === 'string'
 ? uiTest.startup.trim().split(/\s+/).filter(Boolean)
 : [];
 const startupFile = startupWords.length ? path.resolve(projectRoot, startupWords[0]) : null;
 const partitions = ['bin', 'export', ...(uiEnabled ? ['ui'] : [])];
 const relTest = f_rel(testDir, filename);
 const partition = relTest.split('/')[0];

 function reportProgram(messageId, data) {
 context.report({ node: sourceCode.ast, messageId, data });
 }

 // 分区外兜底 + uiTest 自洽（配置错每测试文件报告直至修正）。
 if (!partitions.includes(partition)) {
 return {
 Program() {
 reportProgram('testOutsidePartitions', { file: relTest });
 },
 };
 }
 if (uiEnabled) {
 if (!startupFile) {
 return {
 Program() {
 reportProgram('configStartupMissing', {});
 },
 };
 }
 if (!binFaces.has(startupFile)) {
 return {
 Program() {
 reportProgram('startupOffBin', { file: startupWords[0] });
 },
 };
 }
 }

 // 静态求值：spawn 参数——首元素（脚本目标）必须可解析（入口核验对象）；后续参数尽力
 // 全静态（ui 前缀匹配用），含动态参数时返回 words=null（目标核验不受业务数据影响）。
 function f_argvWords(node) {
 if (node.type === 'ArrayExpression') {
 const elements = node.elements.filter(Boolean);
 if (!elements.length) return null;
 const head = i_evaluateStaticString(elements[0], sourceCode, filename);
 if (!head.resolved) return null;
 const words = [String(head.value)];
 for (const element of elements.slice(1)) {
 const evaluated = i_evaluateStaticString(element, sourceCode, filename);
 if (!evaluated.resolved) return { head: String(head.value), words: null };
 words.push(String(evaluated.value));
 }
 return { head: String(head.value), words };
 }
 const evaluated = i_evaluateStaticString(node, sourceCode, filename);
 if (!evaluated.resolved) return null;
 const words = String(evaluated.value).trim().split(/\s+/);
 return { head: words[0], words };
 }

 function f_checkDrive(node) {
 if (node.callee.type !== 'MemberExpression' || node.callee.computed) return;
 if (!f_DRIVE_METHODS.has(node.callee.property.name)) return;
 const execEval = node.arguments.length ? i_evaluateStaticString(node.arguments[0], sourceCode, filename): { resolved: false };
 const isNode = execEval.resolved && f_NODE_BASENAMES.has(path.posix.basename(String(execEval.value)));
 if (!isNode) return;
 const argv = node.arguments[1] ? f_argvWords(node.arguments[1]) : null;
 if (!argv || !argv.head) {
 context.report({ node: node.arguments[1] ?? node, messageId: 'unresolvableEntry' });
 return;
 }
 const targetAbs = path.isAbsolute(argv.head) ? argv.head : path.resolve(path.dirname(filename), argv.head);
 if (partition === 'bin') {
 // bin 分区：目标 ∈ bin 声明块；testDir 内互驱（测试基建 runner）放行。
 if (binFaces.has(targetAbs)) return;
 if (!f_rel(testDir, targetAbs).startsWith('../')) return;
 context.report({ node: node.arguments[1], messageId: 'undeclaredEntry', data: { file: argv.head } });
 return;
 }
 // ui 分区：驱动词序列须以 startup 声明（入口文件 + 参数）为前缀；参数含动态数据时
 // 只核入口文件匹配（前缀参数段无法静态比对，如实放行）。
 const declaredWords = startupWords.map((word, index) => (index === 0 ? path.resolve(projectRoot, word) : word));
 if (targetAbs !== declaredWords[0]) {
 context.report({ node: node.arguments[1], messageId: 'driveOffStartup', data: { startup: uiTest.startup } });
 return;
 }
 if (argv.words && argv.words.length < declaredWords.length) {
 context.report({ node: node.arguments[1], messageId: 'driveOffStartup', data: { startup: uiTest.startup } });
 return;
 }
 if (argv.words && !declaredWords.slice(1).every((word, index) => argv.words[index + 1] === word)) {
 context.report({ node: node.arguments[1], messageId: 'driveOffStartup', data: { startup: uiTest.startup } });
 }
 }

 function f_checkImport(node, specifier) {
 if (!specifier || !specifier.startsWith('.')) return; // 裸包名与 node: 放行
 const target = f_resolveModule(path.dirname(filename), specifier);
 if (!target) return; // 解析不到受管目标（不存在/出根）不误报
 if (!f_rel(testDir, target).startsWith('../')) return; // testDir 内互导放行
 const relRoot = f_rel(projectRoot, target);
 if (importFaces.has(target) || patterns.some((pattern) => i_minimatch(relRoot, pattern))) return;
 context.report({ node, messageId: 'importOffExportFace', data: { file: relRoot } });
 }

 const visitors = {};
 if (partition === 'bin' || partition === 'ui') {
 visitors.CallExpression = f_checkDrive;
 }
 if (partition === 'export') {
 visitors.ImportDeclaration = (node) => f_checkImport(node, node.source.value);
 visitors.ExportNamedDeclaration = (node) => { if (node.source) f_checkImport(node, node.source.value); };
 visitors.ExportAllDeclaration = (node) => f_checkImport(node, node.source.value);
 visitors.ImportExpression = (node) => {
 const evaluated = i_evaluateStaticString(node.source, sourceCode, filename);
 if (evaluated.resolved) f_checkImport(node, evaluated.value);
 };
 }
 return visitors;
 },
};

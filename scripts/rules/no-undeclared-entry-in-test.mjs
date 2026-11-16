// atb/no-undeclared-entry-in-test — 测试代码的业务入口驱动白名单。
// testDir（测试代码目录，与 no-wrong-access-level 同名同语义：相对 ESLint 运行目录，绝对
// 路径传入即抛）内的进程驱动调用（spawn/spawnSync/exec 家族，可执行文件为 node）拉起脚本
// 时，被驱动目标归一为相对根目录路径后判定：落在 testDir 内（测试基建互驱）放行；落在
// testDir 外（生产区）必须命中 entry 清单——测试只能从登记的业务入口（CLI 子命令 / 服务
// 启动命令的入口文件）驱动生产代码，不得直启非入口实现文件（如 server.mjs）。
// web-page：提供 web 服务时的启动一致性声明——startup 必须 ∈ entry（配置自洽，违者每文件
// 报错直至配置修正）；index 为首跳路径声明，须以 '/' 开头。dev skill 的入口发现以本
// 声明为机器可执行的第一级来源（无此配置时按文档回退，见 skills/litenvi-dev）。
// 驱动目标静态不可解析（变量拼接、计算属性）按口径报错防盲区绕行；可解析常量（模块级
// path.join 字面量）按求值结果判定。静态边界（如实声明）：不追运行时传值与 shell 字符串
// 内的多段命令（exec 形态仅识别 'node <script>' 前缀形态）。无 exceptionFiles 豁免机制：
// 机制性夹具的动态目标同样如实报告，不设文件级豁免通道。
import path from 'node:path';
import { i_evaluateStaticString } from '../lib/attributions.mjs';

const DEFAULT_TEST_DIR = 'scripts/tests';

const f_DRIVE_METHODS = new Set(['spawn', 'spawnSync', 'exec', 'execFileSync', 'execFile', 'execSync']);
const f_NODE_BASENAMES = new Set(['node', 'node.exe']);

// 私有：归一相对路径（posix 分隔符，去 ./ 前缀歧义）
function f_rel(from, to) {
 return path.relative(from, to).split(path.sep).join('/');
}

export default {
 meta: {
 type: 'problem',
 docs: { description: '测试代码的业务入口驱动白名单：node 脚本驱动目标须命中 entry 清单或为测试基建' },
 schema: [{
 type: 'object',
 properties: {
 testDir: { type: 'string' },
 entry: { type: 'array', items: { type: 'string' } },
 webPage: {
 type: 'object',
 properties: {
 startup: { type: 'string' },
 index: { type: 'string' },
 },
 additionalProperties: false,
 },
 },
 additionalProperties: false,
 }],
 messages: {
 undeclaredEntry: "'{{file}}' 不在业务入口清单（entry）：测试只能经登记的业务入口（CLI 子命令 / 服务启动）驱动生产代码，不得直启实现文件；如属新入口请先在 eslint.config.mjs 的 entry 登记",
 unresolvableEntry: "进程驱动的脚本目标无法静态解析，请改为明确路径常量以便入口白名单检查",
 configStartup: "web-page.startup '{{startup}}' 不在 entry 清单内：提供 web 服务时启动入口必须经 entry 登记（配置自洽）",
 configIndexPage: "web-page.index '{{page}}' 须以 '/' 开头的 URL 路径（缺省 '/'）",
 },
 },

 create(context) {
 const options = context.options[0] || {};
 // testDir 与 no-wrong-access-level 同名同语义（前提约束：ESLint 运行目录必须在仓库根，
 // 绝对路径传入即抛）。
 const cwd = context.cwd || context.getCwd();
 const testDirInput = options.testDir || DEFAULT_TEST_DIR;
 if (path.isAbsolute(testDirInput)) {
 throw new Error(`testDir 必须是相对仓库根的相对路径（前提约束：ESLint 运行目录必须在仓库根），不接受绝对路径：${testDirInput}`);
 }
 const testDir = path.resolve(cwd, testDirInput);
 const entry = new Set((options.entry || []).map((rel) => path.posix.normalize(rel)));
 const webPage = options.webPage || null;
 const filename = path.resolve(context.filename || context.getFilename());
 // testDir 之外的文件不受检（由其所属仓库自查）。无 exceptionFiles 豁免机制：机制性夹具
 // 的动态目标同样如实报告。
 if (f_rel(testDir, filename).startsWith('../')) return {};
 const sourceCode = context.sourceCode || context.getSourceCode();

 // 配置自洽：startup ∈ entry、index 形态。每文件报告直至配置修正（配置 bug 属全局）。
 if (webPage) {
 if (webPage.startup && !entry.has(path.posix.normalize(webPage.startup))) {
 context.report({ node: sourceCode.ast, messageId: 'configStartup', data: { startup: webPage.startup } });
 }
 const page = webPage.index;
 if (page && !page.startsWith('/')) {
 context.report({ node: sourceCode.ast, messageId: 'configIndexPage', data: { page } });
 }
 }

 // node 脚本目标 → 相对根目录路径：静态可解析才参与判定（entry 相对根目录，根 = eslint 运行根）。
 function f_scriptTarget(argNode) {
 const evaluated = i_evaluateStaticString(argNode, sourceCode, filename);
 if (!evaluated.resolved) return { f_unresolved: true };
 const raw = evaluated.value;
 const abs = path.isAbsolute(raw) ? raw: path.resolve(path.dirname(filename), raw);
 return { f_rel: f_rel(process.cwd(), abs) };
 }

 // 驱动调用判定：spawn 家族 + 可执行文件为 node + 第二参（数组首元素或字符串）为脚本。
 function f_checkDrive(node) {
 if (node.callee.type !== 'MemberExpression' || node.callee.computed) return;
 if (!f_DRIVE_METHODS.has(node.callee.property.name)) return;
 const execEval = node.arguments.length ? i_evaluateStaticString(node.arguments[0], sourceCode, filename): { resolved: false };
 const isNode = execEval.resolved && f_NODE_BASENAMES.has(path.posix.basename(String(execEval.value)));
 if (!isNode) return;
 const argv1 = node.arguments[1];
 if (!argv1) return;
 let targetNode = null;
 if (argv1.type === 'ArrayExpression') targetNode = argv1.elements[0];
 else if (['string', 'TemplateLiteral'].includes(argv1.type) || argv1.type === 'Identifier') targetNode = argv1;
 if (!targetNode) {
 context.report({ node: argv1 ?? node, messageId: 'unresolvableEntry' });
 return;
 }
 const target = f_scriptTarget(targetNode, filename);
 if (target.f_unresolved) {
 context.report({ node: targetNode, messageId: 'unresolvableEntry' });
 return;
 }
 // 测试基建互驱放行（目标落在 testDir 内）；生产区目标必须命中 entry。
 if (target.f_rel.startsWith('../') || !f_rel(testDir, path.resolve(process.cwd(), target.f_rel)).startsWith('../')) return;
 if (!entry.has(path.posix.normalize(target.f_rel))) {
 context.report({ node: targetNode, messageId: 'undeclaredEntry', data: { file: target.f_rel } });
 }
 }

 return {
 CallExpression(node) {
 f_checkDrive(node);
 },
 };
 },
};

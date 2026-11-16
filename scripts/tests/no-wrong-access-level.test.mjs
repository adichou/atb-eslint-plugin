// 使用官方 RuleTester 执行真实规则；受检代码直接传字符串，无需文件系统或命令模拟。
// 测试导出面 t_ 要求依赖 filename 与 testDir 的目录关系判定测试身份（本规则不设路径门，
// 无 scanPath），因此每个用例都显式传 filename 与 testDir；testDir 一律相对仓库根的相对
// 路径（前提约束：ESLint 运行目录必须在仓库根），用例从仓库根运行即与运行目录无关。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import wrongAccessLevel from 'atb-eslint-plugin/rules/no-wrong-access-level.mjs';

// 将 RuleTester 的用例登记到 node:test，让失败和用例数量进入项目统一报告。
RuleTester.describe = describe;
RuleTester.it = it;

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
// 生产文件与测试文件样本：测试文件落在 testDir 目录内，生产文件在目录外；faceFile 为本仓
// 真实对外导入面文件（package.json exports './config.mjs' → scripts/config.mjs）——入口面
// 核验按真实 manifest 判定，RuleTester 只 lint 传入 code。
const prodFile = path.join(repoRoot, 'src/flow.mjs');
const testFile = path.join(repoRoot, 'scripts/tests/suite.test.mjs');
const faceFile = path.join(repoRoot, 'scripts/config.mjs');
// 前提约束：testDir 一律相对仓库根的相对路径（ESLint 运行目录必须在仓库根）。
const options = [{ testDir: 'scripts/tests' }];

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

/** 场景：f_ 分级（非导出方法须 f_、非导出绑定禁级别前缀）、测试文件导出面 t_ 要求与返回面相干。 */
tester.run('no-wrong-access-level', wrongAccessLevel, {
  valid: [
    // 场景：入口面核验（增强）——对外导入面文件（manifest exports 目标）的公开导出放行。
    { name: '入口面公开导出放行', filename: faceFile, code: 'export function run() {}\nexport const data = 1;\n', options },
    // 场景：入口面核验——导入面文件的 t_ 导出放行（如 litenvi 面上导出测试专用接口）。
    { name: '入口面 t_ 导出放行', filename: faceFile, code: 'export function t_tool() {}\n', options },
    // 场景：入口面核验——非入口面文件的 i_ 导出放行（i_ 即包内协作，本就只在内部消费）。
    { name: '非入口面 i_ 导出放行', filename: prodFile, code: 'export const i_data = 1;\n', options },
    // 场景：入口面核验——default 无名字面不参与；f_ 导出移交 no-out-of-level-access 不双报。
    { name: 'default 导出不参与入口面核验', filename: prodFile, code: 'export default function run() {}\n', options },
    { name: 'f_ 导出移交不参与入口面核验', filename: prodFile, code: 'export function f_run() {}\n', options },
    // 场景：生产文件非导出方法按 f_ 分级放行（函数声明与函数值绑定两形态）。
    { name: '生产文件非导出函数 f_ 前缀放行', filename: prodFile, code: 'function f_run() {}\nconst f_helper = () => {};\n', options },
    // 场景：测试文件导出面放行 t_——函数、数据与函数值绑定三形态。
    {
      name: '测试文件 t_ 导出放行',
      filename: testFile,
      code: 'export function t_run() {}\nexport const t_data = 1;\nexport const t_case = () => {};\n',
      options,
    },
    // 场景：测试文件名单导出以面名核验——本地 t_ 名与 t_ 面名一致即放行。
    { name: '测试文件名单导出 t_ 面名放行', filename: testFile, code: 'function t_run() {}\nexport { t_run };\n', options },
    // 场景：名单别名导出看面名（exported 名），面名为 t_ 即放行。
    { name: '测试文件别名导出 t_ 面名放行', filename: testFile, code: 'function t_run() {}\nexport { t_run as t_case };\n', options },
    // 场景：re-export（export-from）同样按面名核验，t_ 面名放行。
    { name: '测试文件 re-export t_ 面名放行', filename: testFile, code: "export { t_thing } from './dep.mjs';\n", options },
    // 场景：默认导出无名字面，不参与 t_ 要求（消费方自带名，前缀体系不适用）。
    { name: '测试文件默认导出不参与', filename: testFile, code: 'export default function run() {}\n', options },
    { name: '测试文件默认导出对象不参与', filename: testFile, code: 'export default {};\n', options },
    // 场景：测试目录同样受 f_ 分级——非导出函数带 f_ 前缀放行。
    { name: '测试文件非导出函数 f_ 前缀放行', filename: testFile, code: 'function f_run() {}\n', options },
    // 场景：相对 testDir 按运行目录解析——相对文件名与相对 testDir 同基准，目录内即测试身份。
    {
      name: '相对 testDir 按运行目录解析命中测试身份',
      filename: 'scripts/tests/relative.test.mjs',
      code: 'export const t_ok = 1;\n',
      options: [{ testDir: 'scripts/tests' }],
    },
    // 场景：testDir 覆盖缺省——自定义目录识别测试身份，命中目录按测试导出面核验。
    {
      name: 'testDir 覆盖后自定义目录按测试身份放行',
      filename: path.join(repoRoot, 'test/helper.test.mjs'),
      code: 'export function t_run() {}\n',
      options: [{ testDir: 'test' }],
    },
    // 场景：testDir 覆盖后缺省目录不再识别为测试——导出面回到生产口径（i_ 导出放行）。
    {
      name: 'testDir 覆盖后缺省目录按生产导出面放行',
      filename: testFile,
      code: 'export const i_data = 1;\n',
      options: [{ testDir: 'test' }],
    },
    // ── 返回面相干：显式前缀键级别 ∈ {函数级别, f_}，无前缀键随句柄不核（读法 B）──
    // 场景：公开工厂返回公开成员与 f_ 内部细节成员，放行。
    {
      name: '公开工厂返回公开与 f_ 键放行',
      filename: prodFile,
      code: 'export default { command() { return { query() {}, f_cache: 1 }; } };\n',
      options,
    },
    // 场景：i_ 工厂返回 i_ 成员与 f_ 内部细节成员，放行。
    {
      name: 'i_ 工厂返回 i_ 与 f_ 键放行',
      filename: prodFile,
      code: 'export function i_createConn() { return { i_query() {}, f_cache: {} }; }\n',
      options,
    },
    // 场景：t_ 工厂返回 t_ 成员与 f_ 内部细节成员，放行（入口面文件的 t_ 导出合法）。
    {
      name: 't_ 工厂返回 t_ 与 f_ 键放行',
      filename: faceFile,
      code: 'export function t_buildWorld() { return { t_probe() {}, f_cache: 1 }; }\n',
      options,
    },
    // 场景：抽屉函数按 f_ 参与，返回 f_ 键放行。
    { name: '抽屉函数返回 f_ 键放行', filename: prodFile, code: 'function f_outer() { return { f_data: 1 }; }\n', options },
    // 场景：公开函数返回树内嵌套对象的公开数据键，放行（入口面文件的公开导出合法）。
    {
      name: '公开函数返回嵌套树公开键放行',
      filename: faceFile,
      code: "export function build() { return { conn: { host: 'x' } }; }\n",
      options,
    },
    // 场景：PascalCase 键是框架协议分派名（ESLint visitor 等），不参与返回面相干。
    {
      name: 'PascalCase 协议键豁免',
      filename: prodFile,
      code: 'function f_make() { return { ImportDeclaration(node) {} }; }\n',
      options,
    },
    // 场景：计算键静态不可知，跳过不报。
    {
      name: '返回树计算键跳过',
      filename: prodFile,
      code: 'function f_outer() { return { [`${p}x`]: 1 }; }\n',
      options,
    },
    // 场景：引用返回不追（不执行函数、不做数据流）。
    {
      name: '引用返回不查',
      filename: prodFile,
      code: 'const f_cfg = { run() {} };\nfunction f_get() { return f_cfg; }\n',
      options,
    },
    // 场景：匿名箭头无名字按无前缀=公开——回调与无前缀绑定的箭头返回公开数据键放行。
    {
      name: '匿名箭头按公开参与放行',
      filename: prodFile,
      code: "test('x', async () => { const scenario = async () => { return { again: 1 }; }; await scenario(); });\n",
      options,
    },
    // 场景：箭头简洁体（隐式 return）同样进入返回面语境——公开箭头返回公开与 f_ 键放行。
    {
      name: '箭头简洁体隐式返回面放行',
      filename: prodFile,
      code: 'const f_make = () => ({ query() {}, f_cache: 1 });\n',
      options,
    },
    // 场景：读法 B——无前缀键不是级别声明，f_ 函数返回 { query() {} } 随句柄放行。
    { name: 'f_ 函数返回无前缀键放行', filename: prodFile, code: 'function f_outer() { return { query() {} }; }\n', options },
    // 场景：i_ 工厂返回无前缀成员随句柄放行（受众封顶在生产包内）。
    { name: 'i_ 工厂返回无前缀键放行', filename: prodFile, code: 'export function i_createConn() { return { query() {} }; }\n', options },
    // ── 注释对账（原 no-wrong-access-comment 并入）：级别标注与前缀/导出一致放行 ──
    // 场景：紧邻注释的标注与方法级别相符——f_/私有、i_/内部、导出无前缀/外部（入口面文件的公开导出）。
    { name: '注释对账一致放行', filename: faceFile, code: '// 私有：仅本文件使用\nfunction f_run() {}\n// 内部：包内协作\nexport function i_tool() {}\n// 外部：公共 API\nexport function run() {}\n', options },
    // 场景：无注释不报（缺失不报：级别由使用方自行声明，只对账已声明者）。
    { name: '注释缺失不报', filename: prodFile, code: 'function f_run() {}\nexport function i_tool() {}\n', options },
    // 场景：注释与定义之间隔空行——不构成标注，正文偶然级别词不参与对账。
    { name: '隔行注释不构成标注', filename: prodFile, code: '// 外部：某段说明\n\nfunction f_run() {}\n', options },
    // 场景：块注释（* 前缀行）内的标注同样参与对账，一致放行。
    { name: '块注释标注一致放行', filename: prodFile, code: '/**\n * 私有：文件内工具\n */\nfunction f_util() {}\n', options },
    // 场景：t_ 工厂返回无前缀键随句柄放行——读法 B 对四种句柄级别（公开/i_/t_/f_）一致生效。
    { name: 't_ 工厂返回无前缀键放行', filename: testFile, code: 'export function t_buildWorld() { return { probe() {} }; }\n', options },
    // 场景：测试文件 t_ 句柄挂 i_ 契约键放行——mock 豁免只看文件身份，不看句柄级别。
    { name: '测试文件 t_ 句柄 i_ 契约键放行', filename: testFile, code: 'export function t_buildCmd() { return { i_runSync() {} }; }\n', options },
    // 场景：测试文件返回树显式 i_ 契约键——mock 实现生产协作接口的唯一合法拼写，放行。
    { name: '测试文件返回树 i_ 契约键放行', filename: testFile, code: 'const f_npmCmd = (status) => ({ i_runSync: () => ({ status }), i_run() {} });\n', options },
    { name: '测试文件命名工厂 i_ 契约键放行', filename: testFile, code: 'function f_makeCmd() { return { i_runSync() {} }; }\n', options },
  ],
  invalid: [
    // 场景：测试文件无前缀导出即公开接口，函数与数据两形态各报面名。
    {
      name: '测试文件无前缀函数导出报告',
      filename: testFile,
      code: 'export function run() {}\n',
      options,
      output: null,
      errors: [{ messageId: 'testExportLevel', data: { name: 'run' }, type: 'Identifier' }],
    },
    {
      name: '测试文件无前缀数据导出报告',
      filename: testFile,
      code: 'export const data = 1;\n',
      options,
      output: null,
      errors: [{ messageId: 'testExportLevel', data: { name: 'data' }, type: 'Identifier' }],
    },
    {
      name: '测试文件无前缀函数值导出报告',
      filename: testFile,
      code: 'export const run = () => {};\n',
      options,
      output: null,
      errors: [{ messageId: 'testExportLevel', data: { name: 'run' }, type: 'Identifier' }],
    },
    // 场景：名单导出按面名报告，本地绑定已入导出面不再重复报 f_ 缺失。
    {
      name: '测试文件名单导出无前缀面名报告',
      filename: testFile,
      code: 'function helper() {}\nexport { helper };\n',
      options,
      output: null,
      errors: [{ messageId: 'testExportLevel', data: { name: 'helper' }, type: 'Identifier' }],
    },
    // 场景：别名导出报告面名（exported 名），不误报 t_ 本地名。
    {
      name: '测试文件别名导出无前缀面名报告',
      filename: testFile,
      code: 'function t_helper() {}\nexport { t_helper as api };\n',
      options,
      output: null,
      errors: [{ messageId: 'testExportLevel', data: { name: 'api' }, type: 'Identifier' }],
    },
    // 场景：i_ 导出同样不是 t_——测试文件导出面只放行 t_。
    {
      name: '测试文件 i_ 导出报告',
      filename: testFile,
      code: 'export const i_data = 1;\n',
      options,
      output: null,
      errors: [{ messageId: 'testExportLevel', data: { name: 'i_data' }, type: 'Identifier' }],
    },
    // 场景：re-export 的无前缀面名同样报告。
    {
      name: '测试文件 re-export 无前缀面名报告',
      filename: testFile,
      code: "export { thing } from './dep.mjs';\n",
      options,
      output: null,
      errors: [{ messageId: 'testExportLevel', data: { name: 'thing' }, type: 'Identifier' }],
    },
    // 场景：同一文件多个非 t_ 导出分别报告，不能只检出第一处。
    {
      name: '测试文件多导出分别报告',
      filename: testFile,
      code: 'export function run() {}\nexport const data = 1;\n',
      options,
      output: null,
      errors: [
        { messageId: 'testExportLevel', data: { name: 'run' }, type: 'Identifier' },
        { messageId: 'testExportLevel', data: { name: 'data' }, type: 'Identifier' },
      ],
    },
    // 场景：f_ 分级回归——生产与测试文件的非导出函数同样要求 f_。
    {
      name: '生产文件非导出函数缺 f_ 报告',
      filename: prodFile,
      code: 'function run() {}\n',
      options,
      output: null,
      errors: [{ messageId: 'notFilePrivate', data: { name: 'run' }, type: 'Identifier' }],
    },
    {
      name: '测试文件非导出函数缺 f_ 报告',
      filename: testFile,
      code: 'function run() {}\n',
      options,
      output: null,
      errors: [{ messageId: 'notFilePrivate', data: { name: 'run' }, type: 'Identifier' }],
    },
    // 场景：非导出绑定不得携带 t_ 前缀（t_ 只属于导出面）。
    {
      name: '测试文件非导出绑定 t_ 前缀报告',
      filename: testFile,
      code: 'const t_data = 1;\n',
      options,
      output: null,
      errors: [{ messageId: 'wrongLocalLevel', data: { name: 't_data', prefix: 't' }, type: 'Identifier' }],
    },
    // ── 返回面相干 invalid：显式牌子与句柄受众不符即假牌子（读法 B：无前缀键不核）──
    // 场景：越狱形态——公开工厂把 t_ 方法藏进返回对象，声明侧即报（访问侧看不见返回值）。
    {
      name: '公开工厂返回 t_ 方法报告',
      filename: prodFile,
      code: 'export default { command() { return { t_reset() {} }; } };\n',
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 't_reset', memberLevel: 't_', fnLevel: '公开' },
        type: 'Identifier',
      }],
    },
    // 场景：i_ 工厂的句柄只到生产手里，藏 t_ 成员即漏。
    {
      name: 'i_ 工厂返回 t_ 键报告',
      filename: prodFile,
      code: 'export function i_createConn() { return { t_probe() {} }; }\n',
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 't_probe', memberLevel: 't_', fnLevel: 'i_' },
        type: 'Identifier',
      }],
    },
    // 场景：t_ 工厂的句柄只到测试手里，i_ 成员是假牌子（入口面文件的 t_ 导出合法）。
    {
      name: 't_ 工厂返回 i_ 键报告',
      filename: faceFile,
      code: 'export function t_buildWorld() { return { i_probe() {} }; }\n',
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 'i_probe', memberLevel: 'i_', fnLevel: 't_' },
        type: 'Identifier',
      }],
    },
    // 场景：i_ 豁免只在测试文件——公开句柄挂 i_ 键仍越权（外部消费方违反 i_ 受众）。
    {
      name: '公开句柄 i_ 键报告',
      filename: faceFile,
      code: 'export function build() { return { i_probe() {} }; }\n',
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 'i_probe', memberLevel: 'i_', fnLevel: '公开' },
        type: 'Identifier',
      }],
    },
    // 场景：测试文件豁免只限 i_——t_ 键注入生产即越权，匿名箭头句柄照报。
    {
      name: '测试文件匿名箭头 t_ 键报告',
      filename: testFile,
      code: "test('x', () => { return { t_x: 1 }; });\n",
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 't_x', memberLevel: 't_', fnLevel: '公开' },
        type: 'Identifier',
      }],
    },
    // 场景：数据键同样参与（变量也算），嵌套树深层照查（入口面公开导出合法）。
    {
      name: '公开函数返回嵌套树 t_ 数据键报告',
      filename: faceFile,
      code: 'export function build() { return { conn: { t_secret: 1 } }; }\n',
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 't_secret', memberLevel: 't_', fnLevel: '公开' },
        type: 'Identifier',
      }],
    },
    // 场景：返回树里的内层函数换用自己的级别（抽屉 f_），其返回面再核（入口面公开导出合法）。
    {
      name: '返回树内层函数返回 t_ 键报告',
      filename: faceFile,
      code: 'export function build() { return { make() { return { t_x: 1 }; } }; }\n',
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 't_x', memberLevel: 't_', fnLevel: 'f_' },
        type: 'Identifier',
      }],
    },
    // ── 入口面核验（增强）invalid：公开/t_ 具名导出只属于对外导入面文件 ──
    // 场景：非入口面文件的公开具名导出——挂在内部文件上的公开面外部够不着、内部又不该用。
    {
      name: '非入口面公开具名导出报告',
      filename: prodFile,
      code: 'export function run() {}\nexport const data = 1;\n',
      options,
      output: null,
      errors: [
        { messageId: 'publicExportOffFace', data: { name: 'run', kind: ' 公开' }, type: 'Identifier' },
        { messageId: 'publicExportOffFace', data: { name: 'data', kind: ' 公开' }, type: 'Identifier' },
      ],
    },
    // 场景：非入口面文件的 t_ 具名导出同样错位（t_ 受众在包外，包外只能 import 入口面文件）。
    {
      name: '非入口面 t_ 具名导出报告',
      filename: prodFile,
      code: 'export const t_tool = 1;\n',
      options,
      output: null,
      errors: [{
        messageId: 'publicExportOffFace',
        data: { name: 't_tool', kind: ' t_' },
        type: 'Identifier',
      }],
    },
    // ── 注释对账（原 no-wrong-access-comment 并入）invalid：标注与前缀/导出矛盾 ──
    // 场景：f_ 方法标注「外部」——与前缀矛盾。
    {
      name: 'f_ 方法标注外部报告',
      filename: prodFile,
      code: '// 外部：公共入口\nfunction f_run() {}\n',
      options,
      output: null,
      errors: [{
        messageId: 'methodCommentConflict',
        data: { name: 'f_run', found: '外部', expected: '私有', reason: '与方法名前缀不符，f_ 方法只能标注 私有' },
        type: 'Identifier',
      }],
    },
    // 场景：无前缀导出方法标注「私有」——导出面只允许 内部/外部。
    {
      name: '导出方法标注私有报告',
      filename: faceFile,
      code: '// 私有：文件内使用\nexport function run() {}\n',
      options,
      output: null,
      errors: [{
        messageId: 'methodCommentConflict',
        data: { name: 'run', found: '私有', expected: '内部／外部', reason: '无前缀方法已对外导出，不得标注私有/测试专用' },
        type: 'Identifier',
      }],
    },
    // 场景：对象属性方法的标注同样对账——i_ 键标「测试专用」矛盾。
    {
      name: 'i_ 方法标注测试专用报告',
      filename: prodFile,
      code: 'const actions = {\n  // 测试专用：测试注入\n  i_reset() {},\n};\nexport const i_run = actions;\n',
      options,
      output: null,
      errors: [{
        messageId: 'methodCommentConflict',
        data: { name: 'i_reset', found: '测试专用', expected: '内部', reason: '与方法名前缀不符，i_ 方法只能标注 内部' },
        type: 'Identifier',
      }],
    },
    // 场景：匿名箭头公开化不放松 i_/t_ 禁令——简洁体隐式返回面同样核。
    {
      name: '匿名箭头简洁体返回 t_ 键报告',
      filename: prodFile,
      code: 'const f_make = () => ({ t_reset() {} });\n',
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 't_reset', memberLevel: 't_', fnLevel: '公开' },
        type: 'Identifier',
      }],
    },
    // 场景：显式 return 的箭头同一口径。
    {
      name: '匿名箭头显式返回 t_ 键报告',
      filename: prodFile,
      code: "test('x', () => { return { t_x: 1 }; });\n",
      options,
      output: null,
      errors: [{
        messageId: 'returnLevelExceed',
        data: { name: 't_x', memberLevel: 't_', fnLevel: '公开' },
        type: 'Identifier',
      }],
    },
  ],
});

// 前提约束（fail-loud）：testDir 不支持绝对路径——传入即抛，防运行目录漂移静默失效。
it('no-wrong-access-level 绝对路径 testDir 抛错', () => {
  assert.throws(
    () => wrongAccessLevel.create({
      options: [{ testDir: '/absolute/tests' }],
      cwd: repoRoot,
      filename: prodFile,
    }),
    /相对仓库根的相对路径/,
    '绝对 testDir 应在 create 阶段抛错',
  );
});

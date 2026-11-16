// 使用官方 RuleTester 执行真实规则；受检代码直接传字符串，无需文件系统或命令模拟。
// 覆盖两块：导出面分工（测试文件导出面移交 no-wrong-access-level；生产禁 f_ 导出与 t_ 公开
// 别名）与访问面矩阵（f_ 跨文件 / i_ 测试触达 / t_ 生产消费 / 模块对象·解构·别名转存·转调
// 包装的归因传播 / 包名自引用 / 依赖包与 node: 不解释前缀 / 返回值不传播身份与不可知跳过的
// 静态边界）。规则自锚定项目根（受检文件向上找最近 package.json），用例给绝对 filename 与
// 相对 testDir（前提约束：ESLint 运行目录必须在仓库根，testDir 不支持绝对路径）；相对导入
// 目标不必真实存在（归因是纯路径解析，不做磁盘模块解析）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import outOfLevelAccess from 'atb-eslint-plugin/rules/no-out-of-level-access.mjs';

// 将 RuleTester 的用例登记到 node:test，让失败和用例数量进入项目统一报告。
RuleTester.describe = describe;
RuleTester.it = it;

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const prodFile = path.join(repoRoot, 'src/flow.mjs');
const testFile = path.join(repoRoot, 'scripts/tests/suite.test.mjs');
// 前提约束：testDir 一律相对仓库根的相对路径（ESLint 运行目录必须在仓库根）。
const options = [{ testDir: 'scripts/tests' }];

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

/** 场景：导出面分工与访问面矩阵。 */
tester.run('no-out-of-level-access', outOfLevelAccess, {
  valid: [
    // ── 导出面分工 ──
    // 场景：测试文件导出面的 i_/f_/无前缀均移交 no-wrong-access-level（testExportLevel 口径），
    // 本规则跳过避免同面双报。
    { name: '测试文件导出面 i_ 移交不双报', filename: testFile, code: 'export const i_x = 1;\n', options },
    { name: '测试文件导出面 f_ 移交不双报', filename: testFile, code: 'export function f_run() {}\n', options },
    { name: '测试文件导出面无前缀移交不双报', filename: testFile, code: 'export const plain = 1;\n', options },
    // 场景：测试文件 t_ 导出本就是要求形态，放行。
    { name: '测试文件 t_ 导出放行', filename: testFile, code: 'export function t_run() {}\n', options },
    // 场景：生产文件导出 i_（包内协作级别）合法；t_ 原名导出放行（禁令只针对公开别名）。
    { name: '生产文件 i_ 导出放行', filename: prodFile, code: 'export const i_x = 1;\n', options },
    { name: '生产文件 t_ 原名导出放行', filename: prodFile, code: 'const t_x = 1;\nexport { t_x };\n', options },
    // ── 访问面：f_ 跨文件 ──
    // 场景：同文件直接调用不涉导入，f_ 的检查机制（导入与模块对象访问）无从触发。
    { name: '同文件直接调用 f_ 放行', filename: prodFile, code: 'function f_run() {}\nf_run();\n', options },
    // ── 访问面：i_ 生产协作放行、t_ 测试放行 ──
    {
      name: '生产文件导入 i_ 成员放行',
      filename: prodFile,
      code: "import { i_run } from '../helper.mjs';\ni_run();\n",
      options,
    },
    {
      name: '测试文件导入 t_ 成员放行',
      filename: testFile,
      code: "import { t_run } from '../helper.mjs';\nt_run();\n",
      options,
    },
    // ── 依赖包与 node: 内建：f_/i_ 前缀不解释（由其所属项目自查）；t_ 名例外，见 invalid ──
    {
      name: '依赖包的 f_/i_ 名称不解释',
      filename: prodFile,
      code: "import { f_thing, i_tool } from 'some-pkg';\nf_thing();\ni_tool();\n",
      options,
    },
    {
      name: 'node: 内建 f_/i_ 不解释',
      filename: prodFile,
      code: "import { i_x } from 'node:util';\n",
      options,
    },
    // 场景：测试文件消费依赖包 t_ 名（mgr.t_defineUserCommand 等）放行——测试路径是 t_ 的合法受众。
    {
      name: '测试文件消费依赖包 t_ 放行',
      filename: testFile,
      code: "import mgr from 'litenvi-node/lite-cmd-mgr.mjs';\nmgr.t_defineUserCommand('npm', {});\n",
      options,
    },
    // ── 包名自引用：经 manifest exports 映射归因到本项目文件 ──
    {
      name: '包名自引用主入口放行',
      filename: prodFile,
      code: "import { rules } from 'atb-eslint-plugin';\n",
      options,
    },
    {
      name: '包名自引用 i_ 成员生产放行',
      filename: prodFile,
      code: "import { i_run } from 'atb-eslint-plugin/rules/helper.mjs';\ni_run();\n",
      options,
    },
    // ── 静态边界：不传播普通返回值、数值下标、不可知属性名与不可解析动态加载 ──
    // 场景：interfaceReturns 移除后的既定口径——普通函数返回值一律视为数据。
    {
      name: '普通返回值不传播接口身份',
      filename: prodFile,
      code: 'function f_build() { return { t_reset() {} }; }\nconst h = f_build();\nh.t_reset();\n',
      options,
    },
    // 场景：数组数值下标不是接口名访问。
    {
      name: '数值下标不是接口访问',
      filename: prodFile,
      code: "import facade from '../facade.mjs';\nfacade.handlers[0]();\n",
      options,
    },
    // 场景：属性名不可静态解析（let 绑定）时只跳过该次判断，不因未知报错。
    {
      name: '不可解析属性名跳过',
      filename: prodFile,
      code: "import facade from '../facade.mjs';\nlet key = 't_reset';\nfacade[key]();\n",
      options,
    },
    // 场景：动态加载目标不可静态解析时停止归因。
    {
      name: '动态加载不可解析跳过',
      filename: prodFile,
      code: "import url from 'node:url';\nasync function f_load() { return import(url.href); }\nf_load();\n",
      options,
    },
    // 场景：转调包装归因正常建立——合规成员访问照常放行（invalid 组验证越级形态）。
    {
      name: '转调包装合规访问放行',
      filename: prodFile,
      code: "import facade from '../facade.mjs';\nfunction f_wrap(m) { return m.query(); }\nf_wrap(facade);\n",
      options,
    },
    // 场景：测试文件 re-export t_ 面名放行。
    {
      name: '测试文件 re-export t_ 放行',
      filename: testFile,
      code: "export { t_thing } from '../helper.mjs';\n",
      options,
    },
  ],
  invalid: [
    // ── 导出面分工：生产文件 ──
    // 场景：生产文件 f_ 是文件私有接口，出现在导出面（数据与声明两形态）即报。
    {
      name: '生产文件 f_ 数据导出报告',
      filename: prodFile,
      code: 'export const f_data = 1;\n',
      options,
      output: null,
      errors: [{ messageId: 'filePrivateExport', data: { name: 'f_data' }, type: 'Identifier' }],
    },
    {
      name: '生产文件 f_ 函数导出报告',
      filename: prodFile,
      code: 'export function f_run() {}\n',
      options,
      output: null,
      errors: [{ messageId: 'filePrivateExport', data: { name: 'f_run' }, type: 'Identifier' }],
    },
    // 场景：生产文件把 t_ 接口别名成公开名导出即报（公开别名禁令），数据含原名与文件。
    {
      name: '生产文件 t_ 公开别名报告',
      filename: prodFile,
      code: 'const t_x = 1;\nexport { t_x as api };\n',
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyExport',
        data: { name: 't_x', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：默认导出面把 t_ 接口挂到无名入口等同公开别名，同报。
    {
      name: '生产文件 t_ 默认导出报告',
      filename: prodFile,
      code: 'const t_x = 1;\nexport default t_x;\n',
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyExport',
        data: { name: 't_x', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // ── 访问面：f_ 跨文件 ──
    {
      name: 'f_ 跨文件导入报告',
      filename: prodFile,
      code: "import { f_run } from '../helper.mjs';\n",
      options,
      output: null,
      errors: [{ messageId: 'filePrivateAccess', data: { name: 'f_run' }, type: 'Identifier' }],
    },
    {
      name: 'f_ 经模块对象访问报告',
      filename: prodFile,
      code: "import helper from '../helper.mjs';\nhelper.f_run();\n",
      options,
      output: null,
      errors: [{ messageId: 'filePrivateAccess', data: { name: 'f_run' }, type: 'Identifier' }],
    },
    // ── 访问面：i_ 测试触达 ──
    {
      name: 'i_ 测试导入报告',
      filename: testFile,
      code: "import { i_run } from '../helper.mjs';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testInternalAccess',
        data: { name: 'i_run', file: 'scripts/tests/suite.test.mjs' },
        type: 'Identifier',
      }],
    },
    {
      name: '包名自引用 i_ 测试触达报告',
      filename: testFile,
      code: "import { i_run } from 'atb-eslint-plugin/rules/helper.mjs';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testInternalAccess',
        data: { name: 'i_run', file: 'scripts/tests/suite.test.mjs' },
        type: 'Identifier',
      }],
    },
    // ── 访问面：t_ 生产消费 ──
    {
      name: 't_ 生产导入报告',
      filename: prodFile,
      code: "import { t_run } from '../helper.mjs';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_run', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：改名导入仍核原名——换马甲不改变接口身份。
    {
      name: 't_ 改名导入仍查原名报告',
      filename: prodFile,
      code: "import { t_run as run } from '../helper.mjs';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_run', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：依赖包 t_ 名生产导入——测试方法不能在生产中使用，来源是依赖包也不例外。
    {
      name: '依赖包 t_ 生产导入报告',
      filename: prodFile,
      code: "import { t_run } from 'some-pkg';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_run', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：node: 内建 t_ 名同样按名字声明生产禁用（与依赖包同一口径）。
    {
      name: 'node: 内建 t_ 生产导入报告',
      filename: prodFile,
      code: "import { t_x } from 'node:util';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_x', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：依赖包命名空间/默认对象上的 t_ 成员调用（litenvi mgr 形态）生产禁用。
    {
      name: '依赖包 t_ 经模块对象访问报告',
      filename: prodFile,
      code: "import mgr from 'litenvi-node/lite-cmd-mgr.mjs';\nmgr.t_defineUserCommand('npm', {});\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_defineUserCommand', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：依赖包 t_ 改名导入仍核原名——换马甲不改变接口身份（外部来源同口径）。
    {
      name: '依赖包 t_ 改名导入报告',
      filename: prodFile,
      code: "import { t_run as run } from 'some-pkg';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_run', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：依赖包 t_ 经解构报告——归因传播对外部来源同样生效。
    {
      name: '依赖包 t_ 经解构报告',
      filename: prodFile,
      code: "import mgr from 'some-pkg';\nconst { t_reset } = mgr;\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_reset', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：依赖包 t_ 经别名转存报告。
    {
      name: '依赖包 t_ 经别名转存报告',
      filename: prodFile,
      code: "import mgr from 'some-pkg';\nconst alias = mgr;\nalias.t_reset();\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_reset', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：依赖包 t_ re-export——生产文件转手测试专用接口即报。
    {
      name: '依赖包 t_ re-export 报告',
      filename: prodFile,
      code: "export { t_x } from 'some-pkg';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_x', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // ── 归因传播：模块对象、解构、别名转存、转调包装、静态计算键 ──
    {
      name: 't_ 经模块对象访问报告',
      filename: prodFile,
      code: "import facade from '../facade.mjs';\nfacade.t_reset();\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_reset', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：解构键命中受限接口名，按访问规则报告。
    {
      name: 't_ 经解构报告',
      filename: prodFile,
      code: "import facade from '../facade.mjs';\nconst { t_reset } = facade;\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_reset', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：接口来源转存（alias = facade）后访问同样归因。
    {
      name: 't_ 经别名转存报告',
      filename: prodFile,
      code: "import facade from '../facade.mjs';\nconst alias = facade;\nalias.t_reset();\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_reset', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：转调包装——接口对象实参归因到形参，包装函数体内访问照查。
    {
      name: 't_ 经转调包装报告',
      filename: prodFile,
      code: "import facade from '../facade.mjs';\nfunction f_wrap(m) { return m.t_reset(); }\nf_wrap(facade);\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_reset', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
    // 场景：静态字符串计算键可解析，照常核验（报点在字符串字面量上）。
    {
      name: 't_ 经静态计算键报告',
      filename: prodFile,
      code: "import facade from '../facade.mjs';\nfacade['t_reset']();\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_reset', file: 'src/flow.mjs' },
        type: 'Literal',
      }],
    },
    // 场景：生产文件 re-export t_ 接口——面名同为 t_ 只报访问面一次。
    {
      name: '生产文件 re-export t_ 报告',
      filename: prodFile,
      code: "export { t_x } from '../helper.mjs';\n",
      options,
      output: null,
      errors: [{
        messageId: 'testOnlyAccess',
        data: { name: 't_x', file: 'src/flow.mjs' },
        type: 'Identifier',
      }],
    },
  ],
});

// 前提约束（fail-loud）：testDir 不支持绝对路径——传入即抛，防运行目录漂移静默失效。
it('no-out-of-level-access 绝对路径 testDir 抛错', () => {
  assert.throws(
    () => outOfLevelAccess.create({
      options: [{ testDir: '/absolute/tests' }],
      cwd: repoRoot,
      filename: prodFile,
    }),
    /相对仓库根的相对路径/,
    '绝对 testDir 应在 create 阶段抛错',
  );
});

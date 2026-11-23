import assert from 'node:assert/strict';
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { test } from 'node:test';
import { Linter } from 'eslint';
import { i_createFixture } from '../lint-fixture.mjs';
import entryRule from 'atb-eslint-plugin/rules/no-undeclared-entry-in-test.mjs';

const f_DRIVE = "import cp from 'node:child_process'; cp.spawn('node', ['src/cli.mjs', 'serve']);";
const f_PAGE = "import { chromium } from 'playwright'; const browser = await chromium.launch(); const page = await browser.newPage();";
const f_HELPER = "import cp from 'node:child_process'; export function t_start() { cp.spawn('node', ['src/cli.mjs', 'serve']); }";
const f_PROCESS_MANIFEST = { name: 'litenvi-node', exports: { './lite-*.mjs': './src/lite-*.mjs' } };
const f_PROCESS_FILES = { 'src/lite-child_process.mjs': 'export default {}; export function spawn() {}' };
const f_NATIVE_REFERENCE = "import { api } from 'fixture'; import cp from 'node:child_process'; cp.spawn('node', ['-e', '']);";

// 私有：内存卷中创建独立包，经真实 Linter.verify 分析；不启动夹具中的进程与浏览器。
async function f_check({ partition, code, files = {}, manifest = {}, builtinReference = false, builtinPackage = false, filename = null, ruleOptions = {}, uiTest = { startup: 'src/cli.mjs serve' } }) {
  const root = i_createFixture();
  const builtin = builtinReference || builtinPackage;
  const builtinManifest = builtin ? { name: 'litenvi-node', type: 'module', exports: { '.': './src/api.mjs', './lite-*.mjs': './scripts/lite-*.mjs' } } : {};
  if (builtin) code = code.replaceAll("from 'fixture'", "from 'litenvi-node'");
  try {
    const input = {
      'package.json': JSON.stringify({ name: 'fixture', bin: { cli: './src/cli.mjs' }, exports: { '.': './src/api.mjs', './rules/*.mjs': './src/rules/*.mjs' }, ...builtinManifest, ...manifest }),
      'src/cli.mjs': '',
      'src/api.mjs': 'export const api = 1;',
      'src/internal.mjs': 'export const hidden = 1;',
      'src/rules/example.mjs': 'export default {};',
      ...files,
    };
    for (const [name, text] of Object.entries(input)) {
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    }
    const linter = new Linter({ cwd: root });
    const config = [{
      files: ['**/*.mjs'],
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      plugins: { atb: { rules: { entry: entryRule } } },
      rules: { 'atb/entry': ['error', { testDir: 'scripts/tests', uiTest, ...ruleOptions }] },
    }];
    const messages = linter.verify(code, config, { filename: path.resolve(root, filename || (builtinReference ? 'scripts/tests/export/native-reference.test.mjs' : `scripts/tests/${partition}/sample.test.mjs`)) });
    return messages.map(message => message.messageId || message.message);
  } finally {
    fs.t_unmock();
  }
}

const f_CASES = [
  { name: 'bin 空文件缺少必需入口', partition: 'bin', code: 'const value = 1;', expected: ['missingBinEntry'] },
  { name: 'bin 只调用测试 runner 不算业务入口', partition: 'bin', code: "import cp from 'node:child_process'; cp.spawn('node', ['scripts/tests/runner.mjs']);", files: { 'scripts/tests/runner.mjs': '' }, expected: ['missingBinEntry'] },
  { name: 'bin 直接调用声明入口', partition: 'bin', code: f_DRIVE, expected: [] },
  { name: 'bin 具名别名调用声明入口', partition: 'bin', code: "import { spawn as launch } from 'node:child_process'; launch(process.execPath, ['src/cli.mjs']);", expected: [] },
  { name: 'bin 通过实际调用的 helper 满足入口', partition: 'bin', code: "import { t_start } from '../helper.mjs'; t_start();", files: { 'scripts/tests/helper.mjs': f_HELPER }, expected: [] },
  { name: 'bin 通过工厂返回句柄的真实方法调用满足入口', partition: 'bin', code: "import { t_agent } from '../helper.mjs'; const agent = t_agent('src/cli.mjs'); agent.run();", files: { 'scripts/tests/helper.mjs': "import cp from 'node:child_process'; export function t_agent(file) { function run() { cp.spawn('node', [file]); } return { run }; }" }, expected: [] },
  { name: 'bin 仅导入未调用的 helper 不算入口', partition: 'bin', code: "import { t_start } from '../helper.mjs';", files: { 'scripts/tests/helper.mjs': f_HELPER }, expected: ['missingBinEntry'] },
  { name: 'bin 未调用的本地函数不算入口', partition: 'bin', code: "import cp from 'node:child_process'; function unused() { cp.spawn('node', ['src/cli.mjs']); }", expected: ['missingBinEntry'] },
  { name: 'bin 明确不执行的分支不能充当入口', partition: 'bin', code: "import cp from 'node:child_process'; if (false) cp.spawn('node', ['src/cli.mjs']);", expected: ['missingBinEntry'] },
  { name: 'bin 跳过的测试回调不能充当入口', partition: 'bin', code: "import { test } from 'node:test'; import cp from 'node:child_process'; test.skip('不执行', () => cp.spawn('node', ['src/cli.mjs']));", expected: ['missingBinEntry'] },
  { name: 'bin 普通同名方法不算入口', partition: 'bin', code: "const object = { spawn() {} }; object.spawn('node', ['src/cli.mjs']);", expected: ['missingBinEntry'] },
  { name: 'bin 常量参数与 Node 选项可解析', partition: 'bin', code: "import cp from 'node:child_process'; const args = ['--enable-source-maps', 'src/cli.mjs']; cp.spawn('node', args);", expected: [] },
  { name: 'bin exec 命令可满足入口', partition: 'bin', code: "import { execSync } from 'node:child_process'; execSync('node src/cli.mjs task');", expected: [] },
  { name: 'bin 直接执行声明文件可满足入口', partition: 'bin', code: "import cp from 'node:child_process'; cp.execFile('src/cli.mjs', ['task']);", expected: [] },
  { name: 'bin 通过清单命令名驱动可满足入口', partition: 'bin', code: "import cp from 'node:child_process'; cp.spawn('cli', ['task']);", expected: [] },
  { name: 'bin fork 声明模块可满足入口', partition: 'bin', code: "import { fork } from 'node:child_process'; fork('src/cli.mjs');", expected: [] },
  { name: 'bin 绝对入口不依赖动态 cwd 的解析', partition: 'bin', code: "import cp from 'node:child_process'; import { fileURLToPath } from 'node:url'; const cli = fileURLToPath(new URL('../../../src/cli.mjs', import.meta.url)); cp.spawn('node', [cli], { cwd: createProject() });", expected: [] },
  { name: 'bin 只有内联脚本不满足文件入口', partition: 'bin', code: "import cp from 'node:child_process'; cp.spawn('node', ['-e', 'process.exit(0)']);", expected: ['missingBinEntry'] },
  { name: 'bin 进程装配脚本不替代也不阻止真实入口', partition: 'bin', code: f_DRIVE + "cp.spawn('node', ['-e', 'setInterval(() => {}, 1000)']);", expected: [] },
  { name: 'bin 字符串清单入口可满足', partition: 'bin', code: f_DRIVE, manifest: { bin: './src/cli.mjs' }, expected: [] },
  { name: 'export 只导入内建与依赖不算入口', partition: 'export', code: "import assert from 'node:assert/strict'; import { RuleTester } from 'eslint';", expected: ['missingExportEntry'] },
  { name: 'export 自引用包的声明子路径满足入口', partition: 'export', code: "import rule from 'fixture/rules/example.mjs';", expected: [] },
  { name: 'export 自引用未声明子路径被拒绝', partition: 'export', code: "import hidden from 'fixture/src/internal.mjs';", expected: ['importOffExportFace'] },
  { name: 'export 字符串 exports 根入口可满足', partition: 'export', code: "import { api } from 'fixture';", manifest: { exports: './src/api.mjs' }, expected: [] },
  { name: 'export 动态 import 声明入口可满足', partition: 'export', code: "const api = await import('../../../src/api.mjs');", expected: [] },
  { name: 'export 实际调用 helper 的公开导入可追踪', partition: 'export', code: "import { t_read } from '../helper.mjs'; t_read();", files: { 'scripts/tests/helper.mjs': "import { api } from 'fixture'; export function t_read() { return api; }" }, expected: [] },
  { name: 'export 子进程门面包自引用允许公开 API 自测', partition: 'export', code: "import cp from 'litenvi-node/lite-child_process.mjs'; cp.spawn('node', ['-e', '']);", manifest: f_PROCESS_MANIFEST, files: f_PROCESS_FILES, expected: [] },
  { name: 'export 子进程门面相对导入与包自引用判定一致', partition: 'export', code: "import cp from '../../../src/lite-child_process.mjs'; cp.spawn('node', ['-e', '']);", manifest: f_PROCESS_MANIFEST, files: f_PROCESS_FILES, expected: [] },
  { name: 'export 子进程门面相对具名别名也识别来源', partition: 'export', code: "import { spawn as launch } from '../../../src/lite-child_process.mjs'; launch('node', ['-e', '']);", manifest: f_PROCESS_MANIFEST, files: f_PROCESS_FILES, expected: [] },
  { name: 'export 已调用 helper 的相对子进程导入也允许 API 自测', partition: 'export', code: "import { t_start } from '../helper.mjs'; t_start();", manifest: f_PROCESS_MANIFEST, files: { ...f_PROCESS_FILES, 'scripts/tests/helper.mjs': "import cp from '../../src/lite-child_process.mjs'; export function t_start() { cp.spawn('node', ['-e', '']); }" }, expected: [] },
  { name: 'export 其他包的同名文件不冒认子进程门面', partition: 'export', code: "import cp from '../../../src/lite-child_process.mjs'; cp.spawn('node', ['-e', '']);", manifest: { name: 'unrelated', exports: f_PROCESS_MANIFEST.exports }, files: f_PROCESS_FILES, expected: [] },
  { name: 'export 同包内非清单子进程文件不冒认公开门面', partition: 'export', code: "import cp from '../../../src/other/lite-child_process.mjs'; cp.spawn('node', ['-e', '']);", manifest: f_PROCESS_MANIFEST, files: { ...f_PROCESS_FILES, 'src/other/lite-child_process.mjs': 'export default {};' }, expected: ['importOffExportFace'] },
  { name: 'export 包自引用 API 启动本包 bin 仍拒绝', partition: 'export', code: "import cp from 'litenvi-node/lite-child_process.mjs'; cp.spawn('node', ['src/cli.mjs']);", manifest: f_PROCESS_MANIFEST, files: f_PROCESS_FILES, expected: ['spawnInExportPartition'] },
  { name: 'export 相对 API 启动本包 bin 与包自引用一致', partition: 'export', code: "import cp from '../../../src/lite-child_process.mjs'; cp.spawn('node', ['src/cli.mjs']);", manifest: f_PROCESS_MANIFEST, files: f_PROCESS_FILES, expected: ['spawnInExportPartition'] },
  { name: 'export 第三方子进程门面不能冒充本包 API 自测', partition: 'export', code: "import { api } from 'fixture'; import cp from 'litenvi-node/lite-child_process.mjs'; cp.spawn('node', ['-e', '']);", expected: ['spawnInExportPartition'] },
  { name: 'OS 原生对照文件不获得进程权限', partition: 'export', builtinPackage: true, filename: 'scripts/tests/export/lite-os.test.mjs', code: f_NATIVE_REFERENCE, expected: ['spawnInExportPartition'] },
  { name: '内置原生对照支持裸 child_process', partition: 'export', builtinReference: true, code: f_NATIVE_REFERENCE.replace('node:child_process', 'child_process'), expected: [] },
  { name: 'export 原生对照未登记仍拒绝', partition: 'export', code: f_NATIVE_REFERENCE, expected: ['spawnInExportPartition'] },
  { name: 'litenvi 内置原生对照允许合法进程', partition: 'export', builtinReference: true, code: f_NATIVE_REFERENCE, expected: [] },
  { name: '嵌套普通包不继承外层内置身份', partition: 'export', builtinReference: true, uiTest: { enabled: false }, code: "import { api } from '../../api.mjs'; import cp from 'node:child_process'; cp.spawn('node', ['-e', '']);", files: { 'scripts/package.json': '{"name":"nested","exports":{".":"./api.mjs"}}', 'scripts/api.mjs': 'export const api = 1;' }, expected: ['spawnInExportPartition'] },
  { name: 'export 原生非 Node 命令同样需要登记', partition: 'export', code: "import { api } from 'fixture'; import cp from 'node:child_process'; cp.spawn('cat', []);", expected: ['spawnInExportPartition'] },
  { name: '内置原生对照支持非 Node 命令', partition: 'export', builtinReference: true, code: "import { api } from 'fixture'; import cp from 'node:child_process'; cp.spawn('cat', []);", expected: [] },
  { name: '内置原生对照不影响同包其他测试', partition: 'export', builtinPackage: true, code: f_NATIVE_REFERENCE, expected: ['spawnInExportPartition'] },
  { name: 'export 原生对照登记后仍须导入公开入口', partition: 'export', builtinReference: true, code: "import cp from 'node:child_process'; cp.spawn('node', ['-e', '']);", expected: ['missingExportEntry'] },
  { name: 'export 原生对照登记后仍禁止面外导入', partition: 'export', builtinReference: true, code: "import { hidden } from '../../../src/internal.mjs'; import cp from 'node:child_process'; cp.spawn('node', ['-e', '']);", expected: ['importOffExportFace'] },
  { name: 'export 原生对照登记不能授权第三方门面', partition: 'export', code: "import { api } from 'fixture'; import cp from 'litenvi-node/lite-child_process.mjs'; cp.spawn('node', ['-e', '']);", expected: ['spawnInExportPartition'] },
  { name: 'export 原生对照登记不能放行本包 bin', partition: 'export', builtinReference: true, code: "import { api } from 'fixture';" + f_DRIVE, expected: ['spawnInExportPartition'] },
  { name: 'export API 自测和原生对照登记都不能放行本包命令名', partition: 'export', code: "import cp from 'litenvi-node/lite-child_process.mjs'; cp.spawn('cli', []);", manifest: f_PROCESS_MANIFEST, files: f_PROCESS_FILES, expected: ['spawnInExportPartition'] },
  { name: 'bin 外部命令不能替代本包 bin 入口', partition: 'bin', code: "import cp from 'node:child_process'; cp.spawn('git', ['status']);", expected: ['missingBinEntry'] },
  { name: 'ui 只有启动没有首页不合格', partition: 'ui', code: f_DRIVE, expected: ['missingIndexNavigation'] },
  { name: 'ui 只有首页没有启动不合格', partition: 'ui', code: f_PAGE + "await page.goto('http://127.0.0.1:8888/');", expected: ['missingStartupCall'] },
  { name: 'ui 启动并导航默认首页', partition: 'ui', code: f_DRIVE + f_PAGE + "await page.goto('http://127.0.0.1:8888/');", expected: [] },
  { name: 'ui Playwright test 的页面 fixture 可识别', partition: 'ui', code: "import { test } from '@playwright/test'; import cp from 'node:child_process'; test('页面', async ({ page }) => { cp.spawn('node', ['src/cli.mjs', 'serve']); await page.goto('http://127.0.0.1:8888/'); });", expected: [] },
  { name: 'ui startup 可使用清单命令名', partition: 'ui', code: "import cp from 'node:child_process'; cp.spawn('cli', ['serve']);" + f_PAGE + "await page.goto('http://127.0.0.1:8888/');", uiTest: { startup: 'cli serve' }, expected: [] },
  { name: 'ui 动态端口与查询参数可接受', partition: 'ui', code: f_DRIVE + f_PAGE + 'const port = choosePort(); await page.goto(`http://127.0.0.1:${port}/?project=demo`);', expected: [] },
  { name: 'ui 端口初值不是运行期动态端口', partition: 'ui', code: f_DRIVE + f_PAGE + 'let port = 0; port = choosePort(); const origin = `http://127.0.0.1:${port}`; await page.goto(`${origin}/`);', expected: [] },
  { name: 'ui 自定义首页可满足', partition: 'ui', code: f_DRIVE + f_PAGE + "await page.goto('http://127.0.0.1:8888/index.html');", uiTest: { startup: 'src/cli.mjs serve', index: 'index.html' }, expected: [] },
  { name: 'ui localhost 不能冒充约定地址', partition: 'ui', code: f_DRIVE + f_PAGE + "await page.goto('http://localhost:8888/');", expected: ['invalidIndexNavigation'] },
  { name: 'ui 错误首页不能满足约定', partition: 'ui', code: f_DRIVE + f_PAGE + "await page.goto('http://127.0.0.1:8888/other');", expected: ['invalidIndexNavigation'] },
  { name: 'ui 普通对象 goto 不能冒充浏览器', partition: 'ui', code: f_DRIVE + "const object = { goto() {} }; object.goto('http://127.0.0.1:8888/');", expected: ['missingIndexNavigation'] },
  { name: 'ui 调用 helper 同时完成启动和导航', partition: 'ui', code: "import { t_open } from '../helper.mjs'; await t_open();", files: { 'scripts/tests/helper.mjs': f_DRIVE + f_PAGE + "export async function t_open() { await page.goto('http://127.0.0.1:8888/'); }" }, expected: [] },
  { name: 'ui 错误命令不能被动态尾参掩盖', partition: 'ui', code: "import cp from 'node:child_process'; cp.spawn('node', ['src/cli.mjs', 'wrong', value]);" + f_PAGE + "await page.goto('http://127.0.0.1:8888/');", expected: ['driveOffStartup'] },
  { name: '循环 helper 可终止且不虚构入口', partition: 'bin', code: "import { t_start } from '../helper.mjs'; t_start();", files: { 'scripts/tests/helper.mjs': 'export function t_start() { t_start(); }' }, expected: ['missingBinEntry'] },
];

for (const scenario of f_CASES) {
  /** 场景：按文件核验声明入口的存在性与真实调用来源，包含 helper、动态端口和错误输入。 */
  test(scenario.name, async function test_required_test_entry_scenario_name() {
    const actual = await f_check(scenario);
    assert.deepEqual(actual, scenario.expected, `${scenario.name}：诊断应精确匹配入口条件`);
  });
}

/** 场景：测试入口也不再接受项目可配置的原生模块例外。 */
test('入口规则拒绝旧例外参数', async function test_入口规则拒绝旧例外参数() {
  await assert.rejects(f_check({ partition: 'export', code: f_NATIVE_REFERENCE, ruleOptions: { exceptionFilesAllowModules: [] } }), /additional|unexpected|exceptionFilesAllowModules/, '删除的例外参数必须明确拒绝');
});

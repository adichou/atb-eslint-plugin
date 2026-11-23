// 测试三分区入口模型用例：分区判定、manifest 事实源（bin/exports 面）与 spawn/import 驱动
// 包根清单、目标文件与 helper 均由 lite-fs 内存卷装配，经真实 Linter.verify 执行规则。
// 每例使用独立项目路径并复位内存卷。覆盖：bin 分区（bin 目标放行 / 非 bin
// 报 / 基建互驱放行 / 不可解析报）、export 分区（面内放行 / 面外报 / 基建互导放行 / 裸包
// 放行）、ui 分区（startup 前缀匹配放行 / 不符报 / enabled=false 不设区）、分区外兜底、
// 基建文件不受分区约束、uiTest 自洽（缺 startup 报 / startup 非 bin 报）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { Linter } from 'eslint';
import { i_createFixture } from '../lint-fixture.mjs';
import entryRule from 'atb-eslint-plugin/rules/no-undeclared-entry-in-test.mjs';

// 夹具：files 相对路径 → 内容；返回夹具根。manifest 声明 bin（fixture-cli → src/cli.mjs）
// 与 exports（'.' → src/api.mjs）；src/internal.mjs 是面外实现文件。
function f_fixture(files) {
  const defaults = {
    'package.json': JSON.stringify({
      name: 'fixture',
      bin: { 'fixture-cli': 'src/cli.mjs' },
      exports: { '.': './src/api.mjs' },
    }),
    'src/cli.mjs': 'export const i_run = 1;\n',
    'src/api.mjs': 'export const api = 1;\n',
    'src/internal.mjs': 'export const i_hidden = 1;\n',
    'scripts/tests/helper.mjs': 'export const t_helper = 1;\n',
  };
  return i_createFixture({ ...defaults, ...files });
}

// 真实 ESLint 执行：lint 夹具内指定文件，返回消息数组（options 透传规则）。
async function f_verify(dir, relFile, options = {}) {
  const linter = new Linter({ cwd: dir });
  const config = [{
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { atb: { rules: { 'no-undeclared-entry-in-test': entryRule } } },
    rules: { 'atb/no-undeclared-entry-in-test': ['error', { testDir: 'scripts/tests', ...options }] },
  }];
  const messages = linter.verify(fs.readFileSync(path.join(dir, relFile), 'utf8'), config, { filename: path.resolve(dir, relFile) });
  return messages;
}

const UI = { uiTest: { startup: 'src/cli.mjs serve' } };

/** 场景：bin 分区——驱动 bin 声明块目标放行；testDir 内基建互驱放行。 */
test('valid：bin 分区 bin 目标与基建互驱放行', async () => {
  const dir = f_fixture({
    'scripts/tests/bin/cmd.test.mjs': "import cp from 'node:child_process';\nconst c1 = cp.spawn('node', ['src/cli.mjs', 'serve']);\nconst c2 = cp.spawn('node', ['scripts/tests/helper.mjs']);\nexport const t_x = [c1, c2];\n",
  });
  try {
    assert.deepEqual(await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', UI), [], 'bin 目标与 testDir 互驱应放行');
  } finally { fs.t_unmock(); }
});

/** 场景：bin 分区——驱动非 bin 声明的实现文件报告。 */
test('invalid：bin 分区非 bin 目标报告', async () => {
  const dir = f_fixture({
    'scripts/tests/bin/cmd.test.mjs': "import cp from 'node:child_process'; const c = cp.spawn('node', ['src/internal.mjs']);\nexport const t_x = c;\n",
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', UI);
    assert.equal(messages.length, 1, "invalid：bin 分区非 bin 目标报告：messages.length");
    assert.equal(messages[0].messageId, 'undeclaredEntry', "invalid：bin 分区非 bin 目标报告：messages[0].messageId");
    assert.match(messages[0].message, /bin 声明块/, "invalid：bin 分区非 bin 目标报告：messages[0].message");
  } finally { fs.t_unmock(); }
});

/** 场景：export 分区——import 声明面文件放行；testDir 基建互导与裸包放行。 */
test('valid：export 分区面内与互导放行', async () => {
  const dir = f_fixture({
    'scripts/tests/export/api.test.mjs': "import { api } from '../../../src/api.mjs';\nimport { t_helper } from '../helper.mjs';\nimport path from 'node:path';\nexport const t_x = [api, t_helper, path];\n",
  });
  try {
    assert.deepEqual(await f_verify(dir, 'scripts/tests/export/api.test.mjs', UI), [], '面内 / 基建 / 裸包应放行');
  } finally { fs.t_unmock(); }
});

/** 场景：export 分区——import 面外生产文件报告（声明面外无入口可测）。 */
test('invalid：export 分区面外 import 报告', async () => {
  const dir = f_fixture({
    'scripts/tests/export/api.test.mjs': "import { i_hidden } from '../../../src/internal.mjs';\nexport const t_x = i_hidden;\n",
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/export/api.test.mjs', UI);
    assert.equal(messages.length, 1, "invalid：export 分区面外 import 报告：messages.length");
    assert.equal(messages[0].messageId, 'importOffExportFace', "invalid：export 分区面外 import 报告：messages[0].messageId");
    assert.match(messages[0].message, /internal\.mjs/, "invalid：export 分区面外 import 报告：messages[0].message");
  } finally { fs.t_unmock(); }
});

/** 场景：ui 分区——驱动以 startup 声明（入口文件 + 参数）为前缀放行；不符报告。 */
test('ui 分区驱动匹配', async () => {
  const dir = f_fixture({
    'scripts/tests/ui/page-ok.test.mjs': "import cp from 'node:child_process'; import { chromium } from 'playwright'; const c = cp.spawn('node', ['src/cli.mjs', 'serve']); const browser = await chromium.launch(); const page = await browser.newPage(); await page.goto('http://127.0.0.1:8888/');\nexport const t_x = c;\n",
    'scripts/tests/ui/page-bad.test.mjs': "import cp from 'node:child_process'; const c = cp.spawn('node', ['src/internal.mjs', 'serve']);\nexport const t_x = c;\n",
  });
  try {
    assert.deepEqual(await f_verify(dir, 'scripts/tests/ui/page-ok.test.mjs', UI), [], 'startup 前缀匹配应放行');
    const messages = await f_verify(dir, 'scripts/tests/ui/page-bad.test.mjs', UI);
    assert.equal(messages.length, 1, "ui 分区驱动匹配：messages.length");
    assert.equal(messages[0].messageId, 'driveOffStartup', "ui 分区驱动匹配：messages[0].messageId");
  } finally { fs.t_unmock(); }
});

/** 场景：分区外兜底——不在 bin/export/ui 的测试文件报告；基建文件不受分区约束。 */
test('分区外与基建豁免', async () => {
  const dir = f_fixture({
    'scripts/tests/tasks/legacy.test.mjs': 'export const t_x = 1;\n',
    'scripts/tests/world.mjs': 'export const t_world = 1;\n',
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/tasks/legacy.test.mjs', UI);
    assert.equal(messages.length, 1, "分区外与基建豁免：messages.length");
    assert.equal(messages[0].messageId, 'testOutsidePartitions', "分区外与基建豁免：messages[0].messageId");
    assert.deepEqual(await f_verify(dir, 'scripts/tests/world.mjs', UI), [], '非 .test 基建文件不受分区约束');
  } finally { fs.t_unmock(); }
});

/** 场景：uiTest 自洽——启用但缺 startup 报配置错；startup 入口不在 bin 声明块报告。 */
test('uiTest 自洽校验', async () => {
  const dir = f_fixture({
    'scripts/tests/bin/cmd.test.mjs': 'export const t_x = 1;\n',
  });
  try {
    const missing = await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', { uiTest: {} });
    assert.equal(missing.length, 1, "uiTest 自洽校验：missing.length");
    assert.equal(missing[0].messageId, 'configStartupMissing', "uiTest 自洽校验：missing[0].messageId");
    const offBin = await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', { uiTest: { startup: 'src/internal.mjs serve' } });
    assert.equal(offBin.length, 1, "uiTest 自洽校验：offBin.length");
    assert.equal(offBin[0].messageId, 'startupOffBin', "uiTest 自洽校验：offBin[0].messageId");
  } finally { fs.t_unmock(); }
});

/** 场景：uiTest.enabled=false——ui 分区不设区，ui/ 下测试按分区外报告。 */
test('uiTest 关闭时 ui 分区不设', async () => {
  const dir = f_fixture({
    'scripts/tests/ui/page.test.mjs': 'export const t_x = 1;\n',
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/ui/page.test.mjs', { uiTest: { enabled: false } });
    assert.equal(messages.length, 1, "uiTest 关闭时 ui 分区不设：messages.length");
    assert.equal(messages[0].messageId, 'testOutsidePartitions', 'ui 面未启用时 ui/ 测试按分区外报告');
  } finally { fs.t_unmock(); }
});

/** 场景：spawn 目标静态不可解析——fail-loud 报告（防盲区绕行）。 */
test('invalid：驱动目标不可解析报告', async () => {
  const dir = f_fixture({
    'scripts/tests/bin/cmd.test.mjs': "import cp from 'node:child_process'; const target = chooseTarget();\nconst c = cp.spawn('node', target);\nexport const t_x = c;\n",
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', UI);
    assert.equal(messages.length, 1, "invalid：驱动目标不可解析报告：messages.length");
    assert.equal(messages[0].messageId, 'unresolvableEntry', "invalid：驱动目标不可解析报告：messages[0].messageId");
  } finally { fs.t_unmock(); }
});

/** 场景：跨分区误放——export 分区出现 spawn 驱动即报（batch-receipt 事故回归：
 * spawnSync 驱动 atb CLI 被误分到 export，规则因 export 分区不查 spawn 而漏报）。 */
test('invalid：export 分区出现 spawn 驱动报告', async () => {
  const dir = f_fixture({
    'scripts/tests/export/api.test.mjs': "import liteChildProcess from 'litenvi-node/lite-child_process.mjs'; const r = liteChildProcess.spawnSync('node', [f_ATB, 'batch', 'next']);\nexport const t_x = r;\n",
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/export/api.test.mjs', UI);
    assert.equal(messages.length, 1, "invalid：export 分区出现 spawn 驱动报告：messages.length");
    assert.equal(messages[0].messageId, 'spawnInExportPartition', "invalid：export 分区出现 spawn 驱动报告：messages[0].messageId");
    assert.match(messages[0].message, /放错分区/, "invalid：export 分区出现 spawn 驱动报告：messages[0].message");
  } finally { fs.t_unmock(); }
});

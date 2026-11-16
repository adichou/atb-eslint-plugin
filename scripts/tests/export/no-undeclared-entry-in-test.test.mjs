// 测试三分区入口模型用例：分区判定、manifest 事实源（bin/exports 面）与 spawn/import 驱动
// 核验需要真实磁盘（规则自锚定包根读 manifest、相对说明符解析目标存在性），采用临时夹具
// 目录驱动真实 ESLint 类执行——每个用例独立 tmpdir。覆盖：bin 分区（bin 目标放行 / 非 bin
// 报 / 基建互驱放行 / 不可解析报）、export 分区（面内放行 / 面外报 / 基建互导放行 / 裸包
// 放行）、ui 分区（startup 前缀匹配放行 / 不符报 / enabled=false 不设区）、分区外兜底、
// 基建文件不受分区约束、uiTest 自洽（缺 startup 报 / startup 非 bin 报）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import entryRule from 'atb-eslint-plugin/rules/no-undeclared-entry-in-test.mjs';

// 夹具：files 相对路径 → 内容；返回夹具根。manifest 声明 bin（fixture-cli → src/cli.mjs）
// 与 exports（'.' → src/api.mjs）；src/internal.mjs 是面外实现文件。
function f_fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atb-entry-'));
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
  for (const [rel, content] of Object.entries({ ...defaults, ...files })) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

// 真实 ESLint 执行：lint 夹具内指定文件，返回消息数组（options 透传规则）。
async function f_verify(dir, relFile, options = {}) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    cwd: dir,
    overrideConfig: [{
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      plugins: { atb: { rules: { 'no-undeclared-entry-in-test': entryRule } } },
      rules: { 'atb/no-undeclared-entry-in-test': ['error', { testDir: 'scripts/tests', ...options }] },
    }],
  });
  const [result] = await eslint.lintText(fs.readFileSync(path.join(dir, relFile), 'utf8'), { filePath: relFile });
  return result.messages;
}

const UI = { uiTest: { startup: 'src/cli.mjs serve' } };

/** 场景：bin 分区——驱动 bin 声明块目标放行；testDir 内基建互驱放行。 */
test('valid：bin 分区 bin 目标与基建互驱放行', async () => {
  const dir = f_fixture({
    'scripts/tests/bin/cmd.test.mjs': "import { spawn } from '../helper.mjs';\nconst c1 = cp.spawn('node', ['../../../src/cli.mjs', 'serve']);\nconst c2 = cp.spawn('node', ['../helper.mjs']);\nexport const t_x = [c1, c2];\n",
  });
  try {
    assert.deepEqual(await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', UI), [], 'bin 目标与 testDir 互驱应放行');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：bin 分区——驱动非 bin 声明的实现文件报告。 */
test('invalid：bin 分区非 bin 目标报告', async () => {
  const dir = f_fixture({
    'scripts/tests/bin/cmd.test.mjs': "const c = cp.spawn('node', ['../../../src/internal.mjs']);\nexport const t_x = c;\n",
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', UI);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, 'undeclaredEntry');
    assert.match(messages[0].message, /bin 声明块/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：export 分区——import 声明面文件放行；testDir 基建互导与裸包放行。 */
test('valid：export 分区面内与互导放行', async () => {
  const dir = f_fixture({
    'scripts/tests/export/api.test.mjs': "import { api } from '../../../src/api.mjs';\nimport { t_helper } from '../helper.mjs';\nimport path from 'node:path';\nexport const t_x = [api, t_helper, path];\n",
  });
  try {
    assert.deepEqual(await f_verify(dir, 'scripts/tests/export/api.test.mjs', UI), [], '面内 / 基建 / 裸包应放行');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：export 分区——import 面外生产文件报告（声明面外无入口可测）。 */
test('invalid：export 分区面外 import 报告', async () => {
  const dir = f_fixture({
    'scripts/tests/export/api.test.mjs': "import { i_hidden } from '../../../src/internal.mjs';\nexport const t_x = i_hidden;\n",
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/export/api.test.mjs', UI);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, 'importOffExportFace');
    assert.match(messages[0].message, /internal\.mjs/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：ui 分区——驱动以 startup 声明（入口文件 + 参数）为前缀放行；不符报告。 */
test('ui 分区驱动匹配', async () => {
  const dir = f_fixture({
    'scripts/tests/ui/page-ok.test.mjs': "const c = cp.spawn('node', ['../../../src/cli.mjs', 'serve']);\nexport const t_x = c;\n",
    'scripts/tests/ui/page-bad.test.mjs': "const c = cp.spawn('node', ['../../../src/internal.mjs', 'serve']);\nexport const t_x = c;\n",
  });
  try {
    assert.deepEqual(await f_verify(dir, 'scripts/tests/ui/page-ok.test.mjs', UI), [], 'startup 前缀匹配应放行');
    const messages = await f_verify(dir, 'scripts/tests/ui/page-bad.test.mjs', UI);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, 'driveOffStartup');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：分区外兜底——不在 bin/export/ui 的测试文件报告；基建文件不受分区约束。 */
test('分区外与基建豁免', async () => {
  const dir = f_fixture({
    'scripts/tests/tasks/legacy.test.mjs': 'export const t_x = 1;\n',
    'scripts/tests/world.mjs': 'export const t_world = 1;\n',
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/tasks/legacy.test.mjs', UI);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, 'testOutsidePartitions');
    assert.deepEqual(await f_verify(dir, 'scripts/tests/world.mjs', UI), [], '非 .test 基建文件不受分区约束');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：uiTest 自洽——启用但缺 startup 报配置错；startup 入口不在 bin 声明块报告。 */
test('uiTest 自洽校验', async () => {
  const dir = f_fixture({
    'scripts/tests/bin/cmd.test.mjs': 'export const t_x = 1;\n',
  });
  try {
    const missing = await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', { uiTest: {} });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].messageId, 'configStartupMissing');
    const offBin = await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', { uiTest: { startup: 'src/internal.mjs serve' } });
    assert.equal(offBin.length, 1);
    assert.equal(offBin[0].messageId, 'startupOffBin');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：uiTest.enabled=false——ui 分区不设区，ui/ 下测试按分区外报告。 */
test('uiTest 关闭时 ui 分区不设', async () => {
  const dir = f_fixture({
    'scripts/tests/ui/page.test.mjs': 'export const t_x = 1;\n',
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/ui/page.test.mjs', { uiTest: { enabled: false } });
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, 'testOutsidePartitions', 'ui 面未启用时 ui/ 测试按分区外报告');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：spawn 目标静态不可解析——fail-loud 报告（防盲区绕行）。 */
test('invalid：驱动目标不可解析报告', async () => {
  const dir = f_fixture({
    'scripts/tests/bin/cmd.test.mjs': "const target = ['../../../src/cli.mjs'];\nconst c = cp.spawn('node', target);\nexport const t_x = c;\n",
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/bin/cmd.test.mjs', UI);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].messageId, 'unresolvableEntry');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

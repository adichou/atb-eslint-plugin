// 配置测试守护规则用例：守护对象为固定双配置（根配置 eslint.config.mjs + packageJsonPath
// 清单），守护测试的「真实读取 + 关键字段断言」证据需要真实卷上的可解析测试源码——全部在
// lite-fs 内存卷装配，经真实 Linter.verify 执行，每例独立项目路径并复位内存卷。覆盖：三级
// 证据（守护文件存在 / import 说明符与 new URL(import.meta.url) 静态读取 / assert 绑定字段
// 断言）、约定命名递归定位、packageJsonPath 定制（manifest.json → manifest.test.mjs）、
// 锚点外不受检、绝对路径 fail-loud。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { Linter } from 'eslint';
import { i_createFixture } from '../lint-fixture.mjs';
import missingConfigTests from 'atb-eslint-plugin/rules/no-missing-config-tests.mjs';

// 驱动真实 ESLint：受检目标是根配置 eslint.config.mjs（内容任意，规则不解析其内容）。
async function f_lint(dir, options = {}, filePath = 'eslint.config.mjs') {
  const linter = new Linter({ cwd: dir });
  const config = [{
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { atb: { rules: { 'no-missing-config-tests': missingConfigTests } } },
    rules: { 'atb/no-missing-config-tests': ['error', options] },
  }];
  const messages = linter.verify('export default [];\n', config, { filename: path.resolve(dir, filePath) });
  return messages;
}

const f_MANIFEST = JSON.stringify({ name: 'fixture', type: 'module' });
// 守护测试样本：清单全证据（三层 URL 真实读取 + name/exports 断言）、根配置全证据（import
// 说明符读取 + plugins 字段断言）、无读取、有读取无断言、断言不含关键字段。
const f_PKG_GUARD = "import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nconst m = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));\nassert.equal(m.name, 'fixture');\nassert.ok(Object.hasOwn(m.exports, 'x'));\n";
const f_LINT_GUARD = "import assert from 'node:assert/strict';\nimport cfg from '../../../eslint.config.mjs';\nassert.ok(cfg.plugins !== undefined, 'plugins 在位');\n";
const f_NO_READ_GUARD = "import assert from 'node:assert/strict';\nconst m = { name: 'fixture' };\nassert.equal(m.name, 'fixture');\n";
const f_NO_ASSERT_GUARD = "import fs from 'node:fs';\nconst m = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));\n";
const f_WRONG_FIELD_GUARD = "import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nconst m = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));\nassert.equal(1, 1);\n";

/** 场景：固定双配置守护齐——URL 构造与 import 说明符两种读取形态，字段断言齐备。 */
test('valid：双配置守护齐放行', async function test_valid_双配置守护齐放行() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
    'scripts/tests/export/package.test.mjs': f_PKG_GUARD,
    'scripts/tests/export/eslint.config.test.mjs': f_LINT_GUARD,
  });
  try {
    const messages = await f_lint(dir);
    assert.deepEqual(messages, [], '双配置三级证据齐应放行');
  } finally { fs.t_unmock(); }
});

/** 场景：约定名在 testDir 深层递归定位（分区无关；深层守护文件相对路径按自身深度书写）。 */
test('valid：约定名深层递归定位', async function test_valid_约定名深层递归定位() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
    'scripts/tests/export/deep/nested/package.test.mjs': "import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nconst m = JSON.parse(fs.readFileSync(new URL('../../../../../package.json', import.meta.url), 'utf8'));\nassert.equal(m.name, 'fixture');\n",
    'scripts/tests/export/eslint.config.test.mjs': f_LINT_GUARD,
  });
  try {
    const messages = await f_lint(dir);
    assert.deepEqual(messages, [], '深层约定名守护文件应可定位');
  } finally { fs.t_unmock(); }
});

/** 场景：packageJsonPath 定制——清单条目路径与约定守护名随之变化（manifest.json → manifest.test.mjs）。 */
test('valid：packageJsonPath 定制守护名', async function test_valid_packageJsonPath_定制守护名() {
  const dir = i_createFixture({
    'manifest.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
    'scripts/tests/export/manifest.test.mjs': "import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nconst m = JSON.parse(fs.readFileSync(new URL('../../../manifest.json', import.meta.url), 'utf8'));\nassert.equal(m.name, 'fixture');\nassert.ok(Object.hasOwn(m.exports, 'x'));\n",
    'scripts/tests/export/eslint.config.test.mjs': f_LINT_GUARD,
  });
  try {
    const messages = await f_lint(dir, { packageJsonPath: 'manifest.json' });
    assert.deepEqual(messages, [], '定制清单路径应按约定名定位守护');
  } finally { fs.t_unmock(); }
});

/** 场景：锚点外文件不受检（规则只挂在包根 eslint.config.mjs 上）。 */
test('valid：锚点外文件不受检', async function test_valid_锚点外文件不受检() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
    'src/flow.mjs': 'export const f_a = 1;\n',
  });
  try {
    const messages = await f_lint(dir, {}, 'src/flow.mjs');
    assert.deepEqual(messages, [], '非锚点文件不应受检');
  } finally { fs.t_unmock(); }
});

/** 场景：守护测试文件不存在——按约定名报告缺守护（根配置守护在位，只缺清单守护）。 */
test('invalid：缺守护测试文件报告', async function test_invalid_缺守护测试文件报告() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
    'scripts/tests/export/eslint.config.test.mjs': f_LINT_GUARD,
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, '应恰好一条报告');
    assert.equal(messages[0].messageId, 'missingConfigTestFile', 'messageId 应为 missingConfigTestFile');
    assert.match(messages[0].message, /package\.test\.mjs/, '报告消息应含约定守护名');
  } finally { fs.t_unmock(); }
});

/** 场景：守护文件在但没有真实读取——纯提及/字面量对象不算读取证据。 */
test('invalid：无真实读取报告', async function test_invalid_无真实读取报告() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
    'scripts/tests/export/package.test.mjs': f_NO_READ_GUARD,
    'scripts/tests/export/eslint.config.test.mjs': f_LINT_GUARD,
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, '应恰好一条报告');
    assert.equal(messages[0].messageId, 'configTestNoRead', 'messageId 应为 configTestNoRead');
    assert.match(messages[0].message, /package\.json/, '报告消息应指向该配置');
  } finally { fs.t_unmock(); }
});

/** 场景：有真实读取但没有任何断言——读取不配断言不算守护。 */
test('invalid：有读取无断言报告', async function test_invalid_有读取无断言报告() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
    'scripts/tests/export/package.test.mjs': f_NO_ASSERT_GUARD,
    'scripts/tests/export/eslint.config.test.mjs': f_LINT_GUARD,
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, '应恰好一条报告');
    assert.equal(messages[0].messageId, 'configTestNoFieldAssertion', 'messageId 应为 configTestNoFieldAssertion');
    assert.match(messages[0].message, /name、exports/, '报告消息应含关键字段清单');
  } finally { fs.t_unmock(); }
});

/** 场景：有断言但不含关键字段（读取了清单，断言只写无关等式）。 */
test('invalid：断言不含关键字段报告', async function test_invalid_断言不含关键字段报告() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
    'scripts/tests/export/package.test.mjs': f_WRONG_FIELD_GUARD,
    'scripts/tests/export/eslint.config.test.mjs': f_LINT_GUARD,
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, '应恰好一条报告');
    assert.equal(messages[0].messageId, 'configTestNoFieldAssertion', 'messageId 应为 configTestNoFieldAssertion');
    assert.match(messages[0].message, /name、exports/, '报告消息应含关键字段清单');
  } finally { fs.t_unmock(); }
});

/** 场景：packageJsonPath 为绝对路径传入即抛（fail-loud，防配置错误静默失效）。 */
test('invalid：绝对路径 packageJsonPath 抛错', async function test_invalid_绝对路径_packageJsonPath_抛错() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
  });
  try {
    await assert.rejects(
      () => f_lint(dir, { packageJsonPath: '/absolute/package.json' }),
      /相对包根的相对路径/,
      '绝对路径 packageJsonPath 应抛错',
    );
  } finally { fs.t_unmock(); }
});

/** 场景：绝对路径 testDir 传入即抛（家族 fail-loud 口径）。 */
test('invalid：绝对路径 testDir 抛错', async function test_invalid_绝对路径_testDir_抛错() {
  const dir = i_createFixture({
    'package.json': f_MANIFEST,
    'eslint.config.mjs': 'export default [];\n',
  });
  try {
    await assert.rejects(
      () => f_lint(dir, { testDir: '/absolute/tests' }),
      /相对仓库根的相对路径/,
      '绝对 testDir 应抛错',
    );
  } finally { fs.t_unmock(); }
});

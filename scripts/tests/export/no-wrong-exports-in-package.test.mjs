// 入口面指向核验规则用例：跑在 package.json 上（JSON parser 接线）+ 目录关系判定，采用
// lite-fs 内存夹具驱动真实 Linter.verify 执行——每例独立项目路径（cwd = 夹具根，testDir 相对
// cwd 解析与家族前提约束一致）。覆盖：main/bin/exports 目标指向测试文件报告、指向
// buildToolDir 文件报告、exports 通配模式命中测试目录报告、指向生产文件放行、无声明放行、
// 绝对路径 testDir 抛错。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { Linter } from 'eslint';
import { t_createFixture } from '../lint-fixture.mjs';
import packageJsonPlugin from 'eslint-plugin-package-json';
import wrongExportsInPackage from 'atb-eslint-plugin/rules/no-wrong-exports-in-package.mjs';

// 真实 ESLint 执行：JSON parser 接线，lint 夹具 package.json，返回消息数组。
async function f_lint(dir, options = {}) {
  const linter = new Linter({ cwd: dir });
  const config = [{
    files: ['package.json'],
    languageOptions: { parser: packageJsonPlugin.configs.recommended.languageOptions.parser },
    plugins: { atb: { rules: { 'no-wrong-exports-in-package': wrongExportsInPackage } } },
    rules: { 'atb/no-wrong-exports-in-package': ['error', options] },
  }];
  const messages = linter.verify(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), config, { filename: path.resolve(dir, 'package.json') });
  return messages;
}

/** 场景：main/bin/exports 全部指向生产文件——放行。 */
test('valid：入口面指向生产文件放行', async () => {
  const dir = t_createFixture({
    'package.json': JSON.stringify({
      name: 'fixture',
      main: 'src/index.mjs',
      bin: { 'fixture-cli': 'src/cli.mjs' },
      exports: { '.': './src/index.mjs', './tool': './src/tool.mjs' },
    }),
    'src/index.mjs': 'export const x = 1;\n',
    'src/cli.mjs': 'export const y = 1;\n',
    'src/tool.mjs': 'export const z = 1;\n',
  });
  try {
    assert.deepEqual(await f_lint(dir), [], '生产目标不报');
  } finally { fs.t_unmock(); }
});

/** 场景：manifest 无入口声明（纯库/应用无面）——放行。 */
test('valid：无入口声明放行', async () => {
  const dir = t_createFixture({
    'package.json': JSON.stringify({ name: 'fixture' }),
    'src/a.mjs': 'export const x = 1;\n',
  });
  try {
    assert.deepEqual(await f_lint(dir), [], '无 bin/main/exports 不报');
  } finally { fs.t_unmock(); }
});

/** 场景：main 与 bin 指向测试文件（缺省 testDir='scripts/tests'）——各报一条。 */
test('invalid：main 与 bin 指向测试文件报告', async () => {
  const dir = t_createFixture({
    'package.json': JSON.stringify({
      name: 'fixture',
      main: 'scripts/tests/index.test.mjs',
      bin: { 'fixture-cli': './scripts/tests/cli.test.mjs' },
    }),
    'scripts/tests/index.test.mjs': 'export const t_x = 1;\n',
    'scripts/tests/cli.test.mjs': 'export const t_y = 1;\n',
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 2, 'main 与 bin 各报一条');
    for (const message of messages) {
      assert.equal(message.ruleId, 'atb/no-wrong-exports-in-package', "invalid：main 与 bin 指向测试文件报告：message.ruleId");
      assert.match(message.message, /测试文件/, "invalid：main 与 bin 指向测试文件报告：message.message");
    }
    assert.match(messages[0].message, /main/, "invalid：main 与 bin 指向测试文件报告：messages[0].message");
    assert.match(messages[1].message, /bin\/fixture-cli/, "invalid：main 与 bin 指向测试文件报告：messages[1].message");
  } finally { fs.t_unmock(); }
});

/** 场景：exports 目标指向测试文件与 buildToolDir 文件——各报一条。 */
test('invalid：exports 指向测试与构建工具文件报告', async () => {
  const dir = t_createFixture({
    'package.json': JSON.stringify({
      name: 'fixture',
      exports: { './test': './scripts/tests/helper.mjs', './build': './tools/build.mjs' },
    }),
    'scripts/tests/helper.mjs': 'export const t_h = 1;\n',
    'tools/build.mjs': 'export const t_b = 1;\n',
  });
  try {
    const messages = await f_lint(dir, { testDir: 'scripts/tests', buildToolDir: 'tools' });
    assert.equal(messages.length, 2, 'exports 两个目标各报一条');
    assert.match(messages[0].message, /测试文件/, "invalid：exports 指向测试与构建工具文件报告：messages[0].message");
    assert.match(messages[1].message, /构建工具文件/, "invalid：exports 指向测试与构建工具文件报告：messages[1].message");
  } finally { fs.t_unmock(); }
});

/** 场景：exports 通配模式可命中测试目录（探测文件匹配）——按模式报告。 */
test('invalid：exports 通配模式命中测试目录报告', async () => {
  const dir = t_createFixture({
    'package.json': JSON.stringify({ name: 'fixture', exports: { './*': './scripts/*' } }),
    'scripts/lib/a.mjs': 'export const x = 1;\n',
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, '通配模式命中测试目录应报一条');
    assert.match(messages[0].message, /通配模式/, "invalid：exports 通配模式命中测试目录报告：messages[0].message");
    assert.match(messages[0].message, /scripts\/\*/, "invalid：exports 通配模式命中测试目录报告：messages[0].message");
  } finally { fs.t_unmock(); }
});

/** 场景：自定义 testDir 后缺省目录不再命中——测试身份随 testDir 覆盖。 */
test('valid：testDir 覆盖后缺省目录放行', async () => {
  const dir = t_createFixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'scripts/tests/legacy.mjs' }),
    'scripts/tests/legacy.mjs': 'export const x = 1;\n',
  });
  try {
    assert.deepEqual(await f_lint(dir, { testDir: 'test' }), [], 'testDir 覆盖后原目录按生产放行');
  } finally { fs.t_unmock(); }
});

/** 场景：前提约束 fail-loud——绝对路径 testDir 在 create 阶段抛错。 */
test('invalid：绝对路径 testDir 抛错', async () => {
  const dir = t_createFixture({ 'package.json': JSON.stringify({ name: 'fixture' }) });
  try {
    await assert.rejects(
      () => f_lint(dir, { testDir: '/absolute/tests' }),
      /相对仓库根的相对路径/,
      '绝对 testDir 应抛错',
    );
  } finally { fs.t_unmock(); }
});

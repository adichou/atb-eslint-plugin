// 未使用依赖规则用例：跑在 package.json 上（JSON parser 接线），扫描 lite-fs 内存源文件。
// 经真实 Linter.verify 执行，每例独立项目路径（扫描结果进程级缓存以
// 包根为键，目录隔离）。覆盖：死运行时依赖报告、全消费放行、devDependencies 如实留白、
// 子路径导入归并包名、node_modules 排除面、optionalDependencies 同报。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { Linter } from 'eslint';
import { i_createFixture } from '../lint-fixture.mjs';
import packageJsonPlugin from 'eslint-plugin-package-json';
import unusedRuntimeDependenciesInPackage from 'atb-eslint-plugin/rules/no-unused-runtime-dependencies-in-package.mjs';

// 真实 ESLint 执行：JSON parser 接线，lint 夹具 package.json，返回消息数组。
async function f_lint(dir) {
  const linter = new Linter({ cwd: dir });
  const config = [{
    files: ['package.json'],
    languageOptions: { parser: packageJsonPlugin.configs.recommended.languageOptions.parser },
    plugins: { atb: { rules: { 'no-unused-runtime-dependencies-in-package': unusedRuntimeDependenciesInPackage } } },
    rules: { 'atb/no-unused-runtime-dependencies-in-package': 'error' },
  }];
  const messages = linter.verify(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), config, { filename: path.resolve(dir, 'package.json') });
  return messages;
}

/** 场景：dependencies 声明但包内无导入的死依赖报告；被导入的不报。 */
test('invalid：死运行时依赖报告', async function test_invalid_死运行时依赖报告() {
  const dir = i_createFixture({
    'package.json': JSON.stringify({ name: 'fixture', dependencies: { 'used-pkg': '1.0.0', 'dead-pkg': '1.0.0' } }),
    'src/a.mjs': "import 'used-pkg';\n",
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, '死依赖应报一条');
    assert.match(messages[0].message, /dead-pkg/, '应报告 dead-pkg');
    assert.equal(messages[0].ruleId, 'atb/no-unused-runtime-dependencies-in-package', "invalid：死运行时依赖报告：messages[0].ruleId");
  } finally { fs.t_unmock(); }
});

/** 场景：全消费放行；devDependencies 未导入不报（scripts/CLI 消费面，如实留白）。 */
test('valid：全消费与 devDependencies 留白', async function test_valid_全消费与_devDependencies_留白() {
  const dir = i_createFixture({
    'package.json': JSON.stringify({
      name: 'fixture',
      dependencies: { 'used-pkg': '1.0.0' },
      devDependencies: { 'dev-only': '1.0.0' },
    }),
    'src/a.mjs': "import 'used-pkg';\n",
  });
  try {
    assert.deepEqual(await f_lint(dir), [], '被导入的运行时依赖与未导入的 dev 依赖均不报');
  } finally { fs.t_unmock(); }
});

/** 场景：子路径导入归并到包名（used-pkg/sub.js 算 used-pkg 使用）。 */
test('valid：子路径导入归并包名', async function test_valid_子路径导入归并包名() {
  const dir = i_createFixture({
    'package.json': JSON.stringify({ name: 'fixture', dependencies: { 'used-pkg': '1.0.0' } }),
    'src/a.mjs': "import { x } from 'used-pkg/sub.js';\n",
  });
  try {
    assert.deepEqual(await f_lint(dir), [], '子路径导入应算包使用');
  } finally { fs.t_unmock(); }
});

/** 场景：node_modules 排除面——依赖包内部的导入不算本包使用。 */
test('invalid：node_modules 内导入不算使用', async function test_invalid_node_modules_内导入不算使用() {
  const dir = i_createFixture({
    'package.json': JSON.stringify({ name: 'fixture', dependencies: { 'dead-pkg': '1.0.0' } }),
    'node_modules/other/index.js': "import 'dead-pkg';\n",
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, 'node_modules 内导入不应让 dead-pkg 免报');
    assert.match(messages[0].message, /dead-pkg/, "invalid：node_modules 内导入不算使用：messages[0].message");
  } finally { fs.t_unmock(); }
});

/** 场景：optionalDependencies 与 dependencies 同口径报告死声明。 */
test('invalid：optionalDependencies 死声明报告', async function test_invalid_optionalDependencies_死声明报告() {
  const dir = i_createFixture({
    'package.json': JSON.stringify({ name: 'fixture', optionalDependencies: { 'dead-optional': '1.0.0' } }),
    'src/a.mjs': 'export const x = 1;\n',
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, 'optional 死依赖应报一条');
    assert.match(messages[0].message, /dead-optional/, "invalid：optionalDependencies 死声明报告：messages[0].message");
    assert.match(messages[0].message, /optionalDependencies/, '报告应标明分组');
  } finally { fs.t_unmock(); }
});

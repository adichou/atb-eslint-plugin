// 同时启用全部新规则，验证诊断归属和默认接线；不接受旧综合规则别名。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import plugin from 'atb-eslint-plugin';
import { createConfig } from 'atb-eslint-plugin/config.mjs';
import { i_createFixture } from '../lint-fixture.mjs';
import { i_QUALITY_RULES, i_BOUNDARY_RULES, i_MESSAGE_RULES, i_qualitySettings } from '../rule-groups.mjs';

const f_CASES = [
  ['reducedExecution', "/** 场景：核对结果 */\nimport { test } from 'node:test';\n/** 场景：核对结果 */\ntest.only('用例', function testResult() { assert.ok(value, '应有结果'); });"],
  ['missingTestCallbackName', "import { test } from 'node:test';\n/** 场景：核对结果 */\ntest('用例', () => { assert.ok(value, '应有结果'); });"],
  ['missingScenario', "import { test } from 'node:test'; test('用例', function testResult() { assert.ok(value, '应有结果'); });"],
  ['missingAssertion', "import { test } from 'node:test';\n/** 场景：核对结果 */\ntest('用例', function testResult() { operate(); });"],
  ['unawaitedOperation', 'async function operate() { return value; } operate();'],
  ['fixedSleep', 'new Promise(resolve => setTimeout(resolve, 50));'],
  ['unregisteredInject', "import lite from 'litenvi-node/lite-fs.mjs'; lite.t_inject({ code: 'EACCES' });"],
  ['routeStub', "import { chromium } from 'playwright'; const page = await (await chromium.launch()).newPage(); await page.route('/api', () => {});"],
  ['businessReplacement', "import api from '../../../src/api.mjs'; api.save = () => 1;"],
  ['testFileDependency', "import '../other.test.mjs';"],
  ['observationMutation', "import cp from 'litenvi-node/lite-child_process.mjs'; cp.t_calls().pop();"],
  ['missingHookReset', "import mgr from 'litenvi-node/lite-cmd-mgr.mjs'; mgr.command('node').t_onRun(() => ({}));"],
  ['globalStateLeak', "process.env.ATB_CATEGORY = 'changed';"],
];
for (const [messageId, code] of f_CASES) {
  /** 场景：每类违规只由对应的独立规则报告，其他同时启用的类别不串扰。 */
  test(messageId, function testCategoryDiagnosticOwner() {
    const root = i_createFixture({ 'package.json': '{"name":"fixture","type":"module"}', 'src/api.mjs': 'export default { save() {} };', 'scripts/tests/other.test.mjs': '' });
    try {
      const actual = new Linter({ cwd: root }).verify("import assert from 'node:assert/strict';\n" + code, [{
        files: ['**/*.mjs'], plugins: { atb: plugin },
        rules: { ...i_qualitySettings(), ...Object.fromEntries(i_BOUNDARY_RULES.map(rule => [`atb/${rule}`, 'error'])) },
      }], { filename: path.join(root, 'scripts/tests/export/category.test.mjs') });
      assert.deepEqual(actual.map(item => [item.ruleId, item.messageId]), [[i_MESSAGE_RULES[messageId], messageId]], '诊断必须归入对应类别且只报告一次');
    } finally { fs.t_unmock(); }
  });
}

/** 场景：默认工厂完整启用拆分规则，旧综合规则不保留入口或命名导出。 */
test('默认配置只注册独立类别', function testCategoryDefaults() {
  const config = createConfig();
  for (const name of [...i_QUALITY_RULES, ...i_BOUNDARY_RULES]) {
    assert.ok(plugin.rules[name]?.create, `${name}应提供独立规则实现`);
    const setting = config.find(block => block.rules?.[`atb/${name}`])?.rules[`atb/${name}`];
    assert.equal(Array.isArray(setting) ? setting[0] : setting, 'error', `${name}应默认启用`);
  }
  for (const name of ['no-bad-patterns-in-test', 'no-boundary-violations-in-test']) {
    assert.equal(plugin.rules[name], undefined, `${name}不应保留综合规则别名`);
    assert.ok(!config.some(block => block.rules?.[`atb/${name}`]), '默认配置不得接线旧规则');
  }
});

/** 场景：自定义测试目录经工厂传到全部隔离规则，默认旧目录不会继续受检。 */
test('自定义测试目录保持分类边界', function testCustomCategoryDirectory() {
  const root = i_createFixture({
    'package.json': '{"name":"fixture","type":"module"}', 'src/api.mjs': 'export default { save() {} };',
    'custom/testing/other.test.mjs': '',
  });
  try {
    const config = createConfig({ testDir: 'custom/testing' }).filter(block => block.plugins || i_BOUNDARY_RULES.some(name => block.rules?.[`atb/${name}`]));
    for (const [messageId, code] of f_CASES.filter(([id]) => i_BOUNDARY_RULES.some(name => i_MESSAGE_RULES[id] === `atb/${name}`))) {
      const linter = new Linter({ cwd: root });
      const inside = linter.verify(code, config, { filename: path.join(root, 'custom/testing/export/sample.mjs') });
      assert.deepEqual(inside.map(item => [item.ruleId, item.messageId]), [[i_MESSAGE_RULES[messageId], messageId]], '自定义目录内应保留对应边界检查');
      const outside = linter.verify(code, config, { filename: path.join(root, 'scripts/tests/export/sample.mjs') });
      assert.deepEqual(outside, [], '自定义目录生效后不应再把旧目录视为测试边界');
    }
  } finally { fs.t_unmock(); }
});

/** 场景：拆分后的选项只属于对应职责，无关类别和旧页面包装不能接受。 */
test('分类选项只属于相应规则', function testCategoryOptionOwnership() {
  const cases = [
    ['no-invalid-test-definition', { allowedTestOptions: ['timeout'] }, { requireItemNumber: true }],
    ['no-missing-test-comment', { requireItemNumber: true }, { allowedTestOptions: [] }],
    ['no-fake-page-interactions-in-test', { routeStub: false, banDirectHttp: true }, { pageInteraction: { routeStub: false } }],
  ];
  for (const [name, valid, invalid] of cases) {
    const linter = new Linter();
    const config = options => [{ plugins: { atb: plugin }, rules: { [`atb/${name}`]: ['error', options] } }];
    assert.deepEqual(linter.verify('', config(valid)), [], `${name}应接受自身职责的选项`);
    assert.throws(() => linter.verify('', config(invalid)), /properties|property/i, `${name}应拒绝其他职责或已移除的包装选项`);
  }
});

// config 分区必须验证登记配置的实际读取结果，不能靠文件名、路径字符串或假对象绕过。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import entryRule from 'atb-eslint-plugin/rules/no-undeclared-entry-in-test.mjs';
import { i_createFixture } from '../lint-fixture.mjs';

const f_READ = "import fs from 'litenvi-node/lite-fs.mjs'; const config = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));";

// 私有：运行实际入口规则，所有项目文件都在内存卷中。
function f_check(code, filename = 'package.test.mjs') {
  const root = i_createFixture({ 'package.json': '{"name":"fixture"}', 'eslint.config.mjs': 'export default [{rules:{}}];' });
  try {
    const linter = new Linter({ cwd: root });
    return linter.verify(code, [{ files: ['**/*.mjs'], plugins: { atb: { rules: { entry: entryRule } } }, rules: { 'atb/entry': 'error' } }], { filename: path.join(root, 'scripts/tests/config', filename) }).map(message => message.messageId);
  } finally { fs.t_unmock(); }
}

const f_CASES = [
  { name: '读取清单并断言 name 字段', code: "import assert from 'node:assert/strict';" + f_READ + "assert.equal(config.name, 'fixture');", expected: [] },
  { name: '导入实际根配置并断言 rules', filename: 'eslint.config.test.mjs', code: "import assert from 'node:assert/strict'; import cfg from '../../../eslint.config.mjs'; assert.ok(cfg.some(block => block.rules));", expected: [] },
  { name: '配置文件名不在登记范围', filename: 'arbitrary.test.mjs', code: "import assert from 'node:assert/strict';" + f_READ + "assert.ok(config.name);", expected: ['undeclaredConfigTest'] },
  { name: '只有路径字符串不能代替读取', code: "import assert from 'node:assert/strict'; const file = new URL('../../../package.json', import.meta.url); assert.ok({name:'fake'}.name);", expected: ['configTestNoRead'] },
  { name: '真实读取后断言假对象仍拒绝', code: "import assert from 'node:assert/strict';" + f_READ + "assert.equal({name:'fake'}.name,'fake');", expected: ['configTestNoFieldAssertion'] },
  { name: 'Array.isArray 包裹假配置不能冒用真实读取', code: "import assert from 'node:assert/strict';" + f_READ + "assert.ok(Array.isArray({exports:[]}.exports));", expected: ['configTestNoFieldAssertion'] },
  { name: '断言说明里提及 name 不算关键字段', code: "import assert from 'node:assert/strict';" + f_READ + "assert.ok(1, 'name 应在位');", expected: ['configTestNoFieldAssertion'] },
  { name: '读取与断言未调用函数中的配置不能作证', code: "import assert from 'node:assert/strict'; import fs from 'litenvi-node/lite-fs.mjs'; function unused() { const cfg=JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url))); assert.ok(cfg.name); }", expected: ['configTestNoRead'] },
  { name: '同名 readFileSync 普通对象不冒认文件读取', code: "import assert from 'node:assert/strict'; const fs={readFileSync(){return '{\"name\":\"fake\"}';}}; const cfg=JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url))); assert.ok(cfg.name);", expected: ['configTestNoRead'] },
  { name: '测试回调中的实际读取与断言可识别', code: "import {test} from 'node:test'; import assert from 'node:assert/strict'; import fs from 'litenvi-node/lite-fs.mjs'; test('配置',()=>{const cfg=JSON.parse(fs.readFileSync(new URL('../../../package.json',import.meta.url)));assert.ok(cfg.name);});", expected: [] },
  { name: '同名局部假配置不能冒用外层读取来源', code: "import {test} from 'node:test'; import assert from 'node:assert/strict';" + f_READ + "test('假配置',()=>{const config={name:'fake'};assert.ok(config.name);});", expected: ['configTestNoFieldAssertion'] },
  { name: '解构出的局部假配置不能冒用外层来源', code: "import {test} from 'node:test'; import assert from 'node:assert/strict';" + f_READ + "test('假配置',()=>{const {config}={config:{name:'fake'}};assert.ok(config.name);});", expected: ['configTestNoFieldAssertion'] },
  { name: '真实配置解构后的关键字段仍可断言', code: "import assert from 'node:assert/strict';" + f_READ + "const {name}=config; assert.equal(name,'fixture');", expected: [] },
];
for (const scenario of f_CASES) {
  /** 场景：config 用例按实际配置读取与断言数据来源判定。 */
  test(scenario.name, function test_config_partition_scenario_name() {
    assert.deepEqual(f_check(scenario.code, scenario.filename), scenario.expected, `${scenario.name}：应按配置证据判定`);
  });
}

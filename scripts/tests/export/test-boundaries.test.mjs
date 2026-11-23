// 架构规则通过真实 Linter 与内存项目验证，不执行受检业务字符串。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import rule from 'atb-eslint-plugin/rules/no-boundary-violations-in-test.mjs';
import { i_createFixture } from '../lint-fixture.mjs';

const f_CASES = [
  ['业务方法被 mock 替换', "import { mock } from 'node:test'; import api from '../../../src/api.mjs'; mock.method(api, 'save', () => 1);", ['businessReplacement']],
  ['直接赋值替换业务方法', "import api from '../../../src/api.mjs'; api.save = () => 1;", ['businessReplacement']],
  ['定义属性替换业务方法', "import api from '../../../src/api.mjs'; Object.defineProperty(api, 'save', { value: () => 1 });", ['businessReplacement']],
  ['TestContext mock 同样不能替换业务', "import {test} from 'node:test'; import api from '../../../src/api.mjs'; test('场景', t => {t.mock.method(api, 'save', () => 1);});", ['businessReplacement']],
  ['具名 fs 写入也属于加载副作用', "import {writeFileSync} from 'litenvi-node/lite-fs.mjs'; writeFileSync('/x', 'x');", ['moduleLoadSideEffect'], 'src/lib/store.mjs'],
  ['原生 process 别名不能绕过恢复', "import native from 'process'; native.env.ATB_EXAMPLE = 'yes';", ['globalStateLeak']],
  ['普通数据属性定义不等于业务替换', "import api from '../../../src/api.mjs'; Object.defineProperty(api, 'enabled', {value: true});", []],
  ['只记录调用不替换业务逻辑', "import { mock } from 'node:test'; import api from '../../../src/api.mjs'; mock.method(api, 'save');", []],
  ['测试专用门面允许装配', "import cp from 'litenvi-node/lite-child_process.mjs'; cp.t_mock();", []],
  ['普通同名 mock 方法不误报', "const mock = { method() {} }; mock.method({}, 'save', () => 1);", []],
  ['测试文件不能导入另一测试文件', "import '../other.test.mjs';", ['testFileDependency']],
  ['共享 helper 可以导入', "import { t_read } from '../helper.mjs'; t_read();", []],
  ['生产代码不能依赖测试准备', "import '../scripts/tests/helper.mjs';", ['productionDependsOnTests'], 'src/main.mjs'],
  ['内部库不能反向依赖声明命令', "import '../cli.mjs';", ['reverseEntryDependency'], 'src/lib/store.mjs'],
  ['公共账本不能改写', "import server from 'litenvi-node/lite-server.mjs'; const records = server.t_requests(); records[0].status = 200;", ['observationMutation']],
  ['观测字段读取允许', "import server from 'litenvi-node/lite-server.mjs'; console.log(server.t_requests()[0]?.status);", []],
  ['调用账本是独立快照，允许验证防御性复制', "import cp from 'litenvi-node/lite-child_process.mjs'; const snapshot = cp.t_calls(); snapshot.pop();", []],
  ['可写环境数据不等于业务方法替换', "import api from '../../../src/api.mjs'; api.env.VALUE = 'yes';", []],
  ['普通对象字段不冒认账本', "const records = [{}]; records[0].status = 200;", []],
  ['命令钩子必须复位', "import mgr from 'litenvi-node/lite-cmd-mgr.mjs'; mgr.command('node').t_onRun(() => ({ status: 0 }));", ['missingHookReset']],
  ['finally 中复位命令钩子', "import mgr from 'litenvi-node/lite-cmd-mgr.mjs'; try { mgr.command('node').t_onRun(() => ({ status: 0 })); } finally { mgr.command('node').t_onRun(null); }", []],
  ['TestContext 经实际 helper 调用仍能归因', "import { test } from 'node:test'; import mgr from 'litenvi-node/lite-cmd-mgr.mjs'; function setup(t) { mgr.command('node').t_onRun(() => ({})); t.after(() => mgr.command('node').t_onRun(null)); } test('setup', t => setup(t));", []],
  ['未调用函数里的复位不算清理', "import mgr from 'litenvi-node/lite-cmd-mgr.mjs'; mgr.command('node').t_onRun(() => ({ status: 0 })); function unused() { mgr.command('node').t_onRun(null); }", ['missingHookReset']],
  ['不同命令的复位不能顶替', "import mgr from 'litenvi-node/lite-cmd-mgr.mjs'; try { mgr.command('node').t_onRun(() => ({})); } finally { mgr.command('git').t_onRun(null); }", ['missingHookReset']],
  ['环境变量修改必须恢复', "process.env.ATB_EXAMPLE = 'yes';", ['globalStateLeak']],
  ['finally 恢复环境变量', "const old = process.env.ATB_EXAMPLE; try { process.env.ATB_EXAMPLE = 'yes'; } finally { if (old === undefined) delete process.env.ATB_EXAMPLE; else process.env.ATB_EXAMPLE = old; }", []],
  ['影子 process 不误报', "const process = { env: {} }; process.env.ATB_EXAMPLE = 'yes';", []],
  ['内部库不能在加载时写盘', "import fs from 'litenvi-node/lite-fs.mjs'; fs.writeFileSync('/x', 'x');", ['moduleLoadSideEffect'], 'src/lib/store.mjs'],
  ['函数内的业务写盘允许', "import fs from 'litenvi-node/lite-fs.mjs'; export function save() { fs.writeFileSync('/x', 'x'); }", [], 'src/lib/store.mjs'],
];
for (const [name, code, expected, relative = 'scripts/tests/export/sample.test.mjs'] of f_CASES) {
  /** 场景：按真实模块与可确认的清理位置检查边界，不凭对象变量名判断。 */
  test(name, () => {
    const root = i_createFixture({
      'package.json': JSON.stringify({ name: 'fixture', exports: { '.': './src/api.mjs' }, bin: { cli: './src/cli.mjs' } }),
      'src/api.mjs': 'export default { save() {} };', 'src/cli.mjs': '',
      'scripts/tests/other.test.mjs': '', 'scripts/tests/helper.mjs': 'export function t_read() {}',
    });
    try {
      const actual = new Linter({ cwd: root }).verify(code, [{ files: ['**/*.mjs'], plugins: { atb: { rules: { boundaries: rule } } }, rules: { 'atb/boundaries': ['error', { libDir: 'src/lib' }] } }], { filename: path.join(root, relative) });
      assert.deepEqual(actual.map(message => message.messageId), expected, `${name}：应准确报告对应架构问题`);
    } finally { fs.t_unmock(); }
  });
}

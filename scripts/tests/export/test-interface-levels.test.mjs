// 通过真实 Linter 与内存项目验证生产/测试两侧的 i_ 隔离及对外 t_ 入口。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import access from 'atb-eslint-plugin/rules/no-out-of-level-access.mjs';
import levels from 'atb-eslint-plugin/rules/no-wrong-access-level.mjs';
import unused from 'atb-eslint-plugin/rules/no-unused-exports.mjs';
import wrongEntries from 'atb-eslint-plugin/rules/no-wrong-exports-in-package.mjs';
import packageJsonPlugin from 'eslint-plugin-package-json';
import { i_createFixture } from '../lint-fixture.mjs';

const f_CASES = [
  ['测试侧 i_ 具名导入', 'scripts/tests/a.test.mjs', "import { i_build } from './helper.mjs'; i_build();", []],
  ['生产侧 i_ 具名导入', 'src/app.mjs', "import { i_work } from './work.mjs'; i_work();", []],
  ['生产访问测试侧 i_', 'src/app.mjs', "import { i_build } from '../scripts/tests/helper.mjs';", ['productionDependsOnTests']],
  ['测试访问生产侧 i_', 'scripts/tests/a.test.mjs', "import { i_work } from '../../src/work.mjs';", ['testInternalAccess']],
  ['测试模块别名成员', 'scripts/tests/a.test.mjs', "import helper from './helper.mjs'; const h = helper; const { i_build: build } = h; build();", []],
  ['生产模块别名不能绕过', 'src/app.mjs', "import helper from '../scripts/tests/helper.mjs'; helper['i_build']();", ['productionDependsOnTests']],
  ['测试侧再导出内部接口', 'scripts/tests/helpers.mjs', "export { i_build } from './helper.mjs';", []],
  ['生产侧再导出测试内部接口', 'src/app.mjs', "export { i_build } from '../scripts/tests/helper.mjs';", ['productionDependsOnTests']],
  ['包自引用测试内部模块', 'scripts/tests/a.test.mjs', "import { i_build } from 'fixture/internal';", []],
  ['跨包 i_ 禁止', 'scripts/tests/a.test.mjs', "import { i_build } from 'other';", ['externalInternalAccess']],
  ['嵌套包的 i_ 也不能由生产访问', 'src/app.mjs', "import { i_work } from '../nested/work.mjs';", ['crossPackagePath']],
  ['嵌套包的 i_ 也不能由测试访问', 'scripts/tests/a.test.mjs', "import { i_work } from '../../nested/work.mjs';", ['crossPackagePath']],
  ['跨包默认成员 i_ 禁止', 'scripts/tests/a.test.mjs', "import other from 'other'; other.i_build();", ['externalInternalAccess']],
  ['对外 t_ 测试可调用', 'scripts/tests/a.test.mjs', "import { t_build } from 'other'; t_build();", []],
  ['对外 t_ 生产不可调用', 'src/app.mjs', "import { t_build } from 'other';", ['testOnlyAccess']],
  ['f_ 依然不可跨文件', 'scripts/tests/a.test.mjs', "import { f_build } from './helper.mjs';", ['filePrivateAccess']],
];
for (const [name, relative, code, expected] of f_CASES) {
  /** 场景：i_ 仅在同包同侧协作，命名别名和模块成员不改变原始来源。 */
  test(name, function test_test_interface_levels_name() {
    const root = i_createFixture({ 'package.json': JSON.stringify({ name: 'fixture', exports: { './internal': './scripts/tests/helper.mjs' } }), 'scripts/tests/helper.mjs': '', 'src/work.mjs': '', 'nested/package.json': '{"name":"nested"}', 'nested/work.mjs': '' });
    try {
      const config = [{ files: ['**/*.mjs'], plugins: { atb: { rules: { access } } }, rules: { 'atb/access': ['error', { testDir: 'scripts/tests' }] } }];
      const actual = new Linter({ cwd: root }).verify(code, config, { filename: path.join(root, relative) });
      assert.deepEqual(actual.map(message => message.messageId), expected, `${name}应遵守提供方与调用方的角色边界`);
    } finally { fs.t_unmock(); }
  });
}

const f_EXPORTS = [
  ['包内测试 helper 用 i_', 'scripts/tests/helper.mjs', 'export function i_build() {}', []],
  ['测试 t_ 未登记入口', 'scripts/tests/helper.mjs', 'export function t_build() {}', ['publicExportOffFace']],
  ['测试 t_ 已登记入口', 'scripts/tests/public.mjs', 'export function t_build() {}', []],
  ['测试公开名仍不允许', 'scripts/tests/helper.mjs', 'export function build() {}', ['testExportLevel']],
  ['测试 f_ 不能导出', 'scripts/tests/helper.mjs', 'export function f_build() {}', ['testExportLevel']],
  ['测试侧 i_ 别名导出', 'scripts/tests/helper.mjs', 'function i_build() {} export { i_build as i_world };', []],
  ['对外测试句柄不能泄露 i_', 'scripts/tests/public.mjs', 'export function t_build() { return { i_secret() {} }; }', ['returnLevelExceed']],
];
for (const [name, relative, code, expected] of f_EXPORTS) {
  /** 场景：测试内部接口无需对外登记；对外 t_ 必须匹配真实的包导入入口。 */
  test(name, function test_test_interface_levels_name_2() {
    const root = i_createFixture({ 'package.json': JSON.stringify({ name: 'fixture', exports: { './test': './scripts/tests/public.mjs' } }) });
    try {
      const actual = new Linter({ cwd: root }).verify(code, [{ files: ['**/*.mjs'], plugins: { atb: { rules: { levels } } }, rules: { 'atb/levels': ['error', { testDir: 'scripts/tests' }] } }], { filename: path.join(root, relative) });
      assert.deepEqual(actual.map(message => message.messageId), expected, `${name}的导出声明应按内部或对外用途检查`);
    } finally { fs.t_unmock(); }
  });
}

/** 场景：显式发布的测试辅助模块可供包外测试使用，内部 i_ 仍须有本包消费者。 */
test('测试对外入口、清单守护和死导出分类保持一致', function test_测试对外入口_清单守护和死导出分类保持一致() {
  const root = i_createFixture({
    'package.json': JSON.stringify({ name: 'fixture', exports: './scripts/tests/public.mjs' }),
    'scripts/tests/public.mjs': 'export function t_build() {} export function i_unused() {}',
  });
  try {
    const config = [{ files: ['**/*.mjs'], plugins: { atb: { rules: { levels, unused } } }, rules: { 'atb/levels': ['error', { testDir: 'scripts/tests' }], 'atb/unused': ['error', { testDir: 'scripts/tests' }] } }];
    const actual = new Linter({ cwd: root }).verify(fs.readFileSync(`${root}/scripts/tests/public.mjs`, 'utf8'), config, { filename: `${root}/scripts/tests/public.mjs` });
    assert.deepEqual(actual.map(message => message.messageId), ['unusedInternalOnFace'], '对外 t_ 允许包外消费，未使用的 i_ 仍必须报告');
    const jsonConfig = [{ files: ['package.json'], languageOptions: { parser: packageJsonPlugin.configs.recommended.languageOptions.parser }, plugins: { atb: { rules: { wrongEntries } } }, rules: { 'atb/wrongEntries': ['error', { testDir: 'scripts/tests' }] } }];
    const linter = new Linter({ cwd: root });
    const allowed = linter.verify(JSON.stringify({ name: 'fixture', exports: { './testing': './scripts/tests/public.mjs' } }), jsonConfig, { filename: `${root}/package.json` });
    assert.deepEqual(allowed, [], '精确登记测试辅助模块应允许');
    const runnable = linter.verify(JSON.stringify({ name: 'fixture', exports: { './suite': './scripts/tests/suite.test.mjs' } }), jsonConfig, { filename: `${root}/package.json` });
    assert.deepEqual(runnable.map(message => message.messageId), ['faceTargetInternal'], '可执行测试文件不能成为包接口');
    const sugar = linter.verify(JSON.stringify({ name: 'fixture', exports: './scripts/tests/suite.test.mjs' }), jsonConfig, { filename: `${root}/package.json` });
    assert.deepEqual(sugar.map(message => message.messageId), ['faceTargetInternal'], '字符串 exports 不能绕过可执行测试入口限制');
    const nestedPattern = linter.verify(JSON.stringify({ name: 'fixture', exports: { './testing/*': './scripts/tests/lib/*.mjs' } }), jsonConfig, { filename: `${root}/package.json` });
    assert.deepEqual(nestedPattern.map(message => message.messageId), ['patternTargetInternal'], '测试目录下子目录的宽泛模式也不能发布用例');
    const command = linter.verify(JSON.stringify({ name: 'fixture', bin: { test: './scripts/tests/public.mjs' } }), jsonConfig, { filename: `${root}/package.json` });
    assert.deepEqual(command.map(message => message.messageId), ['faceTargetInternal'], '测试辅助模块不能登记成业务命令');
  } finally { fs.t_unmock(); }
});

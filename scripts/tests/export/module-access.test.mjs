// 模块加载与接口权限按先后顺序检查；真实 Linter 读取独立内存包，不执行受检模块。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import access from 'atb-eslint-plugin/rules/no-out-of-level-access.mjs';
import testCaseImports from 'atb-eslint-plugin/rules/no-test-case-imports-in-test.mjs';
import { i_createFixture } from '../lint-fixture.mjs';

const f_CASES = [
  { name: '同包纯副作用导入', code: "import './work.mjs';" },
  { name: '同包路径规范化后仍允许', code: "import './nested/../work.mjs';" },
  { name: '同包绝对路径', code: root => 'import ' + JSON.stringify(root + '/src/work.mjs') + ';' },
  { name: '同包 file URL', code: root => 'import ' + JSON.stringify(pathToFileURL(root + '/src/work.mjs').href) + ';' },
  { name: '同包 require 常量', file: 'src/app.cjs', code: "const name = './work.mjs'; require(name);" },
  { name: '同包动态模板与拼接', code: "const stem = './work'; const ext = '.mjs'; import(`${stem}${ext}`);" },
  { name: '同包 URL 构造', code: "import(new URL('./work.mjs', import.meta.url));" },
  { name: '同包真实 path 别名构造', code: "import { join as build } from 'node:path'; import(build(import.meta.dirname, 'work.mjs'));" },
  { name: '包名引用外部入口', code: "import 'other';" },
  { name: '包名引用外部公开子路径', code: "import { run } from 'other/public'; run();" },
  { name: '包名引用 scoped 包', code: "import '@scope/other';" },
  { name: '包名自引用生产入口', code: "import { i_work } from 'fixture/work';" },
  { name: '测试侧可导入普通 helper', file: 'scripts/tests/export/a.test.mjs', code: "import { i_build } from '../helper.mjs';" },
  { name: '测试间依赖仍交给边界规则', file: 'scripts/tests/export/a.test.mjs', code: "import '../other.test.mjs';" },
  { name: '测试通过包名使用外部 t_', file: 'scripts/tests/export/a.test.mjs', code: "import { t_build } from 'other';" },
  { name: '真实内置模块不当作跨包路径', code: "import 'node:path'; import 'path'; import('node:url');" },
  { name: '影子 require 不误判', code: "function f_use(require) { require('../nested/public.mjs'); }" },
  { name: '影子 createRequire 不误判', code: "function createRequire() { return () => 1; } createRequire('x')('../nested/public.mjs');" },
  { name: '同包 imports 别名', code: "import '#work';" },
  { name: 'imports 包名别名仍按包名加载', code: "import '#other';" },
  { name: 'createRequire 的包自引用按解析基准所属包判断', code: "import { createRequire } from 'node:module'; const load = createRequire(new URL('../nested/anchor.cjs', import.meta.url)); load('linked');" },
  { name: '跨嵌套包副作用导入', code: "import '../nested/public.mjs';", expected: ['crossPackagePath'] },
  { name: '跨包的公开文件也不能走路径', code: "import { run } from '../nested/public.mjs';", expected: ['crossPackagePath'] },
  { name: '跨包路径先于 i_ 接口报错', code: "import { i_work } from '../nested/public.mjs';", expected: ['crossPackagePath'] },
  { name: '跨包路径成员调用不重复报错', code: "import other from '../nested/public.mjs'; other.i_work(); other.t_build();", expected: ['crossPackagePath'] },
  { name: '跨包绝对路径', code: root => 'import ' + JSON.stringify(root + '/nested/public.mjs') + ';', expected: ['crossPackagePath'] },
  { name: '跨包 file URL', code: root => 'import ' + JSON.stringify(pathToFileURL(root + '/nested/public.mjs').href) + ';', expected: ['crossPackagePath'] },
  { name: '通过 node_modules 路径绕过入口', code: "import '../node_modules/other/public.mjs';", expected: ['crossPackagePath'] },
  { name: '跨包星号再导出', code: "export * from '../nested/public.mjs';", expected: ['crossPackagePath'] },
  { name: '跨包具名再导出', code: "export { run } from '../nested/public.mjs';", expected: ['crossPackagePath'] },
  { name: '跨包动态导入', code: "import('../nested/public.mjs');", expected: ['crossPackagePath'] },
  { name: '跨包动态拼接', code: "const stem = '../nested/'; import(stem + 'public.mjs');", expected: ['crossPackagePath'] },
  { name: '跨包 URL 常量', code: "const url = new URL('../nested/public.mjs', import.meta.url); import(url.href);", expected: ['crossPackagePath'] },
  { name: '跨包 require', file: 'src/app.cjs', code: "require('../nested/public.mjs');", expected: ['crossPackagePath'] },
  { name: '跨包 require 别名', file: 'src/app.cjs', code: "const load = require; load('../nested/public.mjs');", expected: ['crossPackagePath'] },
  { name: '跨包 module.require', file: 'src/app.cjs', code: "module.require('../nested/public.mjs');", expected: ['crossPackagePath'] },
  { name: 'createRequire 改名导入', code: "import { createRequire as make } from 'node:module'; const load = make(import.meta.url); load('../nested/public.mjs');", expected: ['crossPackagePath'] },
  { name: 'createRequire 默认对象解构', code: "import mod from 'node:module'; const { createRequire: make } = mod; make(import.meta.url)('../nested/public.mjs');", expected: ['crossPackagePath'] },
  { name: 'createRequire 保留真实解析基准', code: "import { createRequire } from 'node:module'; const load = createRequire(new URL('../nested/anchor.cjs', import.meta.url)); load('./public.mjs');", expected: ['crossPackagePath'] },
  { name: 'require call 不能绕过', file: 'src/app.cjs', code: "require.call(null, '../nested/public.mjs');", expected: ['crossPackagePath'] },
  { name: 'require apply 不能绕过', file: 'src/app.cjs', code: "require.apply(null, ['../nested/public.mjs']);", expected: ['crossPackagePath'] },
  { name: 'require bind 不能绕过', file: 'src/app.cjs', code: "const load = require.bind(null, '../nested/public.mjs'); load();", expected: ['crossPackagePath'] },
  { name: '包名加载后仍禁止外部 i_', code: "import { i_work } from 'other';", expected: ['externalInternalAccess'] },
  { name: '包名加载后仍禁止生产 t_', code: "import { t_build } from 'other';", expected: ['testOnlyAccess'] },
  { name: '生产不能副作用加载测试 helper', code: "import '../scripts/tests/helper.mjs';", expected: ['productionDependsOnTests'] },
  { name: '生产不能加载可执行测试', code: "import '../scripts/tests/other.test.mjs';", expected: ['productionDependsOnTests'] },
  { name: '生产不能加载目录外遗留可执行测试', code: "import './legacy.test.mjs';", expected: ['productionDependsOnTests'] },
  { name: '生产不能通过公开名加载测试 helper', code: "import { run } from '../scripts/tests/helper.mjs';", expected: ['productionDependsOnTests'] },
  { name: '生产默认导入测试 helper 不双报', code: "import helper from '../scripts/tests/helper.mjs'; helper.i_build();", expected: ['productionDependsOnTests'] },
  { name: '生产不能动态加载测试 helper', code: "import('../scripts/tests/helper.mjs');", expected: ['productionDependsOnTests'] },
  { name: '生产不能 require 测试 helper', file: 'src/app.cjs', code: "require('../scripts/tests/helper.mjs');", expected: ['productionDependsOnTests'] },
  { name: '生产不能再导出测试 helper', code: "export * from '../scripts/tests/helper.mjs';", expected: ['productionDependsOnTests'] },
  { name: '包自引用不能绕过测试目录边界', code: "import 'fixture/testing';", expected: ['productionDependsOnTests'] },
  { name: 'imports 别名不能绕过测试目录边界', code: "import '#test';", expected: ['productionDependsOnTests'] },
  { name: '包名导入依赖的测试目录同样禁止', code: "import 'other/testing';", expected: ['productionDependsOnTests'] },
  { name: '条件出口不能混淆 import 与 require 角色', code: "import 'other/conditional';" },
  { name: 'require 条件实际为测试目录则禁止', file: 'src/app.cjs', code: "require('other/conditional');", expected: ['productionDependsOnTests'] },
  { name: '软链接逃向其他包', code: "import './link/public.mjs';", links: [['nested', 'src/link']], expected: ['crossPackagePath'] },
  { name: '同包软链接允许', code: "import './alias.mjs';", links: [['src/work.mjs', 'src/alias.mjs']] },
  { name: '软链接到测试目录不能绕过', code: "import './helper.mjs';", links: [['scripts/tests/helper.mjs', 'src/helper.mjs']], expected: ['productionDependsOnTests'] },
  { name: '节点包目录软链仍可通过包名加载', code: "import 'linked';", links: [['nested', 'node_modules/linked']] },
];

for (const entry of f_CASES) {
  /** 场景：同包路径允许，跨包只走包名，模块违规先于接口级别报告。 */
  test(entry.name, function test_module_access_entry_name() {
    const root = i_createFixture({
      'package.json': JSON.stringify({ name: 'fixture', type: 'module', exports: { './work': './src/work.mjs', './testing': './scripts/tests/helper.mjs' }, imports: { '#work': './src/work.mjs', '#test': './scripts/tests/helper.mjs', '#other': 'other' } }),
      'src/work.mjs': 'export function i_work() {}',
      'src/legacy.test.mjs': '',
      'scripts/tests/helper.mjs': 'export function i_build() {}',
      'scripts/tests/other.test.mjs': '',
      'nested/package.json': '{"name":"linked","type":"module","exports":"./public.mjs"}',
      'nested/public.mjs': 'export function run() {}',
      'node_modules/other/package.json': JSON.stringify({ name: 'other', exports: { '.': './public.mjs', './public': './public.mjs', './testing': './scripts/tests/helper.mjs', './conditional': { import: './public.mjs', require: './scripts/tests/helper.mjs' } } }),
      'node_modules/other/public.mjs': 'export function run() {}',
      'node_modules/other/scripts/tests/helper.mjs': '',
      'node_modules/@scope/other/package.json': '{"name":"@scope/other","exports":"./public.mjs"}',
      'node_modules/@scope/other/public.mjs': '',
    });
    try {
      for (const [target, link] of entry.links || []) {
        fs.mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
        fs.symlinkSync(path.join(root, target), path.join(root, link));
      }
      const file = entry.file || 'src/app.mjs';
      const actual = new Linter({ cwd: root }).verify(typeof entry.code === 'function' ? entry.code(root) : entry.code, [{
        files: ['**/*.mjs', '**/*.cjs'],
        languageOptions: { sourceType: file.endsWith('.cjs') ? 'commonjs' : 'module' },
        plugins: { atb: { rules: { access } } },
        rules: { 'atb/access': ['error', { testDir: 'scripts/tests' }] },
      }], { filename: path.join(root, file) });
      assert.deepEqual(actual.map(message => message.messageId), entry.expected || [], entry.name + '应遵守包、角色、接口的检查顺序：' + JSON.stringify(actual));
      for (const message of actual) assert.ok(message.line > 0 && message.column > 0, '诊断应定位到实际加载或接口位置');
    } finally { fs.t_unmock(); }
  });
}

/** 场景：生产依赖测试由访问规则负责，测试互相依赖仍由原边界规则负责，不重复报告。 */
test('两条规则按调用方身份分工且不重复报告', function test_两条规则按调用方身份分工且不重复报告() {
  const root = i_createFixture({ 'package.json': '{"name":"fixture"}', 'scripts/tests/other.test.mjs': '' });
  try {
    const config = [{ files: ['**/*.mjs'], plugins: { atb: { rules: { access, testCaseImports } } }, rules: { 'atb/access': 'error', 'atb/testCaseImports': 'error' } }];
    const linter = new Linter({ cwd: root });
    const production = linter.verify("import '../scripts/tests/other.test.mjs';", config, { filename: root + '/src/app.mjs' });
    assert.deepEqual(production.map(message => [message.ruleId, message.messageId]), [['atb/access', 'productionDependsOnTests']], '生产文件只能由模块访问边界报告一次');
    const testing = linter.verify("import '../other.test.mjs';", config, { filename: root + '/scripts/tests/export/a.test.mjs' });
    assert.deepEqual(testing.map(message => [message.ruleId, message.messageId]), [['atb/testCaseImports', 'testFileDependency']], '测试文件间的依赖继续由原规则报告');
  } finally { fs.t_unmock(); }
});

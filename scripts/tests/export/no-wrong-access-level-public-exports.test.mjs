// 真实 ESLint 检查公开导出；包清单和源文件仅在 lite-fs 内存项目中装配。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import levels from 'atb-eslint-plugin/rules/no-wrong-access-level.mjs';
import { createConfig } from 'atb-eslint-plugin/config.mjs';
import { i_createFixture } from '../lint-fixture.mjs';

const f_CASES = [
  { name: 'exports 入口默认对象', file: 'src/api.mjs', code: 'export default { run() {} };' },
  { name: 'exports 入口默认函数', file: 'src/api.mjs', code: 'export default function run() {}' },
  { name: 'exports 入口默认类', file: 'src/api.mjs', code: 'export default class Api {}' },
  { name: 'exports 入口默认引用值', file: 'src/api.mjs', code: 'const value = 1; export default value;' },
  { name: 'main 入口默认导出', manifest: { main: './src/api.mjs' }, file: 'src/api.mjs', code: 'export default 1;' },
  { name: '条件入口默认导出', manifest: { exports: { '.': { import: './src/api.mjs', require: './src/api.cjs' } } }, file: 'src/api.cjs', code: 'module.exports = 1;' },
  { name: '通配入口默认导出', manifest: { exports: { './features/*': './src/features/*.mjs' } }, file: 'src/features/deep/api.mjs', code: 'export default 1;' },
  { name: '根配置保留具名与默认出口', file: 'eslint.config.mjs', code: 'export function createConfig() { return []; } export default createConfig();' },
  { name: '内部具名 i_ 保持合法', file: 'src/internal.mjs', code: 'export function i_run() {}' },
  { name: '内部 i_ 解构保持合法', file: 'src/internal.mjs', code: 'export const { a: i_data } = input;' },
  { name: '内部 i_ 类保持合法', file: 'src/internal.mjs', code: 'export class i_Api {}' },
  { name: '内部 i_ 命名空间再导出', file: 'src/internal.mjs', code: "export * as i_api from './api.mjs';" },
  { name: '公开入口星号再导出', file: 'src/api.mjs', code: "export * from './internal.mjs';" },
  { name: 'CJS 入口默认函数', file: 'src/api.cjs', code: 'module.exports = function run() {};', manifest: { exports: './src/api.cjs' } },
  { name: 'CJS 内部具名 i_', file: 'src/internal.cjs', code: 'exports.i_data = 1;' },
  { name: 'CJS 内部 i_ 对象面', file: 'src/internal.cjs', code: 'module.exports = { i_data: 1 };' },
  { name: 'CJS 内部稳定常量 i_ 键', file: 'src/internal.cjs', code: "const key = 'i_' + 'data'; module.exports[key] = 1;" },
  { name: '局部 module 与 exports 对象', file: 'src/internal.cjs', code: 'function f_set(module, exports) { module.exports = 1; exports.run = 1; }' },
  { name: '嵌套普通对象不是 CJS 出口', file: 'src/internal.cjs', code: 'const obj = { module: { exports: {} } }; obj.module.exports.run = 1;' },
  { name: '未声明默认对象', code: 'export default { run() {} };', names: ['default'] },
  { name: '未声明默认函数', code: 'export default function run() {}', names: ['default'] },
  { name: '未声明匿名默认函数', code: 'export default function() {}', names: ['default'] },
  { name: '未声明默认类', code: 'export default class Api {}', names: ['default'] },
  { name: '未声明默认引用值', code: 'const data = 1; export default data;', names: ['default'] },
  { name: '默认值携带 i_ 名仍须登记', code: 'const i_data = 1; export default i_data;', names: ['default'] },
  { name: 'default 别名不能绕过', code: 'const data = 1; export { data as default };', names: ['default'] },
  { name: 'default 再导出不能绕过', code: "export { default } from './api.mjs';", names: ['default'] },
  { name: '内部名改为公开名不能绕过', code: 'export { i_run as run } from "./api.mjs";', names: ['run'] },
  { name: '未声明公开类', code: 'export class Api {}', names: ['Api'] },
  { name: '未声明对象解构', code: 'export const { a: run, nested: { b: data }, ...rest } = input;', names: ['run', 'data', 'rest'] },
  { name: '未声明数组解构', code: 'export const [run = 1, , ...data] = input;', names: ['run', 'data'] },
  { name: '未声明星号再导出', code: "export * from './api.mjs';", names: ['*'] },
  { name: '未声明公开命名空间再导出', code: "export * as api from './api.mjs';", names: ['api'] },
  { name: 'CJS 公开属性', file: 'src/internal.cjs', code: 'exports.run = 1;', names: ['run'] },
  { name: 'CJS module 公开属性', file: 'src/internal.cjs', code: 'module.exports.run = 1;', names: ['run'] },
  { name: 'CJS 计算 exports 路径', file: 'src/internal.cjs', code: "module['exports']['run'] = 1;", names: ['run'] },
  { name: 'CJS 整体默认出口', file: 'src/internal.cjs', code: 'module.exports = () => 1;', names: ['default'] },
  { name: 'CJS 公开对象面', file: 'src/internal.cjs', code: 'module.exports = { run: 1, data: 2 };', names: ['run', 'data'] },
  { name: 'CJS 对象展开不放过未知公开面', file: 'src/internal.cjs', code: 'module.exports = { ...api };', names: ['*'] },
  { name: 'CJS 动态键不放过未知公开面', file: 'src/internal.cjs', code: 'exports[getKey()] = 1;', names: ['*'] },
  { name: 'CJS 常量循环不导致规则崩溃', file: 'src/internal.cjs', code: 'const key = key; exports[key] = 1;', names: ['*'] },
  { name: 'CJS 字符串常量公开键', file: 'src/internal.cjs', code: "const key = 'run'; exports[key] = 1;", names: ['run'] },
  { name: 'bin 不授予导入出口', manifest: { bin: './src/internal.mjs' }, code: 'export default 1;', names: ['default'] },
  { name: 'exports 存在时不采用旧 main', manifest: { main: './src/internal.mjs', exports: './src/api.mjs' }, code: 'export default 1;', names: ['default'] },
  { name: '嵌套包按自己的清单', file: 'nested/src/api.mjs', files: { 'nested/package.json': '{"name":"nested"}' }, manifest: { exports: './nested/src/api.mjs' }, code: 'export default 1;', names: ['default'] },
  { name: '同名普通嵌套配置不继承根入口', file: 'src/eslint.config.mjs', code: 'export default [];', names: ['default'] },
];

for (const entry of f_CASES) {
  /** 场景：入口声明决定是否可提供公开导出，内部接口和局部同名对象不获得额外权限。 */
  test(entry.name, function test_no_wrong_access_level_public_exports_entry_name() {
    const file = entry.file || 'src/internal.mjs';
    const root = i_createFixture({
      'package.json': JSON.stringify({ name: 'fixture', type: 'module', ...(entry.manifest || { exports: './src/api.mjs' }) }),
      ...entry.files,
    });
    try {
      const config = [{
        files: ['**/*.mjs', '**/*.cjs'],
        languageOptions: { sourceType: file.endsWith('.cjs') ? 'commonjs' : 'module' },
        plugins: { atb: { rules: { levels } } },
        rules: { 'atb/levels': ['error', { testDir: 'scripts/tests' }] },
      }];
      const actual = new Linter({ cwd: root }).verify(entry.code, config, { filename: path.join(root, file) });
      const expected = (entry.names || []).map(name => ({ messageId: 'publicExportOffFace', name }));
      assert.deepEqual(actual.map(message => ({
        messageId: message.messageId,
        name: /导出 '([^']+)'/.exec(message.message)?.[1],
      })), expected, `${entry.name}应按当前包的真实入口判定：${JSON.stringify(actual)}`);
      for (const message of actual) {
        assert.ok(message.line > 0 && message.column > 0, '错误必须指向实际导出位置');
      }
    } finally { fs.t_unmock(); }
  });
}

/** 场景：公共工厂继续使用原规则身份，未登记 default 出口默认被拒绝。 */
test('公共工厂默认启用原规则的公开出口检查', function test_公共工厂默认启用原规则的公开出口检查() {
  const root = i_createFixture({ 'package.json': '{"name":"fixture","type":"module"}' });
  try {
    const config = createConfig();
    const actual = new Linter({ cwd: root }).verify('export default {};', config, { filename: path.join(root, 'src/internal.mjs') });
    assert.deepEqual(actual.filter(message => message.ruleId === 'atb/no-wrong-access-level').map(message => message.messageId), ['publicExportOffFace'], '同一条规则应通过默认配置实际执行');
  } finally { fs.t_unmock(); }
});

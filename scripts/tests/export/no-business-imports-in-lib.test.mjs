// 通过公开规则与真实 Linter 验证内部库反向导入约束，样例只做静态分析，不执行源码。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { pathToFileURL } from 'node:url';
import { Linter } from 'eslint';
import plugin from 'atb-eslint-plugin';
import { i_createFixture } from '../lint-fixture.mjs';

const f_CASES = [
  ['同目录静态导入', "import './peer.mjs';", []],
  ['父目录仍在内部库', "import '../peer.mjs';", [], 'src/lib/nested/entry.mjs'],
  ['父路径实际为库外', "import '../business.mjs';", ['outsideLib']],
  ['目录前缀不能混淆', "import '../../lib-extra/peer.mjs';", ['outsideLib']],
  ['具名再导出库外', "export { value } from '../business.mjs';", ['outsideLib']],
  ['整体再导出库外', "export * from '../business.mjs';", ['outsideLib']],
  ['包自引用库内', "import 'fixture/lib/peer';", []],
  ['包自引用库外', "import 'fixture/business';", ['outsideLib']],
  ['包自引用通配目标', "import('fixture/lib/peer');", []],
  ['固定动态导入库内', "import('./peer.mjs');", []],
  ['固定动态导入库外', "import('../business.mjs');", ['outsideLib']],
  ['常量别名与模板', "const a = './peer'; const b = `${a}.mjs`; import(b);", []],
  ['字符串拼接库外', "const a = '../'; import(a + 'business.mjs');", ['outsideLib']],
  ['运行时目标', 'function load(target) { return import(target); }', ['unresolvedTarget']],
  ['可变绑定目标', "let target = './peer.mjs'; target = '../business.mjs'; import(target);", ['unresolvedTarget']],
  ['循环常量不递归溢出', 'const a = b; const b = a; import(a);', ['unresolvedTarget']],
  ['缺失本地目标', "import('./missing.mjs');", ['unresolvedTarget']],
  ['无效 URL 不使规则崩溃', "import(new URL('http://[').href);", ['unresolvedTarget']],
  ['Node 内置与子路径', "import 'fs'; import('node:fs/promises');", []],
  ['已声明运行依赖', "import 'dep/subpath'; import('optional'); import('peer');", []],
  ['未声明包', "import('undeclared');", ['undeclaredDependency']],
  ['开发依赖不能当运行依赖', "import('dev-only');", ['undeclaredDependency']],
  ['非文件 URL', "import('https://example.com/code.mjs');", ['unresolvedTarget']],
  ['全局 require 库内', "require('./peer.mjs');", []],
  ['全局 require 库外', "require('../business.mjs');", ['outsideLib']],
  ['未知 require 目标', 'function load(target) { return require(target); }', ['unresolvedTarget']],
  ['require 别名', "const load = require; load('../business.mjs');", ['outsideLib']],
  ['require 别名被改写', "let load = require; load = other; load('./peer.mjs');", ['unresolvedTarget']],
  ['影子 require 不误报', "function run(require) { return require('../business.mjs'); }", []],
  ['普通同名成员不误报', "const obj = { require(x) { return x; } }; obj.require('../business.mjs');", []],
  ['createRequire 别名', "import { createRequire as make } from 'node:module'; const load = make(import.meta.url); const alias = load; alias('../business.mjs');", ['outsideLib']],
  ['createRequire 解析基准', "import { createRequire } from 'node:module'; const load = createRequire(new URL('../anchor.mjs', import.meta.url)); load('./business.mjs');", ['outsideLib']],
  ['未知 createRequire 基准', "import { createRequire } from 'node:module'; function run(base) { return createRequire(base)('./peer.mjs'); }", ['unresolvedTarget']],
  ['影子 createRequire 不误报', "function createRequire(x) { return x; } createRequire('anything');", []],
  ['file URL 库内', "import(new URL('./peer.mjs', import.meta.url).href);", []],
  ['file URL 库外', "import(new URL('../business.mjs', import.meta.url));", ['outsideLib']],
  ['URL 常量属性', "const url = new URL('./peer.mjs', import.meta.url); import(url.href);", []],
  ['真实 path 别名', "import path from 'node:path'; const p = path; import(p.join(import.meta.dirname, 'peer.mjs'));", []],
  ['有绝对基准的 resolve', "import { resolve } from 'node:path'; import(resolve(import.meta.dirname, 'peer.mjs'));", []],
  ['全相对 resolve 不借宿主 cwd 推测', "import { resolve } from 'node:path'; import(resolve('src/lib/peer.mjs'));", ['unresolvedTarget']],
  ['影子 path 不求值', "const path = { join() { return '../business.mjs'; } }; import(path.join('peer.mjs'));", ['unresolvedTarget']],
  ['URL 转换方法别名', "import { fileURLToPath as decode } from 'node:url'; import(decode(new URL('./peer.mjs', import.meta.url)));", []],
  ['CJS 模块对象加载器', "module.require('../business.mjs');", ['outsideLib']],
  ['默认导入 createRequire', "import mod from 'node:module'; const { createRequire: make } = mod; make(import.meta.url)('../business.mjs');", ['outsideLib']],
  ['通过 require 取得 createRequire', "const { createRequire: make } = require('node:module'); make(import.meta.url)('../business.mjs');", ['outsideLib']],
  ['URL 被修改不能沿用初值', "const url = new URL('./peer.mjs', import.meta.url); url.pathname = '/outside.mjs'; import(url.href);", ['unresolvedTarget']],
  ['URL 别名修改不能绕过', "const url = new URL('./peer.mjs', import.meta.url); const alias = url; alias.pathname = '/outside.mjs'; import(url.href);", ['unresolvedTarget']],
  ['URL 逃逸到未知函数', "const url = new URL('./peer.mjs', import.meta.url); mutate(url); import(url.href);", ['unresolvedTarget']],
  ['稳定 URL 别名可解析', "const url = new URL('./peer.mjs', import.meta.url); const alias = url; import(alias.href);", []],
  ['影子 URL 不误认原生构造', "function URL() {} import(new URL('./peer.mjs', import.meta.url));", ['unresolvedTarget']],
  ['包 imports 别名库内', "import '#peer';", []],
  ['包 imports 别名库外', "import '#business';", ['outsideLib']],
  ['库外文件不受此规则限制', "import('./business.mjs');", [], 'src/entry.mjs'],
  ['循环工厂别名不造成递归溢出', "const a = b(); const b = a(); a('../business.mjs');", []],
  ['字符串与注释不是导入', 'const text = "import(\'../business.mjs\')"; // import unknown', []],
];

for (const [name, code, expected, relative = 'src/lib/entry.mjs'] of f_CASES) {
  /** 场景：按真实加载 API、清单与实际路径判定内部库边界。 */
  test(name, function test_no_business_imports_in_lib_name() {
    const root = i_createFixture({
      'package.json': JSON.stringify({ name: 'fixture', exports: { './lib/*': './src/lib/*.mjs', './business': './src/business.mjs' }, imports: { '#peer': './src/lib/peer.mjs', '#business': './src/business.mjs' }, dependencies: { dep: '1.0.0' }, optionalDependencies: { optional: '1.0.0' }, peerDependencies: { peer: '1.0.0' }, devDependencies: { 'dev-only': '1.0.0' } }),
      'src/lib/peer.mjs': 'export const value = 1;', 'src/business.mjs': 'export const value = 1;', 'lib-extra/peer.mjs': '',
    });
    try {
      const config = [{ files: ['**/*.mjs'], plugins: { atb: plugin }, rules: { 'atb/no-business-imports-in-lib': ['error', { libDir: 'src/lib' }] } }];
      const actual = new Linter({ cwd: root }).verify(code, config, { filename: path.join(root, relative) });
      assert.deepEqual(actual.map(message => message.messageId), expected, `${name}：诊断应符合加载目标的实际身份`);
    } finally { fs.t_unmock(); }
  });
}

/** 场景：软链接及绝对文件 URL 不能使库外目标冒认库内文件，库内真实目标仍可访问。 */
test('软链接与绝对路径按真实位置检查', function test_软链接与绝对路径按真实位置检查() {
  const root = i_createFixture({ 'package.json': '{"name":"fixture"}', 'src/lib/peer.mjs': '', 'src/business.mjs': '' });
  try {
    fs.symlinkSync(`${root}/src/business.mjs`, `${root}/src/lib/escape.mjs`);
    fs.symlinkSync(`${root}/src/lib/peer.mjs`, `${root}/src/inside.mjs`);
    const config = [{ files: ['**/*.mjs'], plugins: { atb: plugin }, rules: { 'atb/no-business-imports-in-lib': ['error', { libDir: 'src/lib' }] } }];
    const code = `import './escape.mjs'; import '../inside.mjs'; import(${JSON.stringify(pathToFileURL(`${root}/src/business.mjs`).href)}); import(${JSON.stringify(`${root}/src/lib/peer.mjs`)});`;
    const actual = new Linter({ cwd: root }).verify(code, config, { filename: `${root}/src/lib/entry.mjs` });
    assert.deepEqual(actual.map(message => message.messageId), ['outsideLib', 'outsideLib'], '软链逃逸和库外 URL 应报告，解析回库内的软链及绝对路径应允许');
  } finally { fs.t_unmock(); }
});

/** 场景：包条件导出按加载方式判断，不能用 import 的库内分支替 require 的库外分支放行。 */
test('条件导出与封闭入口按实际加载方式检查', function test_条件导出与封闭入口按实际加载方式检查() {
  const root = i_createFixture({
    'package.json': JSON.stringify({ name: 'fixture', exports: { './conditional': { node: { import: './src/lib/peer.mjs', require: './src/business.cjs' } }, './blocked': null }, imports: { '#conditional': { import: './src/lib/peer.mjs', require: './src/business.cjs' } } }),
    'src/lib/peer.mjs': '', 'src/business.cjs': '',
  });
  try {
    const config = [{ files: ['**/*.mjs', '**/*.cjs'], plugins: { atb: plugin }, rules: { 'atb/no-business-imports-in-lib': ['error', { libDir: 'src/lib' }] } }];
    const linter = new Linter({ cwd: root });
    const actual = linter.verify("import('fixture/conditional'); require('fixture/conditional'); import('fixture/blocked'); import('#conditional'); require('#conditional');", config, { filename: `${root}/src/lib/entry.mjs` });
    assert.deepEqual(actual.map(message => message.messageId), ['outsideLib', 'unresolvedTarget', 'outsideLib'], 'import 与 require 条件必须分别解析，null 入口不能放行');
    const commonjs = linter.verify("const load = require; load('../business.cjs');", config, { filename: `${root}/src/lib/entry.cjs` });
    assert.deepEqual(commonjs.map(message => message.messageId), ['outsideLib'], 'CommonJS 的真实 require 绑定应受同一边界约束');
  } finally { fs.t_unmock(); }
});

/** 场景：内部库目录必须位于当前项目，错误目录配置不能静默使规则失效。 */
test('拒绝绝对目录和项目外目录配置', function test_拒绝绝对目录和项目外目录配置() {
  const root = i_createFixture({ 'package.json': '{"name":"fixture"}' });
  try {
    for (const libDir of ['/outside', '../outside']) {
      const config = [{ files: ['**/*.mjs'], plugins: { atb: plugin }, rules: { 'atb/no-business-imports-in-lib': ['error', { libDir }] } }];
      assert.throws(() => new Linter({ cwd: root }).verify('', config, { filename: `${root}/src/lib/entry.mjs` }), /libDir.*相对目录/, '错误目录配置必须明确失败');
    }
  } finally { fs.t_unmock(); }
});

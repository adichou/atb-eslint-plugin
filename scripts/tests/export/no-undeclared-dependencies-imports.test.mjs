// 使用官方 RuleTester 执行真实规则；受检代码直接传字符串，无需文件系统或命令模拟。
// 规则自锚定项目根（受检文件向上找最近 package.json），用例以本仓真实清单判定三级链：
// dependencies=litenvi-node、devDependencies=eslint/eslint-plugin-* 等；peer 级本仓未声明，
// 不构造磁盘夹具，留白不测（与「相对导入目标不必真实存在」的纯路径归因口径一致）。
// 根配置 eslint.config.mjs 为规则内置识别的开发代码（固定路径不经参数）——devDependencies
// 合法、未声明依赖照抓；规则不设 ignores，不支持任何形态的忽略。
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import undeclaredDeps from 'atb-eslint-plugin/rules/no-undeclared-dependencies-imports.mjs';

// 将 RuleTester 的用例登记到 node:test，让失败和用例数量进入项目统一报告。
RuleTester.describe = describe;
RuleTester.it = it;

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
// 生产文件与根配置样本：生产文件不在任何开发路径内，根配置命中内置识别。
const prodFile = path.join(repoRoot, 'src/flow.mjs');
const rootConfigFile = path.join(repoRoot, 'eslint.config.mjs');

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

/** 场景：依赖三级判定链（dependencies/peer/开发路径+devDependencies）、内置识别与不设 ignores。 */
tester.run('no-undeclared-dependencies-imports', undeclaredDeps, {
  valid: [
    // 场景：dependencies（运行时作用域）导入放行。
    { name: 'dependencies 导入放行', filename: prodFile, code: "import { readFileSync } from 'litenvi-node/lite-fs.mjs';\n" },
    // 场景：node: 内置模块不参与判定。
    { name: 'node: 内置放行', filename: prodFile, code: "import { parse } from 'node:util';\n" },
    // 场景：相对导入不经依赖判定。
    { name: '相对导入放行', filename: prodFile, code: "import { helper } from '../helper.mjs';\n" },
    // 场景：包名自引用（specifier 包名 = 本包名）是 Node 一等用法，直接放行。
    { name: '包名自引用放行', filename: prodFile, code: "import { createConfig } from 'atb-eslint-plugin/config.mjs';\n" },
    // 场景：根配置 eslint.config.mjs 内置识别为开发代码——devDependencies 放行。
    {
      name: '根配置内置识别 devDependencies 放行',
      filename: rootConfigFile,
      code: "import packageJsonPlugin from 'eslint-plugin-package-json';\n",
    },
    // 场景：testDir 命中的文件引用 devDependencies 放行（缺省 testDir='scripts/tests'）。
    {
      name: 'testDir 命中文件 devDependencies 放行',
      filename: path.join(repoRoot, 'scripts/tests/fixture.test.mjs'),
      code: "import { RuleTester } from 'eslint';\n",
    },
    // 场景：声明 buildToolDir 后命中的文件引用 devDependencies 放行（构建工具目录 = 开发作用域）。
    {
      name: 'buildToolDir 命中文件 devDependencies 放行',
      filename: path.join(repoRoot, 'tools/build.mjs'),
      code: "import { RuleTester } from 'eslint';\n",
      options: [{ testDir: 'scripts/tests', buildToolDir: 'tools' }],
    },
    // 场景：export-from 具名来源同口径放行。
    { name: 'export-from 来源放行', filename: prodFile, code: "export { readFileSync } from 'litenvi-node/lite-fs.mjs';\n" },
  ],
  invalid: [
    // 场景：生产文件引用 devDependencies——运行时缺包，devOnly 报告。
    {
      name: '生产文件 devDependencies 导入报告',
      filename: prodFile,
      code: "import { RuleTester } from 'eslint';\n",
      output: null,
      errors: [{ messageId: 'devOnly', data: { specifier: 'eslint' }, type: 'ImportDeclaration' }],
    },
    // 场景：开发路径不命中（buildToolDir 未声明），devOnly 照报（开发作用域 = 路径 + 清单双条件）。
    {
      name: '开发路径不命中仍 devOnly 报告',
      filename: prodFile,
      code: "import { RuleTester } from 'eslint';\n",
      options: [{ testDir: 'scripts/tests', buildToolDir: '' }],
      output: null,
      errors: [{ messageId: 'devOnly', data: { specifier: 'eslint' }, type: 'ImportDeclaration' }],
    },
    // 场景：三级链全不匹配——未声明依赖的导入报告。
    {
      name: '未声明依赖 undeclared 报告',
      filename: prodFile,
      code: "import { thing } from 'not-a-pkg';\n",
      output: null,
      errors: [{ messageId: 'undeclared', data: { specifier: 'not-a-pkg' }, type: 'ImportDeclaration' }],
    },
    // 场景：根配置内置识别不是豁免——未声明依赖照抓。
    {
      name: '根配置未声明依赖照抓报告',
      filename: rootConfigFile,
      code: "import { thing } from 'not-a-pkg';\n",
      output: null,
      errors: [{ messageId: 'undeclared', data: { specifier: 'not-a-pkg' }, type: 'ImportDeclaration' }],
    },
    // 场景：动态 import 静态可解析时同口径判定。
    {
      name: '动态 import 静态可解析命中',
      filename: prodFile,
      code: "async function f_load() { return import('not-a-pkg'); }\n",
      output: null,
      errors: [{ messageId: 'undeclared', data: { specifier: 'not-a-pkg' }, type: 'ImportExpression' }],
    },
    // 场景：require 字面量同口径判定（作用域无 require 定义时）。
    {
      name: 'require 字面量命中',
      filename: prodFile,
      code: "const pkg = require('not-a-pkg');\n",
      output: null,
      errors: [{ messageId: 'undeclared', data: { specifier: 'not-a-pkg' }, type: 'CallExpression' }],
    },
  ],
});

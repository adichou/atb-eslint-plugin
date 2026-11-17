// 环境模块黑名单规则用例：受检代码直接传字符串（RuleTester），无需文件系统或命令模拟——
// testDir 按运行目录解析（npm test 于仓库根执行），filename 模拟 testDir 内外两种身份。
// 覆盖：静态 import（含副作用）/export-from/静态可解动态 import 与 require 全形态命中、
// 裸内置名归一化（fs ≡ node:fs 双向）、子路径连带（node:fs 拦 node:fs/promises、lodash 拦
// lodash/fp）、自定义黑名单整组覆盖、空黑名单无约束、testDir 外不受检、静态不可解脱漏、
// require 被遮蔽放行、exceptionFilesAllowModules 例外登记（独立参数：精确文件与模块，窄例外
// 不掩盖其他模块或文件）、绝对路径 testDir 抛错（fail-loud）。
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter, RuleTester } from 'eslint';
import modulesImportInTest from 'atb-eslint-plugin/rules/no-modules-import-in-test.mjs';

// 将 RuleTester 的用例登记到 node:test，让失败和用例数量进入项目统一报告。
RuleTester.describe = describe;
RuleTester.it = it;

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
// testDir 内（受检身份）与外（生产身份，环境模块纪律只面向测试代码路径）两种样本。
const testFile = path.join(repoRoot, 'scripts/tests/export/fixture.test.mjs');
const prodFile = path.join(repoRoot, 'src/flow.mjs');
const exemptFile = path.join(repoRoot, 'scripts/tests/export/quality-exempt.test.mjs');

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

/** 场景：黑名单命中归因（归一化 + 子路径连带）与辖区、覆盖、静态边界口径。 */
tester.run('no-modules-import-in-test', modulesImportInTest, {
  valid: [
    // 场景：testDir 外的生产文件不受检——环境模块纪律只面向测试代码路径。
    {
      name: 'testDir 外文件导入黑名单模块放行',
      filename: prodFile,
      code: "import fs from 'node:fs';\n",
      options: [{ deniedModules: ['node:fs'] }],
    },
    // 场景：黑名单外模块（node: 内置、普通包、相对导入）不受影响。
    {
      name: '黑名单外模块放行',
      filename: testFile,
      code: "import { test } from 'node:test';\nimport path from 'node:path';\nimport { helper } from './helper.mjs';\nimport { RuleTester } from 'eslint';\n",
      options: [{ deniedModules: ['node:fs', 'node:http'] }],
    },
    // 场景：自定义黑名单整组覆盖——缺省组不叠加，未列出的模块放行。
    {
      name: '自定义黑名单覆盖缺省组',
      filename: testFile,
      code: "import fs from 'node:fs';\n",
      options: [{ deniedModules: ['lodash'] }],
    },
    // 场景：空黑名单（缺省）即无约束。
    { name: '空黑名单无约束', filename: testFile, code: "import fs from 'node:fs';\n" },
    // 场景：动态 import 目标静态不可解时放行（静态边界，如实声明）。
    {
      name: '动态 import 不可解脱漏',
      filename: testFile,
      code: "async function f_load(target) { return import(target); }\n",
      options: [{ deniedModules: ['node:fs'] }],
    },
    // 场景：被遮蔽的 require 不是全局 require，放行。
    {
      name: '遮蔽 require 放行',
      filename: testFile,
      code: "function f_wrap(require) { return require('node:fs'); }\n",
      options: [{ deniedModules: ['node:fs'] }],
    },
    // 场景：黑名单写子路径只拦子路径自身（连带是向下的，不向上扩散）。
    {
      name: '黑名单子路径只拦自身',
      filename: testFile,
      code: "import fs from 'node:fs';\n",
      options: [{ deniedModules: ['node:fs/promises'] }],
    },
    // 场景：exceptionFilesAllowModules 精确文件仅放行登记模块（相对 testDir）。
    {
      name: '例外精确路径登记放行',
      filename: exemptFile,
      code: "import fs from 'node:fs';\n",
      options: [{ deniedModules: ['node:fs'], exceptionFilesAllowModules: [{ file: 'export/quality-exempt.test.mjs', modules: ['node:fs'], reason: '原生文件观测' }] }],
    },
    // 场景：裸模块名与 node 前缀等价，并允许显式授权模块的子路径。
    {
      name: '模块例外归一与子路径', filename: exemptFile,
      code: "import fs from 'node:fs/promises';\n",
      options: [{ deniedModules: ['node:fs'], exceptionFilesAllowModules: [{ file: 'export/quality-exempt.test.mjs', modules: ['fs'], reason: '原生文件观测' }] }],
    },
  ],
  invalid: [
    {
      name: '同文件 fs 授权不放行 http', filename: exemptFile,
      code: "import fs from 'node:fs'; import http from 'node:http';",
      options: [{ deniedModules: ['node:fs', 'node:http'], exceptionFilesAllowModules: [{ file: 'export/quality-exempt.test.mjs', modules: ['node:fs'], reason: '仅原生文件观测' }] }],
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:http', denied: 'node:http' } }],
    },
    {
      name: '模块例外拒绝文件通配符', filename: exemptFile, code: "import fs from 'node:fs';",
      options: [{ deniedModules: ['node:fs'], exceptionFilesAllowModules: [{ file: 'export/*.test.mjs', modules: ['node:fs'], reason: '过宽授权' }] }],
      errors: [{ messageId: 'invalidModuleException' }],
    },
    // 场景：静态 import 命中黑名单（数据带原始说明符与命中条目）。
    {
      name: '静态 import 命中',
      filename: testFile,
      code: "import fs from 'node:fs';\n",
      options: [{ deniedModules: ['node:fs'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:fs', denied: 'node:fs' }, type: 'ImportDeclaration' }],
    },
    // 场景：副作用导入（无绑定）同口径命中。
    {
      name: '副作用导入命中',
      filename: testFile,
      code: "import 'node:fs';\n",
      options: [{ deniedModules: ['node:fs'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:fs', denied: 'node:fs' }, type: 'ImportDeclaration' }],
    },
    // 场景：裸内置名与 node: 前缀是同一模块（Node 双写法），归一化后命中。
    {
      name: '裸内置名归一化命中',
      filename: testFile,
      code: "import { readFile } from 'fs';\n",
      options: [{ deniedModules: ['node:fs'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'fs', denied: 'node:fs' }, type: 'ImportDeclaration' }],
    },
    // 场景：黑名单写裸名同样拦 node: 写法（双向归一化）。
    {
      name: '黑名单裸名拦 node: 写法',
      filename: testFile,
      code: "import fs from 'node:fs';\n",
      options: [{ deniedModules: ['fs'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:fs', denied: 'node:fs' }, type: 'ImportDeclaration' }],
    },
    // 场景：子路径连带——黑名单条目命中说明符祖先段（node:fs 拦 node:fs/promises）。
    {
      name: '内置子路径连带命中',
      filename: testFile,
      code: "import { constants } from 'node:fs/promises';\n",
      options: [{ deniedModules: ['node:fs'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:fs/promises', denied: 'node:fs' }, type: 'ImportDeclaration' }],
    },
    // 场景：包名子路径连带（lodash 拦 lodash/fp），黑名单不限于 node: 内置。
    {
      name: '包名子路径连带命中',
      filename: testFile,
      code: "import fp from 'lodash/fp';\n",
      options: [{ deniedModules: ['lodash'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'lodash/fp', denied: 'lodash' }, type: 'ImportDeclaration' }],
    },
    // 场景：export-from 具名来源同口径命中。
    {
      name: 'export-from 命中',
      filename: testFile,
      code: "export { get } from 'node:http';\n",
      options: [{ deniedModules: ['node:http'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:http', denied: 'node:http' }, type: 'ExportNamedDeclaration' }],
    },
    // 场景：export * from 全量来源同口径命中。
    {
      name: 'export * from 命中',
      filename: testFile,
      code: "export * from 'node:child_process';\n",
      options: [{ deniedModules: ['node:child_process'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:child_process', denied: 'node:child_process' }, type: 'ExportAllDeclaration' }],
    },
    // 场景：动态 import 静态可解时同口径命中。
    {
      name: '动态 import 静态可解命中',
      filename: testFile,
      code: "async function f_load() { return import('node:process'); }\n",
      options: [{ deniedModules: ['node:process'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:process', denied: 'node:process' }, type: 'ImportExpression' }],
    },
    // 场景：require 字面量同口径命中（作用域无 require 定义时）。
    {
      name: 'require 字面量命中',
      filename: testFile,
      code: "const https = require('node:https');\n",
      options: [{ deniedModules: ['node:https'] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:https', denied: 'node:https' }, type: 'CallExpression' }],
    },
    // 场景：例外只豁免登记文件自身——登记别的文件，本文件照报（窄例外不掩盖未登记违规）。
    {
      name: '例外不掩盖未登记文件',
      filename: testFile,
      code: "import fs from 'node:fs';\n",
      options: [{ deniedModules: ['node:fs'], exceptionFilesAllowModules: [{ file: 'export/other.test.mjs', modules: ['node:fs'], reason: '其他文件观测' }] }],
      output: null,
      errors: [{ messageId: 'deniedModule', data: { specifier: 'node:fs', denied: 'node:fs' }, type: 'ImportDeclaration' }],
    },
  ],
});

/** 场景：绝对路径 testDir 传入即抛（fail-loud，防运行目录漂移静默失效）。 */
test('invalid：绝对路径 testDir 抛错', () => {
  const linter = new Linter();
  assert.throws(
    () => linter.verify("import fs from 'node:fs';\n", {
      plugins: { atb: { rules: { 'no-modules-import-in-test': modulesImportInTest } } },
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      rules: { 'atb/no-modules-import-in-test': ['error', { testDir: '/absolute/tests', deniedModules: ['node:fs'] }] },
    }, { filename: testFile }),
    /相对仓库根的相对路径/,
    '绝对 testDir 应抛错',
  );
});

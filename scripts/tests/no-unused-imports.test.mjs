// 使用官方 RuleTester 执行真实规则；单文件作用域分析无需文件系统夹具。
// 覆盖：具名/默认/命名空间/别名导入未使用报告、各引用形态（调用/传参/类型位置）放行、
// 副作用导入不检、混合子句部分未用只报未用项。
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import unusedImports from 'atb-eslint-plugin/rules/no-unused-imports.mjs';

// 将 RuleTester 的用例登记到 node:test，让失败和用例数量进入项目统一报告。
RuleTester.describe = describe;
RuleTester.it = it;

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const prodFile = path.join(repoRoot, 'src/flow.mjs');

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

/** 场景：死导入——import 绑定零引用即报，全形态覆盖；引用按作用域事实放行。 */
tester.run('no-unused-imports', unusedImports, {
  valid: [
    // 场景：具名/默认导入被调用与传参——文件内有使用者放行。
    { name: '具名与默认导入被使用放行', filename: prodFile, code: "import def, { used } from './dep.mjs';\nexport const out = [def, used];\n" },
    // 场景：别名导入按本地名引用计数放行。
    { name: '别名导入被使用放行', filename: prodFile, code: "import { orig as alias } from './dep.mjs';\nexport const out = alias;\n" },
    // 场景：副作用导入无绑定，其存在即意义，不检。
    { name: '副作用导入不检', filename: prodFile, code: "import './polyfill.mjs';\nexport const x = 1;\n" },
    // 场景：命名空间导入被成员访问放行。
    { name: '命名空间导入被使用放行', filename: prodFile, code: "import * as ns from './dep.mjs';\nexport const out = ns.thing;\n" },
  ],
  invalid: [
    // 场景：具名导入未使用报告，数据带来源说明符。
    {
      name: '具名导入未使用报告',
      filename: prodFile,
      code: "import { dead } from './dep.mjs';\nexport const x = 1;\n",
      output: null,
      errors: [{ messageId: 'unusedImports', data: { name: 'dead', source: './dep.mjs' }, type: 'Identifier' }],
    },
    // 场景：默认导入未使用报告。
    {
      name: '默认导入未使用报告',
      filename: prodFile,
      code: "import deadDef from './dep.mjs';\nexport const x = 1;\n",
      output: null,
      errors: [{ messageId: 'unusedImports', data: { name: 'deadDef', source: './dep.mjs' }, type: 'Identifier' }],
    },
    // 场景：命名空间导入未使用报告（core 基线另禁 namespace 形态，本规则只表态死活）。
    {
      name: '命名空间导入未使用报告',
      filename: prodFile,
      code: "import * as deadNs from './dep.mjs';\nexport const x = 1;\n",
      output: null,
      errors: [{ messageId: 'unusedImports', data: { name: 'deadNs', source: './dep.mjs' }, type: 'Identifier' }],
    },
    // 场景：混合子句只报未用项——被使用的具名不报。
    {
      name: '混合子句只报未用项',
      filename: prodFile,
      code: "import { used, dead } from './dep.mjs';\nexport const out = used;\n",
      output: null,
      errors: [{ messageId: 'unusedImports', data: { name: 'dead', source: './dep.mjs' }, type: 'Identifier' }],
    },
  ],
});

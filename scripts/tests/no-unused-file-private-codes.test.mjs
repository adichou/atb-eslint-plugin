// 使用官方 RuleTester 执行真实规则；单文件作用域分析无需文件系统夹具。
// 覆盖：顶层 f_ 函数/数据零引用报告、各引用形态（调用/传参/shorthand/模板插值）放行、
// 嵌套作用域不查、导出面移交 no-out-of-level-access（不双报）、字符串同名不算引用、
// 非 f_ 前缀不归本规则。
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { RuleTester } from 'eslint';
import unusedFilePrivateCodes from 'atb-eslint-plugin/rules/no-unused-file-private-codes.mjs';

// 将 RuleTester 的用例登记到 node:test，让失败和用例数量进入项目统一报告。
RuleTester.describe = describe;
RuleTester.it = it;

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const prodFile = path.join(repoRoot, 'src/flow.mjs');

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

/** 场景：文件私有死代码——顶层 f_ 绑定零引用即报；引用计数按作用域事实。 */
tester.run('no-unused-file-private-codes', unusedFilePrivateCodes, {
  valid: [
    // 场景：f_ 函数被调用、f_ 数据被引用——文件私有面有使用者放行。
    { name: 'f_ 函数与数据被使用放行', filename: prodFile, code: 'function f_helper() {}\nconst f_cfg = { a: 1 };\nexport function run() { f_helper(); return f_cfg.a; }\n' },
    // 场景：引用形态按作用域事实——传参、shorthand 键、模板插值都算引用。
    { name: '传参与 shorthand 引用放行', filename: prodFile, code: 'const f_flags = { on: true };\nfunction f_take(x) { return x; }\nexport const out = { f_flags };\nexport const s = `${f_take(1)}`;\n' },
    // 场景：嵌套作用域的 f_ 局部名不查（顶层语义与 no-wrong-access-level 同界）。
    { name: '嵌套作用域 f_ 不查', filename: prodFile, code: 'export function outer() { const f_tmp = 1; return 2; }\n' },
    // 场景：导出声明的 f_ 移交 no-out-of-level-access 的 filePrivateExport，本规则不双报。
    { name: '导出声明 f_ 移交不双报', filename: prodFile, code: 'export function f_run() {}\n' },
    // 场景：名单与 default 导出引用的 f_ 同属导出面，移交不双报。
    { name: '名单导出 f_ 移交不双报', filename: prodFile, code: 'const f_data = 1;\nexport { f_data };\n' },
    { name: 'default 导出引用 f_ 移交不双报', filename: prodFile, code: 'const f_main = 1;\nexport default f_main;\n' },
    // 场景：无前缀与 i_/t_ 前缀绑定不归本规则（另有其主或非文件私有语义）。
    { name: '非 f_ 前缀不查', filename: prodFile, code: 'export const data = 1;\n' },
  ],
  invalid: [
    // 场景：顶层 f_ 函数声明零引用——文件私有无使用者，死代码报告。
    {
      name: '顶层 f_ 函数零引用报告',
      filename: prodFile,
      code: 'function f_dead() {}\nexport function run() {}\n',
      output: null,
      errors: [{ messageId: 'unusedFilePrivateCodes', data: { name: 'f_dead' }, type: 'Identifier' }],
    },
    // 场景：f_ 数据常量零引用同样报告（文件私有不区分函数与数据）。
    {
      name: '顶层 f_ 数据零引用报告',
      filename: prodFile,
      code: 'const f_cache = {};\nexport function run() {}\n',
      output: null,
      errors: [{ messageId: 'unusedFilePrivateCodes', data: { name: 'f_cache' }, type: 'Identifier' }],
    },
    // 场景：字符串字面量里的同名字样不算引用（作用域分析天然区分）。
    {
      name: '字符串同名不算引用报告',
      filename: prodFile,
      code: "const f_name = 'x';\nexport const s = 'f_name in string';\n",
      output: null,
      errors: [{ messageId: 'unusedFilePrivateCodes', data: { name: 'f_name' }, type: 'Identifier' }],
    },
  ],
});

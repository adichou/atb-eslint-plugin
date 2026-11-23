// 通过公开规则验证测试方法能被唯一引用；不执行受检字符串。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import rule from 'atb-eslint-plugin/rules/no-invalid-test-definition.mjs';

const f_PREFIX = "import { test, it, describe, beforeEach } from 'node:test'; import assert from 'node:assert/strict';\n";
const f_ASSERT = "assert.ok(value, '应有业务结果');";
const f_CASES = [
  ['同步具名回调', `/** 场景：验证结果 */\ntest('有名称', function testResult() { ${f_ASSERT} });`, []],
  ['异步具名回调', `/** 场景：验证结果 */\ntest('有名称', async function testResult() { await operation(); ${f_ASSERT} });`, []],
  ['中文方法名', `/** 场景：验证结果 */\nit('有名称', function 测试结果() { ${f_ASSERT} });`, []],
  ['同步箭头回调', `/** 场景：验证结果 */\ntest('有名称', () => { ${f_ASSERT} });`, ['missingTestCallbackName']],
  ['异步箭头回调', `/** 场景：验证结果 */\ntest('有名称', async () => { ${f_ASSERT} });`, ['missingTestCallbackName']],
  ['匿名 function 回调', `/** 场景：验证结果 */\ntest('有名称', function () { ${f_ASSERT} });`, ['missingTestCallbackName']],
  ['带选项的匿名回调', `/** 场景：验证结果 */\ntest('有名称', { timeout: 100 }, () => { ${f_ASSERT} });`, ['missingTestCallbackName']],
  ['别名 runner 仍检查', `import { test as verify } from 'node:test';\n/** 场景：验证结果 */\nverify('有名称', () => { ${f_ASSERT} });`, ['missingTestCallbackName']],
  ['默认 runner 仍检查', `import check from 'node:test';\n/** 场景：验证结果 */\ncheck('有名称', function () { ${f_ASSERT} });`, ['missingTestCallbackName']],
  ['子测试具名回调', `/** 场景：验证结果 */\ntest('父用例', async function testParent(t) {\n/** 场景：验证子结果 */\nawait t.test('子用例', function testChild() { ${f_ASSERT} });\n});`, []],
  ['子测试匿名回调', `/** 场景：验证结果 */\ntest('父用例', async function testParent(t) {\n/** 场景：验证子结果 */\nawait t.test('子用例', () => { ${f_ASSERT} });\n});`, ['missingTestCallbackName']],
  ['套件和清理 hook 允许匿名', `beforeEach(() => prepare()); describe('测试组', () => {\n/** 场景：验证结果 */\nit('有名称', function testResult() { ${f_ASSERT} });\n});`, []],
  ['普通同名对象不冒认测试', "const other = { test(name, callback) {} }; other.test('有名称', () => {});", []],
  ['局部影子 runner 不冒认测试', "function run(test) { test('有名称', () => {}); }", []],
  ['函数引用不能代替内联注册', `function testResult() { ${f_ASSERT} }\n/** 场景：验证结果 */\ntest('有名称', testResult);`, ['missingTestCallbackName']],
  ['变量绑定箭头不能代替内联注册', `const testResult = () => { ${f_ASSERT} };\n/** 场景：验证结果 */\ntest('有名称', testResult);`, ['missingTestCallbackName']],
  ['具名回调不代替非空标题', `/** 场景：验证结果 */\ntest('', function testResult() { ${f_ASSERT} });`, ['missingTestName']],
  ['同文件回调重名存在歧义', `/** 场景：验证甲 */\ntest('甲', function testResult() { ${f_ASSERT} });\n/** 场景：验证乙 */\ntest('乙', function testResult() { ${f_ASSERT} });`, ['duplicateTestCallbackName', 'duplicateTestCallbackName']],
  ['不同套件内重名仍存在方法引用歧义', `describe('甲组', () => {\n/** 场景：验证甲 */\nit('甲', function testResult() { ${f_ASSERT} });\n}); describe('乙组', () => {\n/** 场景：验证乙 */\nit('乙', function testResult() { ${f_ASSERT} });\n});`, ['duplicateTestCallbackName', 'duplicateTestCallbackName']],
  ['回调与可引用函数声明重名', `function testResult() {}\n/** 场景：验证结果 */\ntest('有名称', function testResult() { ${f_ASSERT} });`, ['duplicateTestCallbackName']],
  ['Playwright 测试同样要求具名', `import { test as browserTest } from '@playwright/test';\n/** 场景：验证结果 */\nbrowserTest('页面结果', async ({ page }) => { ${f_ASSERT} });`, ['missingTestCallbackName']],
  ['Playwright 具名回调允许解构参数', `import { test as browserTest } from '@playwright/test';\n/** 场景：验证结果 */\nbrowserTest('页面结果', async function testPage({ page }) { ${f_ASSERT} });`, []],
];

for (const [name, code, expected] of f_CASES) {
  /** 场景：测试名称与回调标识符分别校验，引用目标在文件内必须唯一。 */
  test(name, function testCallbackNamingCase() {
    const actual = new Linter().verify(f_PREFIX + code, [{
      plugins: { atb: { rules: { quality: rule } } }, rules: { 'atb/quality': 'error' },
    }]);
    assert.deepEqual(actual.map(item => item.messageId), expected, `${name}：诊断应符合方法引用约定`);
    for (const item of actual) assert.ok(item.line > 0 && item.column > 0, '诊断应定位到注册或回调');
  });
}

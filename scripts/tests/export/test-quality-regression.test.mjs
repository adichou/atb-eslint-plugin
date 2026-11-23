// 通过公开规则和真实 Linter 验证测试质量，不执行受检字符串。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import rule from 'atb-eslint-plugin/rules/no-bad-patterns-in-test.mjs';

const f_PREFIX = "import { test, describe, beforeEach as prepare } from 'node:test'; import assert from 'node:assert/strict'; import { expect } from '@playwright/test';\n";
// 私有：每个样例独立构造规则配置，不提供例外或缩减检查范围。
function f_messages(code) {
  return new Linter().verify(code, [{ plugins: { atb: { rules: { quality: rule } } }, rules: { 'atb/quality': 'error' } }]).map(item => item.messageId).sort();
}
const f_CASES = [
  ['外层 await 不代替回调等待', "await consume(() => { assert.rejects(async () => { throw Error(); }, Error, '应拒绝'); });", ['unawaitedRejects']],
  ['具名异常断言也要求等待', "import { rejects as check } from 'node:assert/strict'; check(async () => { throw Error(); }, Error, '应拒绝');", ['unawaitedRejects']],
  ['返回对象属性不算等待', "async function operation() { return { result: assert.rejects(run, Error, '应拒绝') }; }", ['unawaitedRejects']],
  ['聚合并等待有效', "await Promise.all([assert.rejects(run, Error, '应拒绝')]);", []],
  ['先保存再等待有效', "const result = assert.rejects(run, Error, '应拒绝'); await result;", []],
  ['测试组不要求断言', "describe('组', () => {});", []],
  ['别名 hook 不要求断言', "prepare(() => setup());", []],
  ['普通同名方法不误报', "const other = { route() {}, t_inject() {} }; other.route('/x'); other.t_inject({});", []],
  ['真实页面路由桩默认拦截', "import { chromium } from 'playwright'; const page = await (await chromium.launch()).newPage(); await page.route('/x', () => {});", ['routeStub']],
  ['真实定位器 force 默认拦截', "import { chromium } from 'playwright'; const page = await (await chromium.launch()).newPage(); await page.locator('#save').click({force: true});", ['forcedInteraction']],
  ['真实页面固定等待默认拦截', "import { chromium } from 'playwright'; const page = await (await chromium.launch()).newPage(); await page.waitForTimeout(50);", ['fixedSleep']],
  ['普通同名 click 不误报', "const data = {click() {}}; data.click({force: true});", []],
  ['影子 fetch 不误报', "function fetch() {} fetch('/x');", []],
  ['本地异步操作不能丢弃', "async function operation() { return 1; } operation();", ['unawaitedOperation']],
  ['异步链被等待有效', "async function operation() { return 1; } await operation().then(value => value);", []],
  ['超时竞赛有明确观测结果', "const pending = external(); await Promise.race([pending, new Promise(resolve => setTimeout(resolve, 50))]);", []],
  ['异步操作由异常断言消费有效', "async function operation() { throw Error(); } await assert.rejects(operation(), Error, '应失败');", []],
  ['裸 assert 模块名与 node 前缀一致', "import {rejects as bare} from 'assert/strict'; bare(run, Error, '应拒绝');", ['unawaitedRejects']],
  ['空诊断不合规', "assert.ok(value, '  ');", ['missingAssertMessage']],
  ['expect 空诊断不合规', "expect(value, '').toBe(1);", ['missingAssertMessage']],
  ['未调用函数不能提供断言', "/** 检查结果 */\ntest('检查', () => { function unused() { assert.ok(value, '应有值'); } });", ['missingAssertion']],
  ['恒假分支不能提供断言', "/** 检查 */\ntest('检查', () => { if (false) { assert.ok(value, '应有值'); } });", ['missingAssertion']],
  ['返回之后不能提供断言', "/** 检查 */\ntest('检查', () => { return; assert.ok(value, '应有值'); });", ['missingAssertion']],
  ['没有 matcher 不算断言', "/** 检查结果 */\ntest('检查', () => { expect(value, '应有值'); });", ['missingAssertion']],
  ['空名称不合规', "/** 检查结果 */\ntest('', () => { assert.ok(value, '应有值'); });", ['missingTestName']],
  ['普通说明不依赖中文模板', "/** 检查结果 */\ntest('检查', () => { assert.ok(value, '应有值'); });", []],
  ['改名 resolve 的睡眠仍识别', "new Promise(done => setTimeout(() => done(), 30));", ['fixedSleep']],
  ['拒绝超时不是睡眠', "new Promise((resolve, reject) => setTimeout(reject, 30));", []],
  ['同一绑定自比较仍是恒真', "const value = external(); assert.strictEqual(value, value, '应相等');", ['constantAssertion']],
  ['反向 matcher 不能误报恒真', "expect(1, '预期失败示例').not.toBe(1);", []],
  ['空模板并非恒真', "assert.ok(``, '预期失败示例');", []],
  ['清理同名函数不豁免吞错', "try { business.close(); throw Error(); } catch {}", ['swallowCatch']],
];
for (const [name, code, expected] of f_CASES) {
  /** 场景：真实规则应区分实际 API、执行边界和说明要求，不凭名称猜测。 */
  test(name, () => {
    assert.deepEqual(f_messages(f_PREFIX + code), expected, `${name}：诊断应符合真实执行边界`);
  });
}

/** 场景：已删除的范围、例外和断言名称白名单不能静默生效。 */
test('质量规则拒绝旧配置参数', () => {
  for (const options of [{ scanPath: '/tmp' }, { exceptionFiles: [] }, { pageInteraction: { exceptionFiles: [] } }, { assertionHelperNames: ['check'] }]) {
    assert.throws(() => new Linter().verify('', [{ plugins: { atb: { rules: { quality: rule } } }, rules: { 'atb/quality': ['error', options] } }]), /config|properties|property/i, '旧配置必须由 schema 明确拒绝');
  }
});

/** 场景：相对导入与包自引用按真实清单归因，同名内部文件不能冒认 lite 门面。 */
test('质量检查统一模块来源', async () => {
  const { i_createFixture } = await import('../lint-fixture.mjs');
  const { default: fs } = await import('litenvi-node/lite-fs.mjs');
  const { default: path } = await import('node:path');
  for (const packageName of ['litenvi-node', 'unrelated']) {
    const root = i_createFixture({
      'package.json': JSON.stringify({ name: packageName, exports: { './lite-*.mjs': './src/lite-*.mjs' } }),
      'src/lite-fs.mjs': 'export default {};',
    });
    try {
      const source = "import fs from '../../../src/lite-fs.mjs'; fs.t_inject({ code: 'EACCES' });";
      const actual = new Linter({ cwd: root }).verify(source, [{ files: ['**/*.mjs'], plugins: { atb: { rules: { quality: rule } } }, rules: { 'atb/quality': 'error' } }], { filename: path.join(root, 'scripts/tests/export/sample.test.mjs') });
      assert.deepEqual(actual.map(message => message.messageId), packageName === 'litenvi-node' ? ['unregisteredInject'] : [], '仅真实公开 lite 模块参与故障清理检查');
    } finally { fs.t_unmock(); }
  }
});

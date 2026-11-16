// 使用官方 RuleTester 执行真实规则；受检代码直接传字符串，无需文件系统或命令模拟。
// no-bad-test-patterns 为三块合一：① 用例质量模式、② SC 用例注释归属、③ 页面交互真实性。
// ①②默认启用（requireItemNumber、pageInteraction.* 默认关），因此凡以 test() 注册为载体
// 的代码串统一自带「场景：/输入：」注释，使目标违规之外不混入 ② 的缺省报告；裸语句片段
// （不注册 test）用于纯断言级检查。例外分列语义由专门的例外矩阵用例钉住。
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import noBadTestPatterns from 'atb-eslint-plugin/rules/no-bad-test-patterns.mjs';

// 将 RuleTester 的用例登记到 node:test，让失败和用例数量进入项目统一报告。
RuleTester.describe = describe;
RuleTester.it = it;

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
// 虚拟受检文件名：仅参与 exceptionFiles 的相对路径匹配，不做真实文件访问。
const exemptFile = path.join(repoRoot, 'scripts/tests/quality-exempt.test.mjs');
const pageTestFile = path.join(repoRoot, 'scripts/tests/page-interaction.test.mjs');

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

// ② 合规装配：node:test/assert 导入 + 紧邻「场景：」头注释 + 体内「输入：」注释。
// 仅用于以 test() 注册为载体的用例；body 为函数体的语句行（自带两空格缩进）。
const f_case = (scenario, body, title = '示例用例') =>
  [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    `// 场景：${scenario}`,
    `test('${title}', () => {`,
    `  // 输入：构造${scenario}的调用`,
    body,
    '});',
  ].join('\n') + '\n';

tester.run('no-bad-test-patterns', noBadTestPatterns, {
  valid: [
    // ---------- ①② 基线：合规用例不误报 ----------
    {
      name: '常规断言路径不误报',
      code: f_case('常规断言路径', "  const value = one();\n  assert.equal(value, 1, '应返回 1');"),
    },
    {
      name: 'it 注册同样按用例核验且合规放行',
      code: [
        "import { it } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：it 注册同样按用例核验',
        "it('示例用例', () => {",
        '  // 输入：构造调用',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
    },
    {
      name: '改名导入的 runner 按绑定归因放行',
      code: [
        "import { test as verify } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：改名导入仍按绑定归因核验',
        "verify('示例用例', () => {",
        '  // 输入：构造调用',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
    },
    {
      name: 'hook 注册不按用例核验注释也不要求断言',
      code: "import { beforeEach } from 'node:test';\n\nbeforeEach(() => {\n  prepare();\n});\n",
    },
    {
      name: '认可的测试选项不缩减执行',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：认可的测试选项不缩减执行',
        "test('示例用例', { concurrency: 2, timeout: 1000 }, () => {",
        '  // 输入：构造调用',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
    },
    {
      name: 'skip:false 非恒真选项放行',
      code: f_case('显式关闭 skip 的选项', "  assert.equal(one(), 1, '应返回 1');").replace(
        "test('示例用例', () => {",
        "test('示例用例', { skip: false }, () => {",
      ),
    },
    // ---------- ① 异常与等待语义放行面 ----------
    {
      name: 'catch 内有恢复语句放行',
      code: f_case('catch 内有恢复语句', "  try {\n    run();\n  } catch (error) {\n    throw error;\n  }\n  assert.equal(one(), 1, '应返回 1');"),
    },
    {
      name: 'try 体调用清理型 API 的容错空 catch 放行',
      code: f_case('清理容错空 catch', "  try {\n    nativeFs.rmSync(target, { recursive: true });\n  } catch {\n    // 单次清理失败不阻塞\n  }\n  assert.equal(one(), 1, '应返回 1');"),
    },
    {
      name: 't.after 内清理容错空 catch 放行',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：t.after 清理容错空 catch',
        "test('示例用例', (t) => {",
        '  // 输入：注册 after 清理',
        '  t.after(() => {',
        '    try {',
        '      nativeFs.rmSync(target, { recursive: true });',
        '    } catch {',
        '      // 清理失败不影响结果',
        '    }',
        '  });',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
    },
    {
      name: 'exit 处理器中的清理容错空 catch 放行',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：exit 清理容错空 catch',
        "test('示例用例', () => {",
        '  // 输入：注册进程退出清理',
        "  process.on('exit', () => {",
        '    try {',
        '      handle.release();',
        '    } catch {',
        '      // 退出阶段清理容错',
        '    }',
        '  });',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
    },
    {
      name: 'Promise.catch 有实际处理放行',
      code: 'loadConfig().catch((error) => {\n  throw error;\n});\n',
    },
    {
      name: 'await assert.rejects 带错误构造与消息放行',
      code: "await assert.rejects(bad(), SomeError, '应拒绝');\n",
    },
    {
      name: 'return assert.rejects 同样算等待',
      code: f_case('return 经认可的拒绝断言', "  return assert.rejects(bad(), SomeError, '应拒绝');"),
    },
    {
      name: '子测试经 await 等待放行',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：子测试经 await 等待',
        "test('示例用例', async (t) => {",
        '  // 输入：await 等待子测试',
        "  await t.test('子用例', () => {",
        "    assert.equal(one(), 1, '应返回 1');",
        '  });',
        '});',
      ].join('\n') + '\n',
    },
    {
      name: '定时 Promise 由 queueMicrotask 唤醒非固定睡眠',
      code: 'const waited = await new Promise((resolve) => queueMicrotask(resolve));\n',
    },
    {
      name: '故障注入 once 声明放行',
      code: "liteCmdGit.t_inject({ exit: 1, once: true });\n",
    },
    {
      name: '故障注入移除函数被接收放行',
      code: 'const remove = liteCmdGit.t_inject({ exit: 1 });\n',
    },
    // ---------- ① 故障注入之外的睡眠与非恒真断言 ----------
    {
      name: '非恒真的 equal 与带消息断言放行',
      code: "import assert from 'node:assert/strict';\nassert.equal(one(), 1, '应返回 1');\nassert.ok(one(), '应有结果');\n",
    },
    // ---------- ② 注释归属合规面 ----------
    {
      name: '预期编号连续且各组有断言放行',
      code: f_case('分段预期', "  const first = one();\n  // 预期 1：基础返回\n  assert.equal(first, 1, '应返回 1');\n  // 预期 2：再次调用返回增值\n  assert.equal(one(), 2, '应返回 2');"),
    },
    {
      name: '单组无编号预期兼容放行',
      code: f_case('单组预期', "  // 预期：应返回 1\n  assert.equal(one(), 1, '应返回 1');"),
    },
    {
      name: '子编号归并同组放行',
      code: f_case('子编号分组', "  // 预期 1：基础返回\n  assert.equal(one(), 1, '应返回 1');\n  // 预期 1a：同组细分形态\n  assert.equal(one('raw'), '1', '原始形态');\n  // 预期 2：增值返回\n  assert.equal(one(), 2, '应返回 2');"),
    },
    {
      name: '断言 helper 经 assertionHelperNames 认可放行',
      options: [{ assertionHelperNames: ['expectResult'] }],
      code: f_case('认可断言 helper', '  expectResult(one());'),
    },
    {
      name: 'allowedTestOptions 白名单覆盖后未知键放行',
      options: [{ allowedTestOptions: ['retry'] }],
      code: f_case('自定义选项白名单', "  assert.equal(one(), 1, '应返回 1');").replace(
        "test('示例用例', () => {",
        "test('示例用例', { retry: 2 }, () => {",
      ),
    },
    {
      name: 'requireItemNumber 开启且场景含有效单号放行',
      options: [{ requireItemNumber: true }],
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：REQ-20260101-001 验证单一行为',
        "test('示例用例', () => {",
        '  // 输入：构造调用',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
    },
    {
      name: 'playwright expect 链式断言认可放行',
      code: [
        "import { test } from 'node:test';",
        "import { expect } from '@playwright/test';",
        '',
        '// 场景：playwright expect 断言',
        "test('示例用例', () => {",
        '  // 输入：构造调用',
        '  const value = one();',
        '  expect(value).toBe(2);',
        '});',
      ].join('\n') + '\n',
    },
    // ---------- ③ 页面交互：默认关或安全形态放行 ----------
    {
      name: 'pageInteraction 关闭时交互语句放行',
      code: "page.route('**/api/users', (route) => route.fulfill({ json: {} }));\nfetch('https://api.example.com/users');\nbutton.dispatchEvent('click');\n",
    },
    {
      name: 'evaluate 内只读 fetch 放行',
      options: [{ pageInteraction: { banDirectHttp: true, fetchWriteInEvaluate: true } }],
      code: "await page.evaluate(() => fetch('/api/list'));\n",
    },
    {
      name: 'dispatchEvent 非 click 字面量放行',
      options: [{ pageInteraction: { syntheticClick: true } }],
      code: "await page.evaluate(() => {\n  panel.dispatchEvent(new Event('input'));\n});\n",
    },
    // ---------- 例外矩阵：文件级例外豁免①②，③ 窄例外独立 ----------
    {
      name: '文件级例外同时豁免①②（缺注释与缩减执行均不再报告）',
      filename: exemptFile,
      options: [{ scanPath: repoRoot, exceptionFiles: ['scripts/tests/quality-exempt.test.mjs'] }],
      code: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest.only('只跑这条', () => {\n  assert.equal(one(), 1, '应返回 1');\n});\n",
    },
    {
      name: 'pageInteraction 窄例外生效（route 桩不再报告）',
      filename: pageTestFile,
      options: [{ scanPath: repoRoot, pageInteraction: { routeStub: true, exceptionFiles: ['scripts/tests/page-interaction.test.mjs'] } }],
      code: "page.route('**/api/users', (route) => route.fulfill({ json: {} }));\n",
    },
  ],
  invalid: [
    // ---------- ① 缩减执行 ----------
    {
      name: 'test.only 成员形态缩减执行',
      code: f_case('only 成员缩减执行', "  assert.equal(one(), 1, '应返回 1');").replace(
        "test('示例用例', () => {",
        "test.only('示例用例', () => {",
      ),
      errors: [{
        messageId: 'reducedExecution',
        data: { form: 'test.only()' },
        line: 5, column: 6, endLine: 5, endColumn: 10,
      }],
      output: null,
    },
    {
      name: 'describe.skip 套件缩减执行',
      code: [
        "import { describe } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        "describe.skip('被跳过的套件', () => {",
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
      errors: [{ messageId: 'reducedExecution', data: { form: 'describe.skip()' } }],
      output: null,
    },
    {
      name: 'test.todo 注册缩减执行',
      code: "import { test } from 'node:test';\n\n// 场景：todo 注册缩减执行\ntest.todo('示例用例');\n",
      errors: [{ messageId: 'reducedExecution', data: { form: 'test.todo()' } }],
      output: null,
    },
    {
      name: '改名 runner 的 only 注册仍按绑定命中',
      code: f_case('改名的 only 注册仍按绑定命中', "  assert.equal(one(), 1, '应返回 1');").replace(
        "test('示例用例', () => {",
        "verify.only('示例用例', () => {",
      ).replace(
        "import { test } from 'node:test';",
        "import { test as verify } from 'node:test';",
      ),
      errors: [{ messageId: 'reducedExecution', data: { form: 'verify.only()' } }],
      output: null,
    },
    {
      name: 'skip 选项恒真缩减执行',
      code: f_case('skip 选项恒真缩减执行', "  assert.equal(one(), 1, '应返回 1');").replace(
        "test('示例用例', () => {",
        "test('示例用例', { skip: true }, () => {",
      ),
      errors: [{ messageId: 'reducedExecution', data: { form: '选项 { skip: … }' } }],
      output: null,
    },
    // ---------- ① 测试选项核验 ----------
    {
      name: '未知测试选项按允许清单报告',
      code: f_case('未知测试选项', "  assert.equal(one(), 1, '应返回 1');").replace(
        "test('示例用例', () => {",
        "test('示例用例', { retry: 2 }, () => {",
      ),
      errors: [{
        messageId: 'unknownTestOption',
        data: { key: 'retry', allowed: 'concurrency, timeout, skip, todo, only, signal, plan' },
      }],
      output: null,
    },
    {
      name: 'spread 选项对象无法静态核验',
      code: f_case('spread 选项对象', "  assert.equal(one(), 1, '应返回 1');").replace(
        "test('示例用例', () => {",
        "test('示例用例', { ...preset }, () => {",
      ),
      errors: [{ messageId: 'unresolvableTestOptions' }],
      output: null,
    },
    // ---------- ① 断言质量 ----------
    {
      name: '用例缺可诊断断言',
      code: f_case('无断言的用例', '  run();'),
      errors: [{ messageId: 'missingAssertion' }],
      output: null,
    },
    {
      name: '恒真 equal 断言报告',
      code: "import assert from 'node:assert/strict';\nassert.equal(1, 1, '恒真');\n",
      errors: [{ messageId: 'constantAssertion', data: { detail: '1 vs 1' } }],
      output: null,
    },
    {
      name: '恒真 ok(true) 报告',
      code: "import assert from 'node:assert/strict';\nassert.ok(true, '恒真');\n",
      errors: [{ messageId: 'constantAssertion', data: { detail: 'ok(true)' } }],
      output: null,
    },
    {
      name: '恒真 expect(1).toBe(1) 报告',
      code: "import { expect } from '@playwright/test';\nexpect(1).toBe(1);\n",
      errors: [{ messageId: 'constantAssertion', data: { detail: 'expect(1).toBe(同值)' } }],
      output: null,
    },
    {
      name: '恒真 expect(true).toBeTruthy() 报告',
      code: "import { expect } from '@playwright/test';\nexpect(true).toBeTruthy();\n",
      errors: [{ messageId: 'constantAssertion', data: { detail: 'expect(true).toBeTruthy()' } }],
      output: null,
    },
    {
      name: 'equal 断言缺诊断消息',
      code: "import assert from 'node:assert/strict';\nassert.equal(one(), 1);\n",
      errors: [{ messageId: 'missingAssertMessage', data: { method: 'equal' } }],
      output: null,
    },
    {
      name: 'throws 接 async 回调改用 rejects',
      code: "import assert from 'node:assert/strict';\nassert.throws(async () => bad(), TypeError, '应抛出');\n",
      errors: [{ messageId: 'throwsAsync', data: { method: 'throws' } }],
      output: null,
    },
    {
      name: 'throws 缺错误匹配且缺消息（两个违规按序报告）',
      code: "import assert from 'node:assert/strict';\nassert.throws(() => bad(), 'boom');\n",
      errors: [
        { messageId: 'throwsExpectation', data: { method: 'throws' } },
        { messageId: 'missingAssertMessage', data: { method: 'throws' } },
      ],
      output: null,
    },
    {
      name: 'rejects 未等待报告',
      code: "import assert from 'node:assert/strict';\nassert.rejects(bad(), SomeError, '应拒绝');\n",
      errors: [{ messageId: 'unawaitedRejects' }],
      output: null,
    },
    // ---------- ① 等待语义与跳过 ----------
    {
      name: '子测试未等待报告',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：子测试未等待',
        "test('示例用例', (t) => {",
        '  // 输入：注册未等待子测试',
        "  t.test('子用例', () => {",
        "    assert.equal(one(), 1, '应返回 1');",
        '  });',
        '});',
      ].join('\n') + '\n',
      errors: [{ messageId: 'unawaitedSubtest' }],
      output: null,
    },
    {
      name: 'TestContext t.skip 缩减执行',
      code: f_case('TestContext 缩减执行', "  assert.equal(one(), 1, '应返回 1');\n  t.skip();").replace(
        "test('示例用例', () => {",
        "test('示例用例', (t) => {",
      ),
      errors: [{ messageId: 'testContextSkip', data: { method: 'skip' } }],
      output: null,
    },
    {
      name: 'done 回调与 async 完成机制混用',
      code: f_case('回调与 Promise 混用', "  done();\n  assert.equal(one(), 1, '应返回 1');").replace(
        "test('示例用例', () => {",
        "test('示例用例', async (t, done) => {",
      ),
      errors: [{ messageId: 'callbackAndPromise', data: { kind: '回调' } }],
      output: null,
    },
    {
      name: '钩子 done 回调与 async 混用',
      code: [
        "import { beforeEach } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        'beforeEach(async (t, done) => {',
        '  done();',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
      errors: [{ messageId: 'callbackAndPromise', data: { kind: '钩子' } }],
      output: null,
    },
    // ---------- ① 吞错与固定睡眠 ----------
    {
      name: '空 catch 吞错（带参与无参各报告一处）',
      code: 'try {\n  run();\n} catch (error) {}\ntry {\n  other();\n} catch {}\n',
      errors: [
        { messageId: 'swallowCatch', data: { context: '（error）' } },
        { messageId: 'swallowCatch', data: { context: '' } },
      ],
      output: null,
    },
    {
      name: '仅注释的 catch 仍报告吞错',
      code: 'try {\n  run();\n} catch (error) {\n  // 暂时忽略\n}\n',
      errors: [{ messageId: 'swallowCatch', data: { context: '（error）' } }],
      output: null,
    },
    {
      name: 'Promise.catch 空回调吞错',
      code: 'loadConfig().catch(() => {});\n',
      errors: [{ messageId: 'swallowPromiseCatch' }],
      output: null,
    },
    {
      name: 'setTimeout 直呼 resolve 固定睡眠',
      code: 'const waited = await new Promise((resolve) => setTimeout(resolve, 100));\n',
      errors: [{ messageId: 'fixedSleep' }],
      output: null,
    },
    {
      name: 'setTimeout 回调内 resolve 同判固定睡眠',
      code: 'const waited = await new Promise((resolve) => setTimeout(() => resolve(1), 50));\n',
      errors: [{ messageId: 'fixedSleep' }],
      output: null,
    },
    {
      name: '故障注入移除函数被丢弃报告',
      code: 'liteCmdGit.t_inject({ exit: 1 });\n',
      errors: [{ messageId: 'unregisteredInject' }],
      output: null,
    },
    // ---------- ② 注释归属 ----------
    {
      name: '文件头说明不能代替用例场景注释',
      code: [
        '// 本文件头部说明：不作为用例的场景注释',
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        "test('示例用例', () => {",
        '  // 输入：构造调用',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
      errors: [{ messageId: 'missingScenario', data: { title: '示例用例' } }],
      output: null,
    },
    {
      name: '场景说明为占位内容按缺失报告',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：待补充',
        "test('示例用例', () => {",
        '  // 输入：构造调用',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
      errors: [{ messageId: 'missingScenario', data: { title: '示例用例' } }],
      output: null,
    },
    {
      name: '体内缺输入说明报告',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：缺少输入说明的用例',
        "test('示例用例', () => {",
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
      errors: [{ messageId: 'missingInput', data: { title: '示例用例' } }],
      output: null,
    },
    {
      name: '预期编号跳号报告',
      code: f_case('预期编号跳号', "  // 预期 1：基础返回\n  assert.equal(one(), 1, '应返回 1');\n  // 预期 3：增值返回\n  assert.equal(one(), 3, '应返回 3');"),
      errors: [{ messageId: 'expectNumbering', data: { title: '示例用例', detail: '为 3，应为 2' } }],
      output: null,
    },
    {
      name: '无编号预期与编号分组混用报告',
      code: f_case('混用无编号预期', "  // 预期 1：基础返回\n  assert.equal(one(), 1, '应返回 1');\n  // 预期：无编号补充说明\n  assert.equal(one('raw'), '1', '原始形态');"),
      errors: [{ messageId: 'expectNumbering', data: { title: '示例用例', detail: '混用无编号「预期：」（仅单组兼容）' } }],
      output: null,
    },
    {
      name: '预期分组内缺断言报告',
      code: f_case('预期分组缺断言', "  const first = one();\n  // 预期 1：基础返回\n  run();\n  // 预期 2：增值返回\n  assert.equal(one(), 2, '应返回 2');"),
      errors: [{ messageId: 'expectGroupNoAssertion', data: { title: '示例用例', group: '预期 1' } }],
      output: null,
    },
    {
      name: '预期说明为占位内容报告',
      code: f_case('预期占位内容', "  // 预期 1：待补充\n  assert.equal(one(), 1, '应返回 1');"),
      errors: [{ messageId: 'expectPlaceholder', data: { title: '示例用例' } }],
      output: null,
    },
    {
      name: 'requireItemNumber 开启后缺单号报告',
      options: [{ requireItemNumber: true }],
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：验证单一行为',
        "test('示例用例', () => {",
        '  // 输入：构造调用',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
      errors: [{ messageId: 'missingItemNumber', data: { title: '示例用例' } }],
      output: null,
    },
    // ---------- ③ 页面交互真实性 ----------
    {
      name: 'route 桩伪造响应报告',
      options: [{ pageInteraction: { routeStub: true } }],
      code: "page.route('**/api/users', (route) => route.fulfill({ json: {} }));\n",
      errors: [{ messageId: 'routeStub', line: 1, column: 6, endLine: 1, endColumn: 11 }],
      output: null,
    },
    {
      name: 'evaluate 回调内写方法 fetch 报告',
      options: [{ pageInteraction: { fetchWriteInEvaluate: true } }],
      code: "await page.evaluate(() => {\n  fetch('/api/save', { method: 'POST', body: payload });\n});\n",
      errors: [{ messageId: 'fetchWrite' }],
      output: null,
    },
    {
      name: 'evaluate 字符串脚本内写 fetch 按已知形态报告',
      options: [{ pageInteraction: { fetchWriteInEvaluate: true } }],
      code: "await page.evaluate(\"fetch('/api/save', { method: 'POST' })\");\n",
      errors: [{ messageId: 'fetchWrite' }],
      output: null,
    },
    {
      name: 'Node 侧裸 fetch 直发请求报告',
      options: [{ pageInteraction: { banDirectHttp: true } }],
      code: "fetch('https://api.example.com/users');\n",
      errors: [{ messageId: 'directHttp', data: { name: 'fetch' } }],
      output: null,
    },
    {
      name: 'Node 侧 XMLHttpRequest 实例化报告',
      options: [{ pageInteraction: { banDirectHttp: true } }],
      code: 'new XMLHttpRequest();\n',
      errors: [{ messageId: 'directHttp', data: { name: 'XMLHttpRequest' } }],
      output: null,
    },
    {
      name: 'dispatchEvent click 字面量合成事件报告',
      options: [{ pageInteraction: { syntheticClick: true } }],
      code: "button.dispatchEvent('click');\n",
      errors: [{ messageId: 'syntheticClick', line: 1, column: 8, endLine: 1, endColumn: 21 }],
      output: null,
    },
    {
      name: 'evaluate 内 MouseEvent click 合成事件报告',
      options: [{ pageInteraction: { syntheticClick: true } }],
      code: "await page.evaluate(() => {\n  panel.dispatchEvent(new MouseEvent('click'));\n});\n",
      errors: [{ messageId: 'syntheticClick' }],
      output: null,
    },
    // ---------- 例外分列：全局例外不豁免③、窄例外不掩盖① ----------
    {
      name: '文件级例外不豁免③（route 桩仍报告）',
      filename: exemptFile,
      options: [{ scanPath: repoRoot, exceptionFiles: ['scripts/tests/quality-exempt.test.mjs'], pageInteraction: { routeStub: true } }],
      code: "page.route('**/api/users', (route) => route.fulfill({ json: {} }));\n",
      errors: [{ messageId: 'routeStub' }],
      output: null,
    },
    {
      name: '窄例外不掩盖同文件质量违规',
      filename: pageTestFile,
      options: [{ scanPath: repoRoot, pageInteraction: { routeStub: true, exceptionFiles: ['scripts/tests/page-interaction.test.mjs'] } }],
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        "page.route('**/api/users', (route) => route.fulfill({ json: {} }));",
        '',
        '// 场景：窄例外不豁免质量模式',
        "test.only('示例用例', () => {",
        '  // 输入：构造缩减执行',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
      ].join('\n') + '\n',
      errors: [{ messageId: 'reducedExecution', data: { form: 'test.only()' } }],
      output: null,
    },
    // ---------- 多违规聚合 ----------
    {
      name: '同一文件多个用例分别报告',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：缩减执行的第一条用例',
        "test.only('第一条', () => {",
        '  // 输入：构造缩减执行',
        "  assert.equal(one(), 1, '应返回 1');",
        '});',
        '',
        '// 场景：缺断言的第二条用例',
        "test('第二条', () => {",
        '  // 输入：仅有副作用',
        '  run();',
        '});',
      ].join('\n') + '\n',
      errors: [
        { messageId: 'reducedExecution', data: { form: 'test.only()' } },
        { messageId: 'missingAssertion' },
      ],
      output: null,
    },
    {
      name: '单条用例多重违规按序报告',
      code: [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        '',
        '// 场景：单条用例多重违规',
        "test('示例用例', () => {",
        '  // 输入：缺消息与恒真并存',
        '  assert.equal(one(), 1);',
        "  assert.ok(true, '恒真');",
        '});',
      ].join('\n') + '\n',
      errors: [
        { messageId: 'missingAssertMessage', data: { method: 'equal' } },
        { messageId: 'constantAssertion', data: { detail: 'ok(true)' } },
      ],
      output: null,
    },
  ],
});

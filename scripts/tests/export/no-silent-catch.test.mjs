// 使用官方 RuleTester 执行真实规则；受检代码直接传字符串，无需文件系统或命令模拟。
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import noSilentCatch from 'atb-eslint-plugin/rules/no-silent-catch.mjs';

// 将 RuleTester 的用例登记到 node:test，让失败和用例数量进入项目统一报告。
RuleTester.describe = describe;
RuleTester.it = it;

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
// 虚拟受检文件名：仅参与 exceptionFiles 的相对路径匹配，不做真实文件访问。
const filename = path.join(repoRoot, 'scripts/tests/quality-exempt.test.mjs');
const tester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

/** 场景：有明确处理的 catch 放行，空或仅注释的 catch 精确报告，且不擅自修复。 */
tester.run('no-silent-catch', noSilentCatch, {
  valid: [
    // 场景：没有 catch 的正常代码与 try/finally 清理不属于吞错检查。
    { name: '普通代码不误报', code: 'run();' },
    { name: '只有 finally 的清理不误报', code: 'try { run(); } finally { cleanup(); }' },
    // 场景：重抛、记录、返回错误和清理均为现有规则允许的处理语句。
    { name: '重新抛出错误', code: 'try { run(); } catch (error) { throw error; }' },
    { name: '记录错误', code: 'try { run(); } catch (error) { console.error(error); }' },
    {
      name: '返回明确的错误结果',
      code: 'function runSafely() { try { return run(); } catch (error) { return { error }; } }',
    },
    {
      name: '等待错误处理并执行清理',
      code: 'try { run(); } catch (error) { await handle(error); cleanup(); }',
    },
    { name: '省略 catch 参数但有恢复操作', code: 'try { run(); } catch { recover(); }' },
    {
      name: '嵌套 catch 各自处理错误',
      code: 'try { run(); } catch (outer) { try { recover(); } catch (inner) { throw inner; } }',
    },
  ],
  invalid: [
    // 场景：空 catch 报告块的位置与实际文件名，不提供无法推断的自动修复。
    {
      name: '空 catch 报告吞错',
      filename,
      code: 'try {\n  run();\n} catch (error) {\n}\n',
      errors: [{
        messageId: 'swallowedError',
        data: { file: filename },
        type: 'BlockStatement',
        line: 3, column: 17, endLine: 4, endColumn: 2,
      }],
      output: null,
    },
    // 场景：行注释与块注释都不能代替错误处理。
    {
      name: '只有行注释仍报告吞错',
      filename,
      code: 'try { run(); } catch (error) {\n  // 暂时忽略错误\n}',
      errors: [{ messageId: 'swallowedError', data: { file: filename }, type: 'BlockStatement' }],
      output: null,
    },
    {
      name: '只有块注释仍报告吞错',
      filename,
      code: 'try { run(); } catch (error) { /* 已知错误 */ }',
      errors: [{ messageId: 'swallowedError', data: { file: filename }, type: 'BlockStatement' }],
      output: null,
    },
    // 场景：省略错误参数或追加 finally，都不能让空 catch 获得豁免。
    {
      name: '省略参数的空 catch 仍报告吞错',
      filename,
      code: 'try { run(); } catch {}',
      errors: [{ messageId: 'swallowedError', data: { file: filename }, type: 'BlockStatement' }],
      output: null,
    },
    {
      name: 'finally 清理不能代替 catch 内的错误处理',
      filename,
      code: 'try { run(); } catch (error) {} finally { cleanup(); }',
      errors: [{ messageId: 'swallowedError', data: { file: filename }, type: 'BlockStatement' }],
      output: null,
    },
    // 场景：外层存在恢复语句时，仍须独立检查内层 catch。
    {
      name: '外层有处理时仍检出内层空 catch',
      filename,
      code: 'try {\n  run();\n} catch (outer) {\n  try {\n    recover();\n  } catch (inner) {}\n}\n',
      errors: [{
        messageId: 'swallowedError',
        data: { file: filename },
        type: 'BlockStatement',
        line: 6, column: 19, endLine: 6, endColumn: 21,
      }],
      output: null,
    },
    // 场景：同一文件的多个吞错点全部报告，不能只检出第一处。
    {
      name: '同一文件中的两处空 catch 分别报告',
      filename,
      code: 'try {\n  first();\n} catch (error) {\n}\ntry {\n  second();\n} catch (error) {\n}\n',
      errors: [
        {
          messageId: 'swallowedError',
          data: { file: filename },
          type: 'BlockStatement',
          line: 3, column: 17, endLine: 4, endColumn: 2,
        },
        {
          messageId: 'swallowedError',
          data: { file: filename },
          type: 'BlockStatement',
          line: 7, column: 17, endLine: 8, endColumn: 2,
        },
      ],
      output: null,
    },
  ],
});

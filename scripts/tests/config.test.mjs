// createConfig 配置工厂用例：结构断言与真实 ESLint 行为验证双口径。
// 用例标题以 valid（期望放行 / 形态正确）/ invalid（期望抛错 / 命中报告）区分两类用例，
// valid 组声明在前先执行，invalid 组在后。工厂为纯函数（无 fs / 无命令面），结构面直接
// 断言产出数组的三块形态与选项契约；行为面经真实 ESLint 类（lintText + overrideConfig）
// 执行——忽略豁免判定在 ESLint 类的文件面（Linter.verify 不做忽略），故行为面不走 Linter，
// 验证通配符导入禁令、finally 安全与内置忽略层真实生效。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import createConfigDefault, { createConfig } from 'atb-eslint-plugin/config.mjs';
import atbRules from 'atb-eslint-plugin/plugin.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
// 内置忽略层的完整模式清单（八层语义展开为 10 条 glob）。
const BUILTIN_IGNORES = [
  'node_modules/**', '**/.*', '**/.*/**', '**/temp/**', '**/tmp/**',
  '**/coverage/**', '**/output/**', '**/*.min.js', 'image/**', 'agent-team-board/**',
];
// 真实 ESLint 实例装配：overrideConfig 注入工厂产出（overrides 覆盖布局选项），忽略豁免由 ESLint 文件面判定。
const f_eslint = (overrides = {}) => new ESLint({
  overrideConfigFile: true,
  overrideConfig: createConfig({ root: repoRoot, ...overrides }),
  cwd: repoRoot,
});

// ---------- valid：期望放行 / 形态正确 ----------

/** 场景：合法绝对路径 root 通过校验。 */
test('valid：合法 root 通过校验', () => {
  assert.doesNotThrow(() => createConfig({ root: repoRoot }), '绝对路径 root 应通过');
});

/** 场景：最佳模板形态只传 root，产出恰好七块——内置忽略层、插件注册、三条内置基线、访问级别分级与越级访问。 */
test('valid：最佳模板产出七块', () => {
  const config = createConfig({ root: repoRoot });
  assert.ok(Array.isArray(config), '产出应为 flat config 数组');
  assert.equal(config.length, 7, '默认模板应恰好七块：忽略层 / 插件注册 / 基线 1-3 / 访问级别分级 / 越级访问');
  assert.deepEqual(Object.keys(config[0]), ['ignores'], '首块应为纯忽略层');
  assert.deepEqual(Object.keys(config[1]), ['plugins'], '次块应为插件注册');
  assert.deepEqual(config[1].plugins, { atb: atbRules }, '缺省仅注册 atb 规则集');
  assert.deepEqual(config[2].files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '规则块应统一覆盖三扩展名');
  assert.deepEqual(config[2].languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(config[2].rules['no-restricted-syntax'], ['error', {
    selector: 'ImportNamespaceSpecifier',
    message: "禁止 'import * as' 通配符导入：按实际使用的公共导出写具名导入",
  }], '通配符导入禁令块形态精确');
  assert.deepEqual(config[3].files, ['**/*.js', '**/*.mjs', '**/*.cjs'], 'finally 安全块统一覆盖三扩展名');
  assert.deepEqual(config[3].languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(config[3].rules, { 'no-unsafe-finally': 'error' }, 'finally 安全块为内置基线规则');
  assert.deepEqual(config[4].files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '吞错检查块统一覆盖三扩展名');
  assert.deepEqual(config[4].languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(config[4].rules, { 'atb/no-silent-catch': 'error' }, '内置基线 3 为吞错检查');
  assert.deepEqual(config[5].files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '访问级别分级块统一覆盖三扩展名');
  assert.deepEqual(config[5].languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(config[5].rules, {
    'atb/no-wrong-access-level': ['error', { testDir: 'scripts/tests' }],
  }, '访问级别分级块：f_ 分级 + 测试文件导出面 t_（testDir 相对仓库根原样透传）');
  assert.deepEqual(config[6].files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '越级访问块统一覆盖三扩展名');
  assert.deepEqual(config[6].languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(config[6].rules, {
    'atb/no-out-of-level-access': ['error', { testDir: 'scripts/tests' }],
  }, '越级访问块：项目根自锚定（无需 scanPath）+ 测试目录 testDir 同名透传');
});

/** 场景：八层内置忽略逐层在位且精确，缺省无调用方追加。 */
test('valid：内置忽略层精确形态', () => {
  const config = createConfig({ root: repoRoot });
  assert.deepEqual(config[0].ignores, BUILTIN_IGNORES, '缺省忽略层应为完整内置清单');
});

/** 场景：调用方 ignores 追加在内置层之后，不覆盖内置项。 */
test('valid：调用方 ignores 追加在尾', () => {
  const config = createConfig({ root: repoRoot, ignores: ['vendor/**', 'playground/**'] });
  const ignores = config[0].ignores;
  for (const pattern of BUILTIN_IGNORES) {
    assert.ok(ignores.includes(pattern), `内置忽略应保留：${pattern}`);
  }
  assert.deepEqual(ignores.slice(-2), ['vendor/**', 'playground/**'], '调用方 ignores 应追加在内置层之后');
});

/** 场景：depsDir 覆盖第一层依赖忽略，缺省为 node_modules。 */
test('valid：depsDir 覆盖依赖忽略层', () => {
  const custom = createConfig({ root: repoRoot, depsDir: 'vendor' });
  assert.ok(custom[0].ignores.includes('vendor/**'), '自定义依赖目录应进入忽略层');
  assert.ok(!custom[0].ignores.includes('node_modules/**'), '缺省依赖目录不应残留');
  assert.ok(createConfig({ root: repoRoot })[0].ignores.includes('node_modules/**'), '缺省依赖目录为 node_modules');
});

/** 场景：调用方 plugins 与 atb 并存注册，atb 身份保持不变。 */
test('valid：plugins 合并注册', () => {
  const customPlugin = { rules: {} };
  const config = createConfig({ root: repoRoot, plugins: { custom: customPlugin } });
  assert.equal(config[1].plugins.atb, atbRules, 'atb 应保持登记且为同一规则集实例');
  assert.equal(config[1].plugins.custom, customPlugin, '调用方插件应并入注册');
});

/** 场景：默认导出与具名导出为同一工厂。 */
test('valid：默认导出同一性', () => {
  assert.equal(createConfigDefault, createConfig, 'default 导出应与具名导出同一');
});

/** 场景：布局选项按块启用状态回归——testDir 经启用的分级块产出 testPaths，libDir 仍仅服务于停用块。 */
test('valid：布局选项按块启用状态回归', () => {
  const withTestDir = createConfig({ root: repoRoot, testDir: 'tests' });
  assert.deepEqual(withTestDir[5].rules['atb/no-wrong-access-level'][1].testDir, 'tests',
    'testDir 覆盖应经启用的访问级别分级块原样透传');
  const withLibDir = createConfig({ root: repoRoot, libDir: 'src/lib' });
  const defaults = createConfig({ root: repoRoot });
  assert.deepEqual(withLibDir, defaults, 'libDir 在 lib 分层块停用时应不影响产出');
});

/** 场景：真实 ESLint 以产出配置执行——具名导入按禁令意图放行。 */
test('valid：真实 ESLint 具名导入放行', async () => {
  const eslint = f_eslint();
  const results = await eslint.lintText("import { parse } from 'node:util';\n", { filePath: 'src/app.mjs' });
  assert.deepEqual(results[0].messages, [], '具名导入应放行');
});

/** 场景：内置忽略层在真实 ESLint 下真实豁免八类路径样本。 */
test('valid：真实 ESLint 忽略样本豁免', async () => {
  const eslint = f_eslint();
  const offending = "import * as util from 'node:util';\n";
  const ignoredSamples = [
    'node_modules/pkg/index.js', // 依赖目录
    '.hidden/secret.js', // 点号隐藏目录
    'dist/temp/cache.js', // temp 临时目录
    'build/tmp/scratch.js', // tmp 临时目录
    'reports/coverage/lcov.js', // coverage 产物目录
    'build/output/report.js', // output 产物目录
    'static/lib.bundle.min.js', // 压缩产物文件
    'image/preview.js', // 资产目录
    'agent-team-board/data/store.js', // 看板数据目录
  ];
  for (const filename of ignoredSamples) {
    const results = await eslint.lintText(offending, { filePath: filename, warnIgnored: false });
    assert.deepEqual(results, [], `${filename} 应被内置忽略层豁免`);
  }
});

/** 场景：调用方 ignores 在真实 ESLint 下真实豁免，内置管辖面不受影响。 */
test('valid：真实 ESLint 调用方 ignores 豁免', async () => {
  const eslint = f_eslint({ ignores: ['playground/**'] });
  const offending = "import * as util from 'node:util';\n";
  const results = await eslint.lintText(offending, { filePath: 'playground/demo.js', warnIgnored: false });
  assert.deepEqual(results, [], '追加忽略路径应被真实豁免');
  const [result] = await eslint.lintText(offending, { filePath: 'src/app.js' });
  assert.equal(result.messages.length, 1, '内置管辖面不受调用方 ignores 影响');
});

/** 场景：depsDir 覆盖在真实 ESLint 下真实豁免新依赖目录。 */
test('valid：真实 ESLint depsDir 覆盖豁免', async () => {
  const eslint = f_eslint({ depsDir: 'vendor' });
  const offending = "import * as util from 'node:util';\n";
  const results = await eslint.lintText(offending, { filePath: 'vendor/pkg/index.js', warnIgnored: false });
  assert.deepEqual(results, [], '覆盖后的依赖目录应被真实豁免');
  const [result] = await eslint.lintText(offending, { filePath: 'src/app.js' });
  assert.equal(result.messages.length, 1, '规则块仍正常管辖生产目录');
});

/** 场景：角色目录（testDir/libDir）不在内置忽略面，违规照常命中。 */
test('valid：真实 ESLint 角色目录受管', async () => {
  const eslint = f_eslint();
  const offending = "import * as util from 'node:util';\n";
  const [testResult] = await eslint.lintText(offending, { filePath: 'scripts/tests/a.js' });
  assert.equal(testResult.messages.length, 1, '测试目录应受管辖');
  const [libResult] = await eslint.lintText(offending, { filePath: 'scripts/lib/util.js' });
  assert.equal(libResult.messages.length, 1, '共享代码目录应受管辖');
});

/** 场景：cjs 受三扩展名管辖且按 commonjs 推断可正常解析。 */
test('valid：真实 ESLint cjs 受管可解析', async () => {
  const eslint = f_eslint();
  const results = await eslint.lintText('const value = 1;\n', { filePath: 'src/plain.cjs' });
  assert.equal(results.length, 1, 'cjs 文件应受管辖（返回结果而非忽略）');
  assert.deepEqual(results[0].messages, [], 'cjs 普通代码应可解析无诊断');
});

/** 场景：规则块 files 范围外的扩展名不受管辖（连结果对象都不产）。 */
test('valid：真实 ESLint files 范围外不受管辖', async () => {
  const eslint = f_eslint();
  const offending = "import * as util from 'node:util';\n";
  for (const filename of ['src/app.ts', 'docs/guide.md', 'src/data.json']) {
    const results = await eslint.lintText(offending, { filePath: filename, warnIgnored: false });
    assert.deepEqual(results, [], `${filename} 不在 jsGlobs 范围内，应不受管辖`);
  }
});

/** 场景：finally 安全块真实执行——仅清理语句的 finally 放行。 */
test('valid：真实 ESLint finally 清理放行', async () => {
  const eslint = f_eslint();
  const results = await eslint.lintText('try {\n  run();\n} catch (error) {\n  handle(error);\n} finally {\n  cleanup();\n}\n', { filePath: 'src/flow.js' });
  assert.deepEqual(results[0].messages, [], '仅清理语句的 finally 应放行');
});

/** 场景：finally 内函数作用域的 return 放行——声明函数与箭头函数两形态。 */
test('valid：真实 ESLint finally 内函数作用域 return 放行', async () => {
  const eslint = f_eslint();
  const code = 'function f_declared() {\n  try {\n    run();\n  } finally {\n    function inner() {\n      return 1;\n    }\n  }\n}\n\nconst f_arrow = () => {\n  try {\n    run();\n  } finally {\n    const g = () => {\n      return 2;\n    };\n  }\n};\n';
  const results = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.deepEqual(results[0].messages, [], '函数作用域内的 return 不覆盖外部控制流，应放行');
});

/** 场景：吞错检查真实执行——catch 内有恢复语句放行。 */
test('valid：真实 ESLint 处理型 catch 放行', async () => {
  const eslint = f_eslint();
  const code = 'try {\n  run();\n} catch (error) {\n  handle(error);\n}\n';
  const results = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.deepEqual(results[0].messages, [], '有错误处理的 catch 应放行');
});

// ---------- invalid：期望抛错 / 命中报告 ----------

/** 场景：缺 root 直接抛错，错误消息指明绝对路径要求。 */
test('invalid：缺 root 抛错', () => {
  assert.throws(() => createConfig(), /root 为仓库根绝对路径/, '缺 root 应抛错');
  assert.throws(() => createConfig({}), /root 为仓库根绝对路径/, '空 options 应抛错');
});

/** 场景：相对路径 root 抛错。 */
test('invalid：相对路径 root 抛错', () => {
  assert.throws(() => createConfig({ root: 'lib/../' }), /root 为仓库根绝对路径/, '路径表达式 root 应抛错');
  assert.throws(() => createConfig({ root: 'scripts/tests' }), /root 为仓库根绝对路径/, '目录相对路径 root 应抛错');
});

/** 场景：通配符导入在真实 ESLint 下命中禁令，生产目录不受忽略层豁免。 */
test('invalid：真实 ESLint 通配符导入命中', async () => {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import * as util from 'node:util';\n", { filePath: 'src/app.js' });
  assert.equal(result.messages.length, 1, '通配符导入应命中一条');
  assert.match(result.messages[0].message, /通配符导入/, '应使用工厂定义的禁令文案');
  assert.equal(result.messages[0].ruleId, 'no-restricted-syntax', '命中规则应为 no-restricted-syntax');
});

/** 场景：规则块 files 的 jsGlobs 三段 glob 对深层路径仍命中。 */
test('invalid：真实 ESLint files 深层路径命中', async () => {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import * as util from 'node:util';\n", { filePath: 'a/b/c.js' });
  assert.equal(result.messages.length, 1, '深层路径应被 glob 命中');
  assert.equal(result.messages[0].ruleId, 'no-restricted-syntax', '命中规则应为 no-restricted-syntax');
});

/** 场景：解析面不锁 sourceType 的推断后果——cjs 按 commonjs 解析，ESM 语法为致命解析错误。 */
test('invalid：cjs 的 ESM 语法致命解析', async () => {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import * as util from 'node:util';\n", { filePath: 'src/legacy.cjs' });
  assert.equal(result.messages.length, 1, '应报告一条致命解析错误');
  assert.equal(result.messages[0].fatal, true, '应为致命解析错误');
  assert.equal(result.messages[0].ruleId, null, '解析错误不归属规则');
});

/** 场景：finally 安全块真实执行——finally 内 return 覆盖 catch 语义命中。 */
test('invalid：finally 内 return 命中', async () => {
  const eslint = f_eslint();
  const code = 'function f_flow() {\n  try {\n    run();\n  } catch (error) {\n    handle(error);\n  } finally {\n    return 1;\n  }\n}\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, 'finally 内 return 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：finally 内 throw 覆盖 try/catch 抛出语义命中。 */
test('invalid：finally 内 throw 命中', async () => {
  const eslint = f_eslint();
  const code = 'function f_flow() {\n  try {\n    run();\n  } finally {\n    throw new Error("boom");\n  }\n}\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, 'finally 内 throw 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：finally 内 break 覆盖迭代语义命中（break 须在循环内才合法）。 */
test('invalid：finally 内 break 命中', async () => {
  const eslint = f_eslint();
  const code = 'for (;;) {\n  try {\n    run();\n  } finally {\n    break;\n  }\n}\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, 'finally 内 break 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：finally 内 continue 覆盖迭代语义命中（continue 须在循环内才合法）。 */
test('invalid：finally 内 continue 命中', async () => {
  const eslint = f_eslint();
  const code = 'while (check()) {\n  try {\n    run();\n  } finally {\n    continue;\n  }\n}\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, 'finally 内 continue 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：嵌套 try 的内层 finally return 命中（规则递归到嵌套 finalizer）。 */
test('invalid：嵌套 finally 的内层 return 命中', async () => {
  const eslint = f_eslint();
  const code = 'function f_flow() {\n  try {\n    run();\n  } finally {\n    try {\n      step();\n    } finally {\n      return 1;\n    }\n  }\n}\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, '嵌套内层 finally 的 return 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：块语句与 if 包裹的 return 命中（规则递归到嵌套语句，两形态各报一条）。 */
test('invalid：finally 内嵌套包裹的 return 命中', async () => {
  const eslint = f_eslint();
  const code = 'function f_block() {\n  try {\n    run();\n  } finally {\n    { return 1; }\n  }\n}\n\nfunction f_branch() {\n  try {\n    run();\n  } finally {\n    if (flag) {\n      return 2;\n    }\n  }\n}\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 2, '块包裹与 if 包裹应各命中一条');
  for (const message of result.messages) {
    assert.equal(message.ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
  }
});

/** 场景：吞错检查真实执行——生产目录空 catch 命中。 */
test('invalid：生产目录空 catch 命中', async () => {
  const eslint = f_eslint();
  const [result] = await eslint.lintText('try {\n  run();\n} catch (error) {\n}\n', { filePath: 'src/app.js' });
  assert.equal(result.messages.length, 1, '空 catch 应命中一条');
  assert.equal(result.messages[0].ruleId, 'atb/no-silent-catch', '命中规则应为 atb/no-silent-catch');
});

/** 场景：吞错检查为全域基线——测试目录的空 catch 同受管辖。 */
test('invalid：测试目录空 catch 同受管辖', async () => {
  const eslint = f_eslint();
  const [result] = await eslint.lintText('try {\n  run();\n} catch {}\n', { filePath: 'scripts/tests/a.mjs' });
  assert.equal(result.messages.length, 1, '测试目录空 catch 应命中一条');
  assert.equal(result.messages[0].ruleId, 'atb/no-silent-catch', '命中规则应为 atb/no-silent-catch');
});

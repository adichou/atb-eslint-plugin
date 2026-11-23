// createConfig 配置工厂用例：结构断言与真实 ESLint 行为验证双口径。
// 用例标题以 valid（期望放行 / 形态正确）/ invalid（期望抛错 / 命中报告）区分两类用例，
// valid 组声明在前先执行，invalid 组在后。工厂为纯函数（无 fs / 无命令面），结构面直接
// 断言规则接线、作用范围与选项契约，不固定配置块数量；行为面经真实 ESLint 类（lintText + overrideConfig）
// 执行，保留 ESLint 对忽略文件与文件角色的处理；项目清单与源文件在 lite-fs 内存卷装配。
// 每例独立项目并复位，验证通配符导入禁令、finally 安全与内置忽略层生效。
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { ESLint } from 'eslint';
import createConfigDefault, { createConfig } from 'atb-eslint-plugin/config.mjs';
import atbRules from 'atb-eslint-plugin/plugin.mjs';
import { i_createFixture } from '../lint-fixture.mjs';
import { i_QUALITY_RULES, i_BOUNDARY_RULES } from '../rule-groups.mjs';

let repoRoot;

// 工厂与 ESLint 保持真实实现；清单、依赖消费证据和配置守护证据由内存项目提供。
beforeEach(() => {
  repoRoot = i_createFixture({
    'package.json': JSON.stringify({
      name: 'atb-eslint-plugin',
      type: 'module',
      exports: { '.': './scripts/plugin.mjs' },
      dependencies: { 'litenvi-node': '1.0.0' },
      devDependencies: { eslint: '9.39.4' },
    }),
    'scripts/atb.mjs': 'export const thing = 1;',
    'scripts/plugin.mjs': "import fs from 'litenvi-node/lite-fs.mjs';\nexport default { rules: {} };\n",
    'scripts/lib/attributions.mjs': 'export function i_minimatch() {}\n',
    'eslint.config.mjs': 'export default [];\n',
    'scripts/tests/export/config.test.mjs': "const f_configs = ['package.json', 'eslint.config.mjs'];\n",
    // 配置守护规则的证据面：假仓库作为「最佳模板仓库」自带两个守护测试（真实读取 + 字段断言），
    // 依赖链用例不被配置守护块干扰。
    'scripts/tests/export/package.test.mjs': "import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nconst m = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));\nassert.equal(m.name, 'atb-eslint-plugin');\nassert.ok(Object.hasOwn(m.exports, '.'));\n",
    'scripts/tests/export/eslint.config.test.mjs': "import assert from 'node:assert/strict';\nimport cfg from '../../../eslint.config.mjs';\nassert.ok(cfg.plugins !== undefined, 'plugins 在位');\n",
  });
});

afterEach(() => { fs.t_unmock(); });
// 内置忽略层的完整模式清单（八层语义展开为 10 条 glob）。
const BUILTIN_IGNORES = [
  'node_modules/**', '**/.*', '**/.*/**', '**/temp/**', '**/tmp/**',
  '**/coverage/**', '**/output/**', '**/*.min.js', 'image/**', 'agent-team-board/**',
];
// 真实 ESLint 实例装配：overrideConfig 注入工厂产出（overrides 覆盖布局选项），忽略豁免由 ESLint 文件面判定。
const f_eslint = (overrides = {}) => new ESLint({
  overrideConfigFile: true,
  overrideConfig: createConfig(overrides),
  cwd: repoRoot,
});

// 配置分组可调整顺序，按规则身份定位待验证的作用范围与选项。
const f_ruleBlock = (config, id) => config.find(block => Object.hasOwn(block.rules || {}, id));

// ---------- valid：期望放行 / 形态正确 ----------

/** 场景：无需传入根目录，无参数与空对象使用相同默认配置。 */
test('valid：无参数与空对象生成相同配置', function test_valid_无参数与空对象生成相同配置() {
  assert.deepEqual(createConfig(), createConfig({}), '默认配置不应依赖多余的根目录参数');
});

/** 场景：最佳模板形态无需参数，默认包含 JSON 清单检查及原有 JS 规则。 */
test('valid：最佳模板默认包含清单检查', function test_valid_最佳模板默认包含清单检查() {
  const config = createConfig();
  assert.ok(Array.isArray(config), '产出应为 flat config 数组');
  const ruleIds = config.flatMap(block => Object.keys(block.rules || {}));
  assert.equal(ruleIds.length, new Set(ruleIds).size, '规则 ID 不应重复声明，避免分组调整时意外覆盖');
  for (const name of [...i_QUALITY_RULES, ...i_BOUNDARY_RULES, 'no-unmocked-litenvi-in-test']) {
    const id = `atb/${name}`, block = f_ruleBlock(config, id);
    assert.ok(block, `${id}应在默认配置中启用`);
    assert.deepEqual(block.files, ['scripts/tests/**/*.js', 'scripts/tests/**/*.mjs', 'scripts/tests/**/*.cjs'], `${id}应仅检查测试目录的三种 JS 扩展名`);
    assert.deepEqual(block.languageOptions, { ecmaVersion: 'latest' }, `${id}应保持统一解析配置`);
    assert.deepEqual(block.rules[id], i_BOUNDARY_RULES.includes(name) ? ['error', { testDir: 'scripts/tests' }] : 'error', `${id}应保持原有级别和参数`);
  }
  assert.deepEqual(Object.keys(config[0]), ['ignores'], '首块应为纯忽略层');
  assert.deepEqual(Object.keys(config[1]), ['plugins'], '次块应为插件注册');
  assert.deepEqual(config[1].plugins, { atb: atbRules }, '缺省仅注册 atb 规则集');
  assert.deepEqual(f_ruleBlock(config, 'no-restricted-syntax').files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '规则块应统一覆盖三扩展名');
  assert.deepEqual(f_ruleBlock(config, 'no-restricted-syntax').languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(f_ruleBlock(config, 'no-restricted-syntax').rules['no-restricted-syntax'], ['error', {
    selector: 'ImportNamespaceSpecifier',
    message: "禁止 'import * as' 通配符导入：按实际使用的公共导出写具名导入",
  }], '通配符导入禁令块形态精确');
  assert.deepEqual(f_ruleBlock(config, 'no-unsafe-finally').files, ['**/*.js', '**/*.mjs', '**/*.cjs'], 'finally 安全块统一覆盖三扩展名');
  assert.deepEqual(f_ruleBlock(config, 'no-unsafe-finally').languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.equal(f_ruleBlock(config, 'no-unsafe-finally').rules['no-unsafe-finally'], 'error', 'finally 安全规则为内置基线');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-silent-catch').files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '吞错检查块统一覆盖三扩展名');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-silent-catch').languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.equal(f_ruleBlock(config, 'atb/no-silent-catch').rules['atb/no-silent-catch'], 'error', '吞错检查应作为内置基线启用');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-undeclared-dependencies-imports').files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '依赖三级链块统一覆盖三扩展名');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-undeclared-dependencies-imports').languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-undeclared-dependencies-imports').rules['atb/no-undeclared-dependencies-imports'], ['error', { testDir: 'scripts/tests', buildToolDir: '' }],
    '依赖三级链：testDir 同名桥接（根配置 eslint.config.mjs 由规则内置识别，不经参数）');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-unused-exports').rules['atb/no-unused-exports'], ['error', { testDir: 'scripts/tests' }], '死导出检查应保持测试目录参数');
  assert.equal(f_ruleBlock(config, 'atb/no-unused-file-private-codes').rules['atb/no-unused-file-private-codes'], 'error', '文件私有死代码检查应启用');
  assert.equal(f_ruleBlock(config, 'atb/no-unused-imports').rules['atb/no-unused-imports'], 'error', '死导入检查应启用');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-wrong-access-level').files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '访问级别分级块统一覆盖三扩展名');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-wrong-access-level').languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-wrong-access-level').rules['atb/no-wrong-access-level'], ['error', { testDir: 'scripts/tests' }], '访问级别分级规则应原样透传 testDir');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-out-of-level-access').files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '越级访问块统一覆盖三扩展名');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-out-of-level-access').languageOptions, { ecmaVersion: 'latest' }, '解析面不锁 sourceType');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-out-of-level-access').rules['atb/no-out-of-level-access'], ['error', { testDir: 'scripts/tests' }], '越级访问规则应原样透传 testDir');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-business-imports-in-lib').files, ['scripts/lib/**/*.js', 'scripts/lib/**/*.mjs', 'scripts/lib/**/*.cjs'], 'lib 单向分层块以 libDir 为管辖面');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-business-imports-in-lib').rules['atb/no-business-imports-in-lib'], ['error', { libDir: 'scripts/lib' }], '内部库加载边界应保持 libDir 参数');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-import-cycles').files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '循环导入块统一覆盖三扩展名');
  assert.equal(f_ruleBlock(config, 'atb/no-import-cycles').rules['atb/no-import-cycles'], 'error', '循环导入规则应默认启用');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-blacklist-module-imports').files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '原生环境模块约束覆盖全部代码');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-blacklist-module-imports').rules['atb/no-blacklist-module-imports'], ['error', {
    deniedModules: ['node:fs', 'node:http', 'node:https', 'node:child_process', 'node:process'],
  }], '环境模块黑名单应保持缺省环境组');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-missing-config-tests').files, ['eslint.config.mjs'], '配置测试守护块锚定根配置文件');
  assert.deepEqual(f_ruleBlock(config, 'atb/no-missing-config-tests').rules['atb/no-missing-config-tests'], ['error', { testDir: 'scripts/tests', packageJsonPath: 'package.json', hooksDir: '' }], '配置测试守护应保持目录、清单与 hook 参数');
});

/** 场景：八层内置忽略逐层在位且精确，缺省无调用方追加。 */
test('valid：内置忽略层精确形态', function test_valid_内置忽略层精确形态() {
  const config = createConfig();
  assert.deepEqual(config[0].ignores, BUILTIN_IGNORES, '缺省忽略层应为完整内置清单');
  for (const name of i_QUALITY_RULES) assert.equal(config.find(block => block.rules?.[`atb/${name}`]).rules[`atb/${name}`], 'error', `${name}必须默认启用且不提供文件例外`);
});

/** 场景：工厂不再接受自由追加忽略范围，旧入参必须明确拒绝。 */
test('invalid：拒绝已删除的 ignores 入参', function test_invalid_拒绝已删除的_ignores_入参() {
  assert.throws(() => createConfig({ ignores: ['vendor/**'] }), /不支持.*ignores/, '旧 ignores 入参不能静默生效或被忽略');
});

/** 场景：清单面三件默认接线，真实 ESLint 不需要调用方提供 parser。 */
test('valid：清单面默认使用内置 parser', async function test_valid_清单面默认使用内置_parser() {
  const withParser = createConfig();
  assert.deepEqual(f_ruleBlock(withParser, 'atb/no-wrong-exports-in-package').files, ['package.json'], 'packageJson 面以清单文件为目标');
  for (const id of ['atb/no-unused-runtime-dependencies-in-package', 'atb/no-wrong-exports-in-package', 'atb/no-loose-dependency-specs']) {
    assert.deepEqual(f_ruleBlock(withParser, id).files, ['package.json'], `${id}应检查清单文件`);
  }
  assert.equal(f_ruleBlock(withParser, 'atb/no-unused-runtime-dependencies-in-package').rules['atb/no-unused-runtime-dependencies-in-package'], 'error', '清单无用依赖检查应启用');
  assert.deepEqual(f_ruleBlock(withParser, 'atb/no-wrong-exports-in-package').rules['atb/no-wrong-exports-in-package'], ['error', { testDir: 'scripts/tests', buildToolDir: '' }], '清单入口检查应保持目录参数');
  assert.equal(f_ruleBlock(withParser, 'atb/no-loose-dependency-specs').rules['atb/no-loose-dependency-specs'], 'error', '清单版本约束应启用');
  // 行为：真实 ESLint 执行——内存项目的运行时依赖被源文件导入，清单放行。
  const eslint = new ESLint({ overrideConfigFile: true, cwd: repoRoot, overrideConfig: withParser });
  const [result] = await eslint.lintText(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'), { filePath: 'package.json' });
  assert.deepEqual(result.messages, [], '被导入的运行时依赖应放行');
});

/** 场景：无参工厂的三条清单规则实际报告违规，不因遗漏 parser 静默关闭。 */
test('invalid：默认清单检查真实生效', async function test_invalid_默认清单检查真实生效() {
  const baseline = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const cases = [
    { name: '无用运行依赖', value: { ...baseline, dependencies: { ...baseline.dependencies, unused: '1.0.0' } }, rule: 'atb/no-unused-runtime-dependencies-in-package' },
    { name: '测试文件作为 bin', value: { ...baseline, bin: { fixture: './scripts/tests/export/package.test.mjs' } }, rule: 'atb/no-wrong-exports-in-package' },
    { name: '浮动版本标签', value: { ...baseline, dependencies: { ...baseline.dependencies, 'litenvi-node': 'latest' } }, rule: 'atb/no-loose-dependency-specs' },
  ];
  for (const scenario of cases) {
    const [result] = await f_eslint().lintText(JSON.stringify(scenario.value), { filePath: 'package.json' });
    assert.ok(result.messages.some(message => message.ruleId === scenario.rule), `${scenario.name}必须由默认清单规则报告`);
  }
});

/** 场景：清单目标可定制，已删除的 parser 接线参数不能覆盖内置策略。 */
test('invalid：拒绝旧 packageJson 参数并保留目标配置', function test_invalid_拒绝旧_packageJson_参数并保留目标配置() {
  assert.throws(() => createConfig({ packageJson: {} }), /不支持.*packageJson/, '旧 parser 配置参数应明确拒绝');
  const config = createConfig({ packageJsonPath: 'manifest.json' });
  assert.deepEqual(f_ruleBlock(config, 'atb/no-wrong-exports-in-package').files, ['manifest.json'], '清单文件名仍应可配置');
});

/** 场景：depsDir 覆盖第一层依赖忽略，缺省为 node_modules。 */
test('valid：depsDir 覆盖依赖忽略层', function test_valid_depsDir_覆盖依赖忽略层() {
  const custom = createConfig({ depsDir: 'vendor' });
  assert.ok(custom[0].ignores.includes('vendor/**'), '自定义依赖目录应进入忽略层');
  assert.ok(!custom[0].ignores.includes('node_modules/**'), '缺省依赖目录不应残留');
  assert.ok(createConfig()[0].ignores.includes('node_modules/**'), '缺省依赖目录为 node_modules');
});

/** 场景：工厂固定注册自身规则，不接受额外插件入参。 */
test('invalid：拒绝已删除的 plugins 入参', function test_invalid_拒绝已删除的_plugins_入参() {
  assert.throws(() => createConfig({ plugins: { custom: { rules: {} } } }), /不支持.*plugins/, '旧 plugins 入参应明确拒绝');
  assert.deepEqual(createConfig()[1].plugins, { atb: atbRules }, '内置 atb 插件注册必须保留');
});

/** 场景：原生对照只从模块例外登记授权，不再接受独立入参。 */
test('invalid：拒绝已删除的 nativeProcessTests 入参', function test_invalid_拒绝已删除的_nativeProcessTests_入参() {
  assert.throws(() => createConfig({ nativeProcessTests: [] }), /不支持.*nativeProcessTests/, '旧原生对照入参应明确拒绝');
});

/** 场景：默认导出与具名导出为同一工厂。 */
test('valid：默认导出同一性', function test_valid_默认导出同一性() {
  assert.equal(createConfigDefault, createConfig, 'default 导出应与具名导出同一');
});

/** 场景：布局选项按块启用状态回归——testDir 经启用的分级块与依赖三级链块联动，libDir/buildToolDir 缺省不扰产出。 */
test('valid：布局选项按块启用状态回归', function test_valid_布局选项按块启用状态回归() {
  const withTestDir = createConfig({ testDir: 'tests' });
  assert.deepEqual(f_ruleBlock(withTestDir, 'atb/no-wrong-access-level').rules['atb/no-wrong-access-level'][1].testDir, 'tests',
    'testDir 覆盖应经启用的访问级别分级块原样透传');
  assert.deepEqual(f_ruleBlock(withTestDir, 'atb/no-undeclared-dependencies-imports').rules['atb/no-undeclared-dependencies-imports'][1].testDir, 'tests',
    'testDir 同名桥接进依赖三级链块');
  assert.deepEqual(f_ruleBlock(withTestDir, 'atb/no-unused-exports').rules['atb/no-unused-exports'][1].testDir, 'tests',
    'testDir 同名桥接进死导出块');
  const withBuildTool = createConfig({ buildToolDir: 'tools' });
  assert.deepEqual(f_ruleBlock(withBuildTool, 'atb/no-undeclared-dependencies-imports').rules['atb/no-undeclared-dependencies-imports'][1],
    { testDir: 'scripts/tests', buildToolDir: 'tools' }, 'buildToolDir 同名桥接进依赖三级链块');
  const withLibDir = createConfig({ libDir: 'src/lib' });
  assert.deepEqual(f_ruleBlock(withLibDir, 'atb/no-business-imports-in-lib').files, ['src/lib/**/*.js', 'src/lib/**/*.mjs', 'src/lib/**/*.cjs'],
    'libDir 覆盖应反映进 lib 单向分层块的管辖面');
  assert.deepEqual(f_ruleBlock(createConfig(), 'atb/no-undeclared-dependencies-imports').rules['atb/no-undeclared-dependencies-imports'][1],
    { testDir: 'scripts/tests', buildToolDir: '' }, 'buildToolDir 缺省为空（不启用）');
});

/** 场景：公共工厂拒绝项目例外，同名原生对照文件不会得到 litenvi 身份。 */
test('valid：项目不能配置原生模块例外或冒用对照文件名', async function test_valid_项目不能配置原生模块例外或冒用对照文件名() {
  assert.throws(() => createConfig({ exceptionFilesAllowModules: [] }), /不支持.*exceptionFilesAllowModules/, '工厂不再开放例外参数');
  const eslint = f_eslint();
  const code = "import plugin from 'atb-eslint-plugin'; import { spawn } from 'node:child_process'; console.log(plugin.rules); spawn(process.execPath, ['-e', '']);\n";
  const [result] = await eslint.lintText(code, { filePath: 'scripts/tests/export/native-reference.test.mjs' });
  assert.ok(result.messages.some(message => message.ruleId === 'atb/no-blacklist-module-imports' && message.messageId === 'deniedModule'), '普通包即使采用同名文件，也应报告原生模块导入');
  assert.ok(result.messages.some(message => message.messageId === 'spawnInExportPartition'), '普通包仍须遵守进程分区限制');
});

/** 场景：真实 ESLint 以产出配置执行——具名导入按禁令意图放行。 */
test('valid：真实 ESLint 具名导入放行', async function test_valid_真实_ESLint_具名导入放行() {
  const eslint = f_eslint();
  const results = await eslint.lintText("import { parse } from 'node:util';\nparse('x');\n", { filePath: 'src/app.mjs' });
  assert.deepEqual(results[0].messages, [], '具名导入应放行');
});

/** 场景：依赖三级链真实执行——根配置引用 devDependencies 放行（规则内置识别，非整文件豁免）。 */
test('valid：真实 ESLint 根配置 devDependencies 放行', async function test_valid_真实_ESLint_根配置_devDependencies_放行() {
  const eslint = f_eslint();
  const results = await eslint.lintText("import { RuleTester } from 'eslint';\nRuleTester;\n", { filePath: 'eslint.config.mjs' });
  assert.deepEqual(results[0].messages, [], '根配置引用 devDependencies 应经规则内置识别放行');
});

/** 场景：lib 单向分层真实执行——依赖包（清单声明）、node: 内建与 lib 内相对引用放行。 */
test('valid：真实 ESLint lib 引依赖包与内建放行', async function test_valid_真实_ESLint_lib_引依赖包与内建放行() {
  const eslint = f_eslint();
  const code = "import fs from 'litenvi-node/lite-fs.mjs';\nimport path from 'node:path';\nimport { i_minimatch } from './attributions.mjs';\nfunction f_probe() { return [fs, path, i_minimatch]; }\nf_probe();\n";
  const results = await eslint.lintText(code, { filePath: 'scripts/lib/probe.mjs' });
  assert.deepEqual(results[0].messages, [], '依赖包子路径 / node: 内建 / lib 内相对引用应放行');
});

/** 场景：lib 单向分层真实执行——静态上溯业务代码命中内部库边界。 */
test('invalid：真实 ESLint lib 静态上溯命中', async function test_invalid_真实_ESLint_lib_静态上溯命中() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import { thing } from '../atb.mjs';\nfunction f_x() { return thing; }\nf_x();\n", { filePath: 'scripts/lib/probe.mjs' });
  assert.equal(result.messages.length, 1, '静态上溯应命中一条');
  assert.equal(result.messages[0].ruleId, 'atb/no-business-imports-in-lib', '静态上溯应由内部库边界规则报告');
  assert.equal(result.messages[0].messageId, 'outsideLib', '实际目标位于内部库外应报告越界');
});

/** 场景：lib 单向分层真实执行——动态 import 上溯仍按实际目标报告越界。 */
test('invalid：真实 ESLint lib 动态上溯命中', async function test_invalid_真实_ESLint_lib_动态上溯命中() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("const m = await import('../atb.mjs');\nfunction f_x() { return m; }\nf_x();\n", { filePath: 'scripts/lib/probe.mjs' });
  assert.equal(result.messages.length, 1, '动态上溯应命中一条');
  assert.equal(result.messages[0].ruleId, 'atb/no-business-imports-in-lib', '动态上溯与静态上溯使用同一规则');
  assert.equal(result.messages[0].messageId, 'outsideLib', '应禁止库外目标，而非全面禁止动态导入');
});

/** 场景：内部库边界独立后，内部库仍继承全局通配符禁令。 */
test('invalid：真实 ESLint lib 通配符导入禁令不失守', async function test_invalid_真实_ESLint_lib_通配符导入禁令不失守() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import * as util from 'node:util';\nfunction f_x() { return util.format('x'); }\nf_x();\n", { filePath: 'scripts/lib/probe.mjs' });
  assert.equal(result.messages.length, 1, 'lib 文件通配符导入应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-restricted-syntax', '命中规则应为 no-restricted-syntax');
  assert.match(result.messages[0].message, /通配符导入/, '内部库应继承全局通配符禁令');
});


/** 场景：内部库内的固定动态加载与声明依赖允许，未知目标仍明确拒绝。 */
test('valid：真实 ESLint 内部库动态加载按目标判断', async function test_valid_真实_ESLint_内部库动态加载按目标判断() {
  const eslint = f_eslint();
  const code = "const modules = await Promise.all([import('./attributions.mjs'), import('node:path'), import('litenvi-node/lite-fs.mjs')]); console.log(modules);";
  const [allowed] = await eslint.lintText(code, { filePath: 'scripts/lib/probe.mjs' });
  assert.deepEqual(allowed.messages, [], '明确的库内模块、内置与已声明运行依赖应允许动态加载');
  const [unknown] = await eslint.lintText('function f_load(target) { return import(target); } f_load(process.argv[2]);', { filePath: 'scripts/lib/unknown.mjs' });
  assert.deepEqual(unknown.messages.map(message => message.messageId), ['unresolvedTarget'], '无法静态确定目标时必须报告');
  const [outside] = await eslint.lintText('function f_load(target) { return import(target); } f_load(process.argv[2]);', { filePath: 'src/unknown.mjs' });
  assert.deepEqual(outside.messages, [], '普通业务文件不应被扩大为禁止动态导入');
});

/** 场景：依赖三级链真实执行——生产目录引用 devDependencies 命中 devOnly。 */
test('invalid：真实 ESLint 生产目录 devDependencies 命中', async function test_invalid_真实_ESLint_生产目录_devDependencies_命中() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import { RuleTester } from 'eslint';\nRuleTester;\n", { filePath: 'src/app.js' });
  assert.equal(result.messages.length, 1, '生产目录引用 devDependencies 应命中一条');
  assert.equal(result.messages[0].ruleId, 'atb/no-undeclared-dependencies-imports', '命中规则应为依赖三级链');
  assert.match(result.messages[0].message, /仅开发依赖/, '应报 devOnly 而非未声明');
});

/** 场景：依赖三级链真实执行——根配置的未声明依赖照抓（内置识别不是豁免）。 */
test('invalid：真实 ESLint 根配置未声明依赖命中', async function test_invalid_真实_ESLint_根配置未声明依赖命中() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import { thing } from 'not-a-pkg';\nthing;\n", { filePath: 'eslint.config.mjs' });
  assert.equal(result.messages.length, 1, '根配置未声明依赖应命中一条');
  assert.match(result.messages[0].message, /未声明依赖/, '应报未声明而非 devOnly');
});

/** 场景：依赖三级链真实执行——buildToolDir 桥接后构建工具目录引用 devDependencies 放行，缺省时 devOnly。 */
test('valid：真实 ESLint buildToolDir devDependencies 放行', async function test_valid_真实_ESLint_buildToolDir_devDependencies_放行() {
  const bridged = f_eslint({ buildToolDir: 'tools' });
  const results = await bridged.lintText("import { RuleTester } from 'eslint';\nRuleTester;\n", { filePath: 'tools/build.js' });
  assert.deepEqual(results[0].messages, [], '构建工具目录引用 devDependencies 应经桥接放行');
  const [unbridged] = await f_eslint().lintText("import { RuleTester } from 'eslint';\nRuleTester;\n", { filePath: 'tools/build.js' });
  assert.equal(unbridged.messages.length, 1, '未声明 buildToolDir 时同文件应命中 devOnly');
});

/** 场景：内置忽略层在真实 ESLint 下真实豁免八类路径样本。 */
test('valid：真实 ESLint 忽略样本豁免', async function test_valid_真实_ESLint_忽略样本豁免() {
  const eslint = f_eslint();
  const offending = "import * as util from 'node:util';\nutil.format('x');\n";
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

/** 场景：内置忽略范围外的目录仍由真实 ESLint 检查。 */
test('valid：真实 ESLint 检查 playground 目录', async function test_valid_真实_ESLint_检查_playground_目录() {
  const eslint = f_eslint();
  const offending = "import * as util from 'node:util';\nutil.format('x');\n";
  for (const filePath of ['playground/demo.js', 'src/app.js']) {
    const [result] = await eslint.lintText(offending, { filePath });
    assert.ok(result.messages.some(message => message.ruleId === 'no-restricted-syntax'), `${filePath} 应保持在管辖范围内`);
  }
});

/** 场景：depsDir 覆盖在真实 ESLint 下真实豁免新依赖目录。 */
test('valid：真实 ESLint depsDir 覆盖豁免', async function test_valid_真实_ESLint_depsDir_覆盖豁免() {
  const eslint = f_eslint({ depsDir: 'vendor' });
  const offending = "import * as util from 'node:util';\nutil.format('x');\n";
  const results = await eslint.lintText(offending, { filePath: 'vendor/pkg/index.js', warnIgnored: false });
  assert.deepEqual(results, [], '覆盖后的依赖目录应被真实豁免');
  const [result] = await eslint.lintText(offending, { filePath: 'src/app.js' });
  assert.equal(result.messages.length, 1, '规则块仍正常管辖生产目录');
});

/** 场景：角色目录（testDir/libDir）不在内置忽略面，违规照常命中。 */
test('valid：真实 ESLint 角色目录受管', async function test_valid_真实_ESLint_角色目录受管() {
  const eslint = f_eslint();
  const offending = "import * as util from 'node:util';\nutil.format('x');\n";
  const [testResult] = await eslint.lintText(offending, { filePath: 'scripts/tests/a.js' });
  assert.equal(testResult.messages.length, 1, '测试目录应受管辖');
  const [libResult] = await eslint.lintText(offending, { filePath: 'scripts/lib/util.js' });
  assert.equal(libResult.messages.length, 1, '内部库目录应受管辖');
});

/** 场景：cjs 受三扩展名管辖且按 commonjs 推断可正常解析。 */
test('valid：真实 ESLint cjs 受管可解析', async function test_valid_真实_ESLint_cjs_受管可解析() {
  const eslint = f_eslint();
  const results = await eslint.lintText('const value = 1;\n', { filePath: 'src/plain.cjs' });
  assert.equal(results.length, 1, 'cjs 文件应受管辖（返回结果而非忽略）');
  assert.deepEqual(results[0].messages, [], 'cjs 普通代码应可解析无诊断');
});

/** 场景：规则块 files 范围外的扩展名不受管辖（连结果对象都不产）。 */
test('valid：真实 ESLint files 范围外不受管辖', async function test_valid_真实_ESLint_files_范围外不受管辖() {
  const eslint = f_eslint();
  const offending = "import * as util from 'node:util';\nutil.format('x');\n";
  for (const filename of ['src/app.ts', 'docs/guide.md', 'src/data.json']) {
    const results = await eslint.lintText(offending, { filePath: filename, warnIgnored: false });
    assert.deepEqual(results, [], `${filename} 不在 jsGlobs 范围内，应不受管辖`);
  }
});

/** 场景：finally 安全块真实执行——仅清理语句的 finally 放行。 */
test('valid：真实 ESLint finally 清理放行', async function test_valid_真实_ESLint_finally_清理放行() {
  const eslint = f_eslint();
  const results = await eslint.lintText('try {\n  run();\n} catch (error) {\n  handle(error);\n} finally {\n  cleanup();\n}\n', { filePath: 'src/flow.js' });
  assert.deepEqual(results[0].messages, [], '仅清理语句的 finally 应放行');
});

/** 场景：finally 内函数作用域的 return 放行——声明函数与箭头函数两形态。 */
test('valid：真实 ESLint finally 内函数作用域 return 放行', async function test_valid_真实_ESLint_finally_内函数作用域_return_放行() {
  const eslint = f_eslint();
  const code = 'function f_declared() {\n  try {\n    run();\n  } finally {\n    function inner() {\n      return 1;\n    }\n  }\n}\n\nconst f_arrow = () => {\n  try {\n    run();\n  } finally {\n    const g = () => {\n      return 2;\n    };\n  }\n};\nf_declared();\nf_arrow();\n';
  const results = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.deepEqual(results[0].messages, [], '函数作用域内的 return 不覆盖外部控制流，应放行');
});

/** 场景：吞错检查真实执行——catch 内有恢复语句放行。 */
test('valid：真实 ESLint 处理型 catch 放行', async function test_valid_真实_ESLint_处理型_catch_放行() {
  const eslint = f_eslint();
  const code = 'try {\n  run();\n} catch (error) {\n  handle(error);\n}\n';
  const results = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.deepEqual(results[0].messages, [], '有错误处理的 catch 应放行');
});

/** 场景：取消看板规则选择后，缺省、历史关闭选择和损坏设置都不影响固定规则及真实诊断。 */
test('valid：测试规则不受看板 runtime 设置影响', async function test_valid_测试规则不受看板_runtime_设置影响() {
  const optionalRules = [
    'atb/no-undeclared-entry-in-test', 'atb/no-blacklist-module-imports',
    'atb/no-missing-config-tests', 'atb/no-unmocked-litenvi-in-test',
    ...[...i_BOUNDARY_RULES, ...i_QUALITY_RULES].map(name => `atb/${name}`),
  ];
  const file = path.join(repoRoot, 'agent-team-board/runtime/tasks/settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const legacy = JSON.stringify({ eslint: { testRules: Object.fromEntries(optionalRules.map(id => [id, false])) } });
  for (const content of [null, legacy, '{bad']) {
    if (content !== null) fs.writeFileSync(file, content);
    const config = createConfig();
    for (const id of optionalRules) {
      const value = config.find(block => Object.hasOwn(block.rules || {}, id)).rules[id];
      assert.equal(Array.isArray(value) ? value[0] : value, 'error', `${id}应始终启用，不读取看板选择`);
    }
    const [result] = await f_eslint().lintText("import { test } from 'node:test'; test('缺断言', function test_缺断言() {});", { filePath: 'scripts/tests/export/missing.test.mjs' });
    assert.ok(result.messages.some(message => message.ruleId === 'atb/no-invalid-test-assertions'), '历史选择或损坏 JSON 不能关闭真实测试质量诊断');
  }
});

/** 场景：规则选择入参已取消，旧调用不能静默改变检查级别。 */
test('invalid：拒绝已删除的 testRules 入参', function test_invalid_拒绝已删除的_testRules_入参() {
  assert.throws(() => createConfig({ testRules: { 'atb/no-bad-patterns-in-test': false } }), /不支持.*testRules/, '旧规则选择入参必须明确拒绝');
});

// ---------- invalid：期望抛错 / 命中报告 ----------

/** 场景：root 已删除，旧绝对路径调用应明确拒绝。 */
test('invalid：拒绝旧绝对 root 参数', function test_invalid_拒绝旧绝对_root_参数() {
  assert.throws(() => createConfig({ root: repoRoot }), /不支持.*root/, '旧 root 参数不能静默保留');
});

/** 场景：删除 root 后也不接受旧相对路径调用。 */
test('invalid：拒绝旧相对 root 参数', function test_invalid_拒绝旧相对_root_参数() {
  assert.throws(() => createConfig({ root: 'lib/../' }), /不支持.*root/, '路径表达式也应按已删除参数拒绝');
  assert.throws(() => createConfig({ root: 'scripts/tests' }), /不支持.*root/, '相对路径也应按已删除参数拒绝');
});

/** 场景：通配符导入在真实 ESLint 下命中禁令，生产目录不受忽略层豁免。 */
test('invalid：真实 ESLint 通配符导入命中', async function test_invalid_真实_ESLint_通配符导入命中() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import * as util from 'node:util';\nutil.format('x');\n", { filePath: 'src/app.js' });
  assert.equal(result.messages.length, 1, '通配符导入应命中一条');
  assert.match(result.messages[0].message, /通配符导入/, '应使用工厂定义的禁令文案');
  assert.equal(result.messages[0].ruleId, 'no-restricted-syntax', '命中规则应为 no-restricted-syntax');
});

/** 场景：规则块 files 的 jsGlobs 三段 glob 对深层路径仍命中。 */
test('invalid：真实 ESLint files 深层路径命中', async function test_invalid_真实_ESLint_files_深层路径命中() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import * as util from 'node:util';\nutil.format('x');\n", { filePath: 'a/b/c.js' });
  assert.equal(result.messages.length, 1, '深层路径应被 glob 命中');
  assert.equal(result.messages[0].ruleId, 'no-restricted-syntax', '命中规则应为 no-restricted-syntax');
});

/** 场景：解析面不锁 sourceType 的推断后果——cjs 按 commonjs 解析，ESM 语法为致命解析错误。 */
test('invalid：cjs 的 ESM 语法致命解析', async function test_invalid_cjs_的_ESM_语法致命解析() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText("import * as util from 'node:util';\nutil.format('x');\n", { filePath: 'src/legacy.cjs' });
  assert.equal(result.messages.length, 1, '应报告一条致命解析错误');
  assert.equal(result.messages[0].fatal, true, '应为致命解析错误');
  assert.equal(result.messages[0].ruleId, null, '解析错误不归属规则');
});

/** 场景：finally 安全块真实执行——finally 内 return 覆盖 catch 语义命中。 */
test('invalid：finally 内 return 命中', async function test_invalid_finally_内_return_命中() {
  const eslint = f_eslint();
  const code = 'function f_flow() {\n  try {\n    run();\n  } catch (error) {\n    handle(error);\n  } finally {\n    return 1;\n  }\n}\nf_flow();\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, 'finally 内 return 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：finally 内 throw 覆盖 try/catch 抛出语义命中。 */
test('invalid：finally 内 throw 命中', async function test_invalid_finally_内_throw_命中() {
  const eslint = f_eslint();
  const code = 'function f_flow() {\n  try {\n    run();\n  } finally {\n    throw new Error("boom");\n  }\n}\nf_flow();\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, 'finally 内 throw 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：finally 内 break 覆盖迭代语义命中（break 须在循环内才合法）。 */
test('invalid：finally 内 break 命中', async function test_invalid_finally_内_break_命中() {
  const eslint = f_eslint();
  const code = 'for (;;) {\n  try {\n    run();\n  } finally {\n    break;\n  }\n}\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, 'finally 内 break 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：finally 内 continue 覆盖迭代语义命中（continue 须在循环内才合法）。 */
test('invalid：finally 内 continue 命中', async function test_invalid_finally_内_continue_命中() {
  const eslint = f_eslint();
  const code = 'while (check()) {\n  try {\n    run();\n  } finally {\n    continue;\n  }\n}\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, 'finally 内 continue 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：嵌套 try 的内层 finally return 命中（规则递归到嵌套 finalizer）。 */
test('invalid：嵌套 finally 的内层 return 命中', async function test_invalid_嵌套_finally_的内层_return_命中() {
  const eslint = f_eslint();
  const code = 'function f_flow() {\n  try {\n    run();\n  } finally {\n    try {\n      step();\n    } finally {\n      return 1;\n    }\n  }\n}\nf_flow();\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 1, '嵌套内层 finally 的 return 应命中一条');
  assert.equal(result.messages[0].ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
});

/** 场景：块语句与 if 包裹的 return 命中（规则递归到嵌套语句，两形态各报一条）。 */
test('invalid：finally 内嵌套包裹的 return 命中', async function test_invalid_finally_内嵌套包裹的_return_命中() {
  const eslint = f_eslint();
  const code = 'function f_block() {\n  try {\n    run();\n  } finally {\n    { return 1; }\n  }\n}\n\nfunction f_branch() {\n  try {\n    run();\n  } finally {\n    if (flag) {\n      return 2;\n    }\n  }\n}\nf_block();\nf_branch();\n';
  const [result] = await eslint.lintText(code, { filePath: 'src/flow.js' });
  assert.equal(result.messages.length, 2, '块包裹与 if 包裹应各命中一条');
  for (const message of result.messages) {
    assert.equal(message.ruleId, 'no-unsafe-finally', '命中规则应为 no-unsafe-finally');
  }
});

/** 场景：吞错检查真实执行——生产目录空 catch 命中。 */
test('invalid：生产目录空 catch 命中', async function test_invalid_生产目录空_catch_命中() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText('try {\n  run();\n} catch (error) {\n}\n', { filePath: 'src/app.js' });
  assert.equal(result.messages.length, 1, '空 catch 应命中一条');
  assert.equal(result.messages[0].ruleId, 'atb/no-silent-catch', '命中规则应为 atb/no-silent-catch');
});

/** 场景：吞错检查为全域基线——测试目录的空 catch 同受管辖。 */
test('invalid：测试目录空 catch 同受管辖', async function test_invalid_测试目录空_catch_同受管辖() {
  const eslint = f_eslint();
  const [result] = await eslint.lintText('try {\n  run();\n} catch {}\n', { filePath: 'scripts/tests/a.mjs' });
  assert.deepEqual(result.messages.map(message => message.ruleId), ['atb/no-silent-catch'], '测试目录空 catch 应只由统一吞错规则报告一次');
});

/** 场景：生产和测试代码的空 Promise 拒绝回调由全域规则报告一次。 */
test('invalid：Promise 吞错在生产与测试代码中统一检查', async function testPromiseCatchAcrossRoles() {
  for (const filePath of ['src/promise.mjs', 'scripts/tests/lib/promise.mjs']) {
    const [result] = await f_eslint().lintText('Promise.resolve(value).catch(() => {});', { filePath });
    assert.deepEqual(result.messages.map(message => [message.ruleId, message.messageId]), [['atb/no-silent-catch', 'swallowedPromiseError']], `${filePath}应只报告统一的 Promise 吞错诊断`);
  }
});

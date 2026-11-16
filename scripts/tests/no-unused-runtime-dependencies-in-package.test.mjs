// 未使用依赖规则用例：跑在 package.json 上（JSON parser 接线）+ 扫描包内真实源文件，
// 采用临时夹具目录驱动真实 ESLint 类执行——每个用例独立 tmpdir（扫描结果进程级缓存以
// 包根为键，目录隔离）。覆盖：死运行时依赖报告、全消费放行、devDependencies 如实留白、
// 子路径导入归并包名、node_modules 排除面、optionalDependencies 同报。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import packageJsonPlugin from 'eslint-plugin-package-json';
import unusedRuntimeDependenciesInPackage from 'atb-eslint-plugin/rules/no-unused-runtime-dependencies-in-package.mjs';

// 夹具：files 相对路径 → 内容；返回夹具根（package.json 必含）。
function f_fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atb-unused-deps-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

// 真实 ESLint 执行：JSON parser 接线，lint 夹具 package.json，返回消息数组。
async function f_lint(dir) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    cwd: dir,
    overrideConfig: [{
      files: ['package.json'],
      languageOptions: { parser: packageJsonPlugin.configs.recommended.languageOptions.parser },
      plugins: { atb: { rules: { 'no-unused-runtime-dependencies-in-package': unusedRuntimeDependenciesInPackage } } },
      rules: { 'atb/no-unused-runtime-dependencies-in-package': 'error' },
    }],
  });
  const [result] = await eslint.lintText(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), { filePath: 'package.json' });
  return result.messages;
}

/** 场景：dependencies 声明但包内无导入的死依赖报告；被导入的不报。 */
test('invalid：死运行时依赖报告', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', dependencies: { 'used-pkg': '1.0.0', 'dead-pkg': '1.0.0' } }),
    'src/a.mjs': "import 'used-pkg';\n",
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, '死依赖应报一条');
    assert.match(messages[0].message, /dead-pkg/, '应报告 dead-pkg');
    assert.equal(messages[0].ruleId, 'atb/no-unused-runtime-dependencies-in-package');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：全消费放行；devDependencies 未导入不报（scripts/CLI 消费面，如实留白）。 */
test('valid：全消费与 devDependencies 留白', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({
      name: 'fixture',
      dependencies: { 'used-pkg': '1.0.0' },
      devDependencies: { 'dev-only': '1.0.0' },
    }),
    'src/a.mjs': "import 'used-pkg';\n",
  });
  try {
    assert.deepEqual(await f_lint(dir), [], '被导入的运行时依赖与未导入的 dev 依赖均不报');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：子路径导入归并到包名（used-pkg/sub.js 算 used-pkg 使用）。 */
test('valid：子路径导入归并包名', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', dependencies: { 'used-pkg': '1.0.0' } }),
    'src/a.mjs': "import { x } from 'used-pkg/sub.js';\n",
  });
  try {
    assert.deepEqual(await f_lint(dir), [], '子路径导入应算包使用');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：node_modules 排除面——依赖包内部的导入不算本包使用。 */
test('invalid：node_modules 内导入不算使用', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', dependencies: { 'dead-pkg': '1.0.0' } }),
    'node_modules/other/index.js': "import 'dead-pkg';\n",
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, 'node_modules 内导入不应让 dead-pkg 免报');
    assert.match(messages[0].message, /dead-pkg/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：optionalDependencies 与 dependencies 同口径报告死声明。 */
test('invalid：optionalDependencies 死声明报告', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', optionalDependencies: { 'dead-optional': '1.0.0' } }),
    'src/a.mjs': 'export const x = 1;\n',
  });
  try {
    const messages = await f_lint(dir);
    assert.equal(messages.length, 1, 'optional 死依赖应报一条');
    assert.match(messages[0].message, /dead-optional/);
    assert.match(messages[0].message, /optionalDependencies/, '报告应标明分组');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

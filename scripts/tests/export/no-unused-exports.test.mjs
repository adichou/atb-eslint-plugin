// 死导出规则用例：静态消费图需要真实磁盘文件（正则扫描受管 js 建图），采用临时夹具目录
// 驱动真实 ESLint 执行——每个用例独立 tmpdir（图进程级缓存以包根为键，目录隔离），夹具
// 自含 package.json（项目根自锚定 + 入口面 manifest）与源文件。覆盖：具名/默认死导出报告、
// 全消费放行、受众分类（①测试文件全检、②bin 直驱整放过、③导入面只检 i_）、入口面
//（main/exports 通配）豁免、re-export 面死链、动态 import touched、扩展名补全解析、包外不受检。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import unusedExports from 'atb-eslint-plugin/rules/no-unused-exports.mjs';

// 夹具：files 相对路径 → 内容；返回夹具根（用后由调用方清理）。
function f_fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atb-unused-exports-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

// 真实 ESLint 执行：对夹具内文件跑死导出规则，返回消息数组（无 scanPath——项目根自锚定到
// 夹具的 package.json）。
async function f_verify(dir, relFile, options = {}) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    cwd: dir,
    overrideConfig: [{
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      plugins: { atb: { rules: { 'no-unused-exports': unusedExports } } },
      rules: { 'atb/no-unused-exports': ['error', options] },
    }],
  });
  const [result] = await eslint.lintText(fs.readFileSync(path.join(dir, relFile), 'utf8'), { filePath: relFile });
  return result.messages;
}

/** 场景：具名死导出与死默认导出各报一条；被消费的名字不报。 */
test('invalid：死具名导出与死默认导出报告', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': "import { used } from './dep.mjs';\nexport const t_main = 1;\n",
    'src/dep.mjs': 'export const used = 1;\nexport const dead = 2;\nexport default 3;\n',
  });
  try {
    const messages = await f_verify(dir, 'src/dep.mjs');
    assert.equal(messages.length, 2, '死具名与死默认应各报一条');
    const names = messages.map((m) => m.message).join('\n');
    assert.match(names, /'dead'/, '死具名导出应报告');
    assert.match(names, /'default'/, '死默认导出应报告');
    assert.doesNotMatch(names, /'used'/, '被消费的名字不应报告');
    for (const m of messages) assert.equal(m.ruleId, 'atb/no-unused-exports');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：默认导入 + as 别名消费 + 缺省扩展名解析（./dir → dir/index.mjs）全放行。 */
test('valid：全消费形态放行', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': "import dep, { used as alias } from './dep.mjs';\nimport { idx } from './dir';\n",
    'src/dep.mjs': 'export const used = 1;\nexport default 2;\n',
    'src/dir/index.mjs': 'export const idx = 1;\n',
  });
  try {
    assert.deepEqual(await f_verify(dir, 'src/dep.mjs'), [], '具名+默认被消费应放行');
    assert.deepEqual(await f_verify(dir, 'src/dir/index.mjs'), [], '缺省扩展名解析的消费应放行');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：manifest main 入口面整文件豁免——入口文件的导出是公共接口面。 */
test('valid：main 入口面豁免', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': 'export const t_main = 1;\nexport const t_also = 2;\n',
  });
  try {
    assert.deepEqual(await f_verify(dir, 'src/entry.mjs'), [], 'main 入口文件导出不检');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：exports 通配模式面豁免——匹配相对路径的导出面文件不检。 */
test('valid：exports 通配模式豁免', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', exports: { './rules/*.mjs': './scripts/rules/*.mjs' } }),
    'scripts/rules/a.mjs': 'export const t_rule = 1;\n',
  });
  try {
    assert.deepEqual(await f_verify(dir, 'scripts/rules/a.mjs'), [], 'exports 通配面匹配文件不检');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：re-export 面被下游消费放行；无人消费的 re-export 面报死链。 */
test('invalid：死 re-export 面报告', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': "export { alive } from './mid.mjs';\n",
    'src/mid.mjs': "export { alive, deadFace } from './dep.mjs';\n",
    'src/dep.mjs': 'export const alive = 1;\nexport const deadFace = 2;\n',
  });
  try {
    // mid 的 alive 面被 entry re-export 消费；deadFace 面无人消费 → mid 报一条。
    const mid = await f_verify(dir, 'src/mid.mjs');
    assert.equal(mid.length, 1, '死 re-export 面应报一条');
    assert.match(mid[0].message, /'deadFace'/);
    // dep 的 alive 被 mid re-export 消费；deadFace 被 mid 的死面消费（面消费计一次）→ dep 不报。
    assert.deepEqual(await f_verify(dir, 'src/dep.mjs'), [], '被 re-export 消费的名字不报（面死链在 mid 层报告）');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：字面量动态 import 名字不可知——目标文件 touched，全部导出豁免。 */
test('valid：动态 import touched 豁免', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': "const m = await import('./dep.mjs');\n",
    'src/dep.mjs': 'export const a = 1;\nexport const b = 2;\nexport default 3;\n',
  });
  try {
    assert.deepEqual(await f_verify(dir, 'src/dep.mjs'), [], '动态 import 目标文件全部导出豁免');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：项目根自锚定——不落在任何包内（向上无 package.json）的文件不受检。 */
test('valid：包外文件不受检', async () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'atb-no-pkg-'));
  const lone = path.join(bare, 'lone.mjs');
  fs.writeFileSync(lone, 'export const t_dead = 1;\n');
  try {
    const eslint = new ESLint({
      overrideConfigFile: true,
      cwd: bare,
      overrideConfig: [{
        files: ['**/*.mjs'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        plugins: { atb: { rules: { 'no-unused-exports': unusedExports } } },
        rules: { 'atb/no-unused-exports': 'error' },
      }],
    });
    const [result] = await eslint.lintText('export const t_dead = 1;\n', { filePath: 'lone.mjs' });
    assert.deepEqual(result.messages, [], '无 package.json 锚定的文件应不受检');
  } finally { fs.rmSync(bare, { recursive: true, force: true }); }
});

/** 场景：分类②——bin 直驱入口整文件放过（不走 import 加载器，任何导出的死活都不可判）。 */
test('valid：bin 直驱入口整放过', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', bin: { 'fixture-cli': './src/cli.mjs' } }),
    'src/cli.mjs': 'export const t_unused = 1;\nexport default 2;\n',
  });
  try {
    assert.deepEqual(await f_verify(dir, 'src/cli.mjs'), [], 'bin 声明文件的导出死活不可判，整放过');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：分类③——对外导入面文件的 i_ 导出无人用即矛盾（挂公共面却声明包内协作）。 */
test('invalid：导入面文件 i_ 死导出报告', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': 'export const i_dead = 1;\nexport const pub = 2;\n',
  });
  try {
    const messages = await f_verify(dir, 'src/entry.mjs');
    assert.equal(messages.length, 1, '导入面文件只检 i_，公开导出不检');
    assert.equal(messages[0].ruleId, 'atb/no-unused-exports');
    assert.match(messages[0].message, /i_dead/);
    assert.match(messages[0].message, /i_ 导出/, '应使用导入面专属消息');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：文件内自用的导出——死的只是导出面，消息指引「去 export 保留实现」防误删活实现。 */
test('invalid：文件内自用导出指引去 export', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': 'export const i_pub = 1;\nexport function i_getRun(d, r) {\n  return { d, r, i_pub };\n}\nexport const i_snapshot = i_getRun("d", "run-1");\n',
  });
  try {
    const messages = await f_verify(dir, 'src/entry.mjs');
    // entry 在导入面：i_pub（无引用、跨文件无消费）报 unusedInternalOnFace；i_getRun（文件内自用
    // 被 snapshot 调用）与 i_snapshot（文件内零引用）报 unusedInternalOnFace 分支——导入面文件
    // 走 unusedInternalOnFace 消息，不加自用区分（面纪律不因自用放宽）。核心验证在内部文件用例。
    assert.ok(messages.length >= 1, '导入面文件的 i_ 死导出应有报告');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：内部文件的文件内自用导出——报告 unusedExportSelfUse 指引去 export 保留实现；
 * 文件内零引用的死导出仍报 unusedExport 指引删除。refine 事故形态回归（同文件自用被误删）。 */
test('invalid：内部文件自用与零引用死导出区分报告', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': 'export const x = 1;\n',
    'src/internal.mjs': 'export function i_getRun(d, r) {\n  return { d, r };\n}\nexport const i_alive = i_getRun("d", "run-1");\nexport const i_dead = 99;\n',
  });
  try {
    const messages = await f_verify(dir, 'src/internal.mjs');
    // i_getRun：文件内被 i_alive 调用 → unusedExportSelfUse（去 export 指引）
    // i_alive：文件内零引用、跨文件零消费 → unusedExport（删除指引）
    // i_dead：文件内零引用、跨文件零消费 → unusedExport（删除指引）
    assert.equal(messages.length, 3, '三个导出各报一条');
    const byName = {};
    for (const m of messages) byName[m.message.match(/'([^']+)'/)?.[1]] = m.messageId;
    assert.equal(byName.i_getRun, 'unusedExportSelfUse', '文件内自用应指引去 export');
    assert.equal(byName.i_alive, 'unusedExport', '文件内零引用的死导出仍指引删除');
    assert.equal(byName.i_dead, 'unusedExport', '文件内零引用的死导出仍指引删除');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/** 场景：分类①——测试文件不产出对外接口，全部具名导出须本仓内被导入（缺省 testDir 命中）。 */
test('invalid：测试文件死 t_ 导出报告', async () => {
  const dir = f_fixture({
    'package.json': JSON.stringify({ name: 'fixture', main: 'src/entry.mjs' }),
    'src/entry.mjs': "import { t_alive } from '../scripts/tests/helper.mjs';\nexport const x = t_alive;\n",
    'scripts/tests/helper.mjs': 'export const t_alive = 1;\nexport const t_dead = 2;\n',
  });
  try {
    const messages = await f_verify(dir, 'scripts/tests/helper.mjs');
    assert.equal(messages.length, 1, '测试文件死 t_ 导出应报一条');
    assert.match(messages[0].message, /'t_dead'/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// AI Agent 的 hook 声明作为命令入口与配置守护来源，全部夹具在内存卷中装配。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import entryRule from 'atb-eslint-plugin/rules/no-undeclared-entry-in-test.mjs';
import configRule from 'atb-eslint-plugin/rules/no-missing-config-tests.mjs';
import { createConfig } from 'atb-eslint-plugin/config.mjs';
import { t_createFixture } from '../lint-fixture.mjs';

const f_PROCESS = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'process', command: 'node', args: ['${ZCODE_PLUGIN_ROOT}/scripts/guard.mjs', 'file'] }] }] } });
const f_COMMAND = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'node "$PLUGIN_ROOT/scripts/guard.mjs" bash' }] }] } });
const f_GUARD = "import assert from 'node:assert/strict'; import fs from 'litenvi-node/lite-fs.mjs'; const cfg = JSON.parse(fs.readFileSync(new URL('../../../hooks/hooks.json', import.meta.url), 'utf8')); assert.ok(Array.isArray(cfg.hooks.PreToolUse));";
const f_HOST = `import fs from 'node:fs'; import path from 'node:path'; import cp from 'node:child_process';
const root = new URL('../../', import.meta.url).pathname;
export function t_agent() {
  async function write() {
    const plugin = fs.mkdtempSync('/tmp/hook-host-');
    for (const file of ['scripts/guard.mjs']) fs.copyFileSync(path.join(root, file), path.join(plugin, file));
    const config = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8'));
    for (const entry of config.hooks.PreToolUse.filter(() => true)) for (const handler of entry.hooks) {
      const file = handler.args[0].replace('\${ZCODE_PLUGIN_ROOT}', plugin);
      cp.spawn('node', [file, handler.args[1]]);
    }
  }
  return Object.freeze({ write });
}`;

// 私有：执行实际规则；源码字符串作为测试输入，不启动其中的子进程。
function f_verify({ files = {}, code = '', partition = 'bin', hooksDir = 'hooks', config = false }) {
  const root = t_createFixture({
    'package.json': '{"name":"fixture","bin":{"cli":"scripts/cli.mjs"}}',
    'eslint.config.mjs': 'export default [];',
    'scripts/cli.mjs': '',
    'scripts/guard.mjs': '',
    'hooks/hooks.json': f_PROCESS,
    'scripts/tests/bin/package.test.mjs': "import assert from 'node:assert/strict'; import manifest from '../../../package.json'; assert.ok(manifest.name);",
    'scripts/tests/bin/eslint.config.test.mjs': "import assert from 'node:assert/strict'; import cfg from '../../../eslint.config.mjs'; assert.ok(cfg.rules);",
    ...files,
  });
  try {
    const linter = new Linter({ cwd: root });
    const messages = linter.verify(code, [{
      files: ['**/*.mjs'],
      plugins: { atb: { rules: { entry: config ? configRule : entryRule } } },
      rules: { 'atb/entry': ['error', { hooksDir }] },
    }], { filename: path.join(root, config ? 'eslint.config.mjs' : `scripts/tests/${partition}/sample.test.mjs`) });
    return messages.map(message => ({ id: message.messageId, message: message.message }));
  } finally { fs.t_unmock(); }
}

const f_CASES = [
  { name: 'process 型 hook 命令作为 bin 入口', code: "import cp from 'node:child_process'; cp.spawn('node', ['scripts/guard.mjs', 'file']);", expected: [] },
  { name: 'command 型 hook 支持引号与插件根变量', files: { 'hooks/hooks.json': f_COMMAND }, code: "import cp from 'node:child_process'; cp.spawn('node', ['scripts/guard.mjs', 'bash']);", expected: [] },
  { name: 'Node 选项不冒充 hook 命令文件', files: { 'hooks/hooks.json': f_COMMAND.replace('node ', 'node --enable-source-maps ') }, code: "import cp from 'node:child_process'; cp.spawn('node', ['--enable-source-maps', 'scripts/guard.mjs']);", expected: [] },
  { name: 'hook 可以声明直接执行的脚本', files: { 'hooks/hooks.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}/scripts/guard.sh"' }] }] } }), 'scripts/guard.sh': '#!/bin/sh\nexit 0' }, code: "import cp from 'node:child_process'; cp.execFile('scripts/guard.sh');", expected: [] },
  { name: 'hook 可以声明经 bash 执行的脚本', files: { 'hooks/hooks.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'bash "$PLUGIN_ROOT/scripts/guard.sh"' }] }] } }), 'scripts/guard.sh': '#!/bin/sh\nexit 0' }, code: "import cp from 'node:child_process'; cp.spawn('bash', ['scripts/guard.sh']);", expected: [] },
  { name: '自定义 hooks 目录递归提取 JSON 命令', hooksDir: 'agent-hooks', files: { 'agent-hooks/nested/codex.json': f_COMMAND }, code: "import cp from 'node:child_process'; cp.spawn('node', ['scripts/guard.mjs']);", expected: [] },
  { name: '未启用 hooksDir 时不认可 hook 脚本', hooksDir: '', code: "import cp from 'node:child_process'; cp.spawn('node', ['scripts/guard.mjs']);", expected: ['undeclaredEntry'] },
  { name: '只有读取 hook JSON 不能充当命令调用', code: "import fs from 'node:fs'; fs.readFileSync('hooks/hooks.json');", expected: ['missingBinEntry'] },
  { name: '声明之外的内部脚本仍拒绝', files: { 'scripts/internal.mjs': '' }, code: "import cp from 'node:child_process'; cp.spawn('node', ['scripts/internal.mjs']);", expected: ['undeclaredEntry'] },
  { name: '实际调用 helper 中的 hook 入口可追踪', files: { 'scripts/tests/helper.mjs': "import cp from 'node:child_process'; export function t_run() { cp.spawn('node', ['scripts/guard.mjs']); }" }, code: "import { t_run } from '../helper.mjs'; t_run();", expected: [] },
  { name: '未调用的 hook helper 不算入口', files: { 'scripts/tests/helper.mjs': "import cp from 'node:child_process'; export function t_run() { cp.spawn('node', ['scripts/guard.mjs']); }" }, code: "import { t_run } from '../helper.mjs';", expected: ['missingBinEntry'] },
  { name: '宿主实际读取配置并调用临时复制的 hook 可追踪', files: { 'scripts/tests/host.mjs': f_HOST }, code: "import { t_agent } from '../host.mjs'; const agent = t_agent(); await agent.write();", expected: [] },
  { name: '只创建 mock Agent 而不调用 hook 不能充当入口', files: { 'scripts/tests/host.mjs': f_HOST }, code: "import { t_agent } from '../host.mjs'; t_agent();", expected: ['missingBinEntry'] },
  { name: '临时副本实际来自未声明脚本不能按同名 hook 放行', files: { 'scripts/internal.mjs': '', 'scripts/tests/host.mjs': f_HOST.replace('path.join(root, file)', "path.join(root, 'scripts/internal.mjs')") }, code: "import { t_agent } from '../host.mjs'; await t_agent().write();", expected: ['undeclaredEntry'] },
  { name: '明确过滤掉的 hook 不作为调用证据', files: { 'scripts/tests/host.mjs': f_HOST.replace('.filter(() => true)', '.filter(() => false)') }, code: "import { t_agent } from '../host.mjs'; await t_agent().write();", expected: ['missingBinEntry'] },
  { name: '业务数据矩阵不展开排列组合而耗尽入口分析预算', code: `import cp from 'node:child_process'; const values = ${JSON.stringify(Array.from({ length: 25 }, (_, index) => String(index)))}; for (const a of values) for (const b of values) for (const c of values) { cp.spawn('node', ['scripts/cli.mjs']); }`, expected: [] },
  { name: 'export 不能启动声明的 hook 命令', partition: 'export', code: "import cp from 'node:child_process'; cp.spawn('node', ['scripts/guard.mjs']);", expected: ['spawnInExportPartition'] },
  { name: 'hook JSON 缺少约定守护用例即报告', config: true, expected: ['missingConfigTestFile'] },
  { name: 'hook 守护真实读取并断言 hooks 字段后通过', config: true, files: { 'scripts/tests/bin/hooks.test.mjs': f_GUARD }, expected: [] },
  { name: 'hook 守护只读取但不做字段断言仍报告', config: true, files: { 'scripts/tests/bin/hooks.test.mjs': "import fs from 'node:fs'; fs.readFileSync(new URL('../../../hooks/hooks.json', import.meta.url));" }, expected: ['configTestNoFieldAssertion'] },
  { name: 'hook 守护只断言假数据不能代替读取配置', config: true, files: { 'scripts/tests/bin/hooks.test.mjs': "import assert from 'node:assert/strict'; assert.ok({ hooks: [] }.hooks);" }, expected: ['configTestNoRead'] },
  { name: '目录中的每份 JSON 都要求守护', config: true, files: { 'hooks/codex.json': f_COMMAND, 'scripts/tests/bin/hooks.test.mjs': f_GUARD }, expected: ['missingConfigTestFile'] },
  { name: '未配置目录时不追加 hook 配置守护', hooksDir: '', config: true, expected: [] },
  { name: 'hook JSON 损坏应明确报告', files: { 'hooks/hooks.json': '{bad json' }, expected: ['helperAnalysisFailed'] },
  { name: 'hook 命令指向不存在的文件应明确报告', files: { 'hooks/hooks.json': f_COMMAND.replace('guard.mjs', 'missing.mjs') }, expected: ['helperAnalysisFailed'] },
  { name: 'hook 命令不允许项目外文件', files: { 'hooks/hooks.json': f_COMMAND.replace('scripts/guard.mjs', '../outside.mjs') }, expected: ['helperAnalysisFailed'] },
  { name: 'hook 命令不猜测未知环境变量', files: { 'hooks/hooks.json': f_COMMAND.replace('$PLUGIN_ROOT', '$UNKNOWN_ROOT') }, expected: ['helperAnalysisFailed'] },
  { name: 'hook 内联脚本不能作为声明文件', files: { 'hooks/hooks.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node -e "process.exit(0)"' }] }] } }) }, expected: ['helperAnalysisFailed'] },
  { name: '目录配置不能使用绝对路径', hooksDir: '/hooks', expected: ['helperAnalysisFailed'] },
  { name: '目录配置不能越出项目', hooksDir: '../hooks', expected: ['helperAnalysisFailed'] },
  { name: '无关 JSON 元数据的 command 不成为入口', files: { 'hooks/hooks.json': JSON.stringify({ hooks: {}, metadata: { type: 'command', command: 'node scripts/guard.mjs' } }) }, code: "import cp from 'node:child_process'; cp.spawn('node', ['scripts/guard.mjs']);", expected: ['undeclaredEntry'] },
];

for (const scenario of f_CASES) {
  /** 场景：按实际 hook 声明检查 bin 命令调用或配置守护证据。 */
  test(scenario.name, () => {
    assert.deepEqual(f_verify(scenario).map(message => message.id), scenario.expected, `${scenario.name}：诊断应匹配`);
  });
}

/** 场景：目录配置经公共工厂同时传到入口检查与配置守护，不改变默认未启用的行为。 */
test('hooksDir 经工厂传给两个规则', () => {
  const config = createConfig({ root: '/project', hooksDir: 'agent-hooks' });
  for (const id of ['no-undeclared-entry-in-test', 'no-missing-config-tests']) {
    const block = config.find(item => item.rules?.[`atb/${id}`]);
    assert.equal(block.rules[`atb/${id}`][1].hooksDir, 'agent-hooks', `${id} 应收到自定义目录`);
  }
});

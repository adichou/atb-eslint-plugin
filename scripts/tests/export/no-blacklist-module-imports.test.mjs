// 经公共规则和真实 Linter 检查原生环境入口，样例源码不执行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import plugin from 'atb-eslint-plugin';
import { createConfig } from 'atb-eslint-plugin/config.mjs';
import { i_createFixture } from '../lint-fixture.mjs';

const f_CASES = [
  ['生产 fs', "import fs from 'node:fs';", ['deniedModule']],
  ['工具 fs', "import 'fs';", ['deniedModule'], 'tools/build.mjs'],
  ['测试 fs', "import fs from 'fs';", ['deniedModule'], 'scripts/tests/export/a.test.mjs'],
  ['promises 子路径', "import 'node:fs/promises';", ['deniedModule']],
  ['网络与进程', "import 'http'; import 'net'; import 'worker_threads';", ['deniedModule', 'deniedModule', 'deniedModule']],
  ['带前缀的数据库模块', "import 'node:sqlite';", ['deniedModule']],
  ['计算与框架', "import path from 'node:path'; import { URL } from 'node:url'; import { test } from 'node:test'; import assert from 'node:assert/strict';", []],
  ['lite 门面', "import fs from 'litenvi-node/lite-fs.mjs';", []],
  ['再导出', "export { readFile } from 'fs'; export * from 'node:http';", ['deniedModule', 'deniedModule']],
  ['静态动态导入', "const name = 'node:' + 'fs'; import(name);", ['deniedModule']],
  ['模板模块名', "const suffix = 'fs'; import(`node:${suffix}`);", ['deniedModule']],
  ['循环模块名不溢出', 'const first = second; const second = first; import(first);', []],
  ['未知普通动态导入保留静态边界', 'function load(name) { return import(name); }', []],
  ['require', "require('fs');", ['deniedModule']],
  ['require 别名', "const load = require; load('net');", ['deniedModule']],
  ['影子 require', "function run(require) { require('fs'); }", []],
  ['createRequire 别名', "import { createRequire as make } from 'node:module'; const load = make(import.meta.url); load('node:fs');", ['deniedModule']],
  ['module.require', "module.require('node:fs');", ['deniedModule']],
  ['getBuiltinModule', "process.getBuiltinModule('fs');", ['deniedModule']],
  ['getBuiltinModule 别名', "const { getBuiltinModule: load } = process; load('fs');", ['deniedModule']],
  ['进程对象别名', "const proc = process; proc['getBuiltinModule']('fs');", ['deniedModule']],
  ['内置加载器 call', "process.getBuiltinModule.call(process, 'fs');", ['deniedModule']],
  ['内置加载器 apply', "process.getBuiltinModule.apply(process, ['fs']);", ['deniedModule']],
  ['绑定加载器和目标', "const load = process.getBuiltinModule.bind(process, 'fs'); load();", ['deniedModule']],
  ['globalThis process', "globalThis.process.getBuiltinModule('node:http');", ['deniedModule']],
  ['未知内置模块名', 'function run(name) { return process.getBuiltinModule(name); }', ['unknownBuiltin']],
  ['影子 process', "function run(process) { return process.getBuiltinModule('fs'); }", []],
  ['非环境内置模块', "process.getBuiltinModule('path');", []],
  ['自定义黑名单叠加', "import 'blocked';", ['deniedModule'], 'scripts/main.mjs', { deniedModules: ['blocked'] }],
  ['普通包子路径连带', "import 'blocked/subpath';", ['deniedModule'], 'scripts/main.mjs', { deniedModules: ['blocked'] }],
  ['子路径黑名单不向上扩大', "import 'allowed';", [], 'scripts/main.mjs', { deniedModules: ['allowed/subpath'] }],
  ['字符串和注释不当作导入', "const text = \"import 'node:fs'\"; // require('http')", []],
  ['不能用空黑名单关闭环境约束', "import 'node:fs';", ['deniedModule'], 'scripts/main.mjs', { deniedModules: [] }],
  ['litenvi 底层 fs', "import 'node:fs';", [], 'scripts/lite-fs.mjs', {}, 'litenvi'],
  ['litenvi 子路径归一', "import 'fs/promises';", [], 'scripts/lite-fs.mjs', {}, 'litenvi'],
  ['HTTP 门面原生传输', "import 'node:http'; import 'node:https';", [], 'scripts/lite-http.mjs', {}, 'litenvi'],
  ['服务端门面原生监听', "import 'node:http';", [], 'scripts/lite-server.mjs', {}, 'litenvi'],
  ['OS 门面原生信息', "import 'node:os';", [], 'scripts/lite-os.mjs', {}, 'litenvi'],
  ['进程门面系统常量', "import 'node:os';", [], 'scripts/lite-process.mjs', {}, 'litenvi'],
  ['子进程门面必要调度', "import 'node:child_process'; import 'node:timers'; import 'node:os';", [], 'scripts/lite-child_process.mjs', {}, 'litenvi'],
  ['Node 执行器宿主边界', "import 'node:worker_threads'; import 'node:timers'; import 'node:child_process'; import 'node:http'; import 'node:https'; import 'node:net'; import 'node:tls';", [], 'scripts/lite-cmd-node.mjs', {}, 'litenvi'],
  ['OS 对照保留独立事实源', "import 'node:os';", [], 'scripts/tests/export/lite-os.test.mjs', {}, 'litenvi'],
  ['底层不扩大模块', "import 'node:net';", ['deniedModule'], 'scripts/lite-fs.mjs', {}, 'litenvi'],
  ['底层不扩大文件', "import 'node:fs';", ['deniedModule'], 'scripts/other.mjs', {}, 'litenvi'],
  ['原生对照内置授权', "import 'node:child_process';", [], 'scripts/tests/export/native-reference.test.mjs', {}, 'litenvi'],
  ['OS 对照不获进程权限', "import 'node:child_process';", ['deniedModule'], 'scripts/tests/export/lite-os.test.mjs', {}, 'litenvi'],
  ['普通项目同名文件不放行', "import 'node:fs';", ['deniedModule'], 'scripts/lite-fs.mjs'],
  ['相同公开结构不替代包名', "import 'node:fs';", ['deniedModule'], 'scripts/lite-fs.mjs', {}, 'other-package'],
  ['只冒用包名不放行', "import 'node:fs';", ['deniedModule'], 'scripts/lite-fs.mjs', {}, 'name-only'],
  ['无效包身份不放行且不崩溃', "import 'node:fs';", ['deniedModule'], 'scripts/lite-fs.mjs', {}, 'null'],
  ['嵌套普通包不继承权限', "import 'node:fs';", ['deniedModule'], 'scripts/lite-fs.mjs', {}, 'nested'],
  ['内置文件仍拦未知模块目标', 'function run(name) { return process.getBuiltinModule(name); }', ['unknownBuiltin'], 'scripts/lite-fs.mjs', {}, 'litenvi'],

];

for (const [name, code, expected, filename = 'scripts/main.mjs', options = {}, identity = 'ordinary'] of f_CASES) {
  /** 场景：统一原生环境入口约束覆盖所有自研代码，精确登记不扩权。 */
  test(name, function testBlacklistModuleImports() {
    const root = i_createFixture({
      'package.json': JSON.stringify(identity === 'null' ? null : identity === 'ordinary' ? { name: 'fixture' } : identity === 'name-only' ? { name: 'litenvi-node', type: 'module' } : { name: identity === 'other-package' ? 'unrelated' : 'litenvi-node', type: 'module', exports: { './lite-*.mjs': './scripts/lite-*.mjs' } }),
      ...(identity === 'nested' ? { 'scripts/package.json': '{"name":"ordinary"}' } : {}),
    });
    try {
      const config = [{ files: ['**/*.mjs'], plugins: { atb: plugin }, rules: { 'atb/no-blacklist-module-imports': ['error', options] } }];
      const actual = new Linter({ cwd: root }).verify(code, config, { filename: path.join(root, filename) });
      assert.deepEqual(actual.map(item => item.messageId), expected, `${name}应按来源与精确授权报告`);
    } finally { fs.t_unmock(); }
  });
}

/** 场景：公共工厂统一接线，生产代码与测试代码使用同一规则。 */
test('工厂接线覆盖全部 JS 并传递边界登记', function testBlacklistModuleFactory() {
  const config = createConfig();
  const block = config.find(item => item.rules?.['atb/no-blacklist-module-imports']);
  assert.deepEqual(block?.files, ['**/*.js', '**/*.mjs', '**/*.cjs'], '生产、测试和工具代码必须同域检查');
  assert.deepEqual(block?.rules['atb/no-blacklist-module-imports'][1], { deniedModules: ['node:fs', 'node:http', 'node:https', 'node:child_process', 'node:process'] }, '工厂只传黑名单，不暴露模块例外');
  assert.ok(!config.some(item => item.rules?.['atb/no-native-environment-imports'] || item.rules?.['atb/no-blacklist-modules-in-test']), '旧规则名不能在默认配置中重复接线');
});

/** 场景：统一规则只保留项目根例外，不接受测试目录或分离的生产授权配置。 */
test('统一规则拒绝已移除参数', function testRemovedBlacklistOptions() {
  const root = i_createFixture({ 'package.json': '{"name":"fixture"}' });
  try {
    for (const options of [{ testDir: 'scripts/tests' }, { nativeAdapters: [] }, { exceptionFilesAllowModules: [] }]) {
      const config = [{ files: ['**/*.mjs'], plugins: { atb: plugin }, rules: { 'atb/no-blacklist-module-imports': ['error', options] } }];
      assert.throws(() => new Linter({ cwd: root }).verify('', config, { filename: `${root}/scripts/main.mjs` }), /additional|unexpected|testDir|nativeAdapters|exceptionFilesAllowModules/, '移除的规则参数应明确拒绝');
    }
    assert.throws(() => createConfig({ exceptionFilesAllowModules: [] }), /不支持.*exceptionFilesAllowModules/, '工厂应拒绝可配置模块例外');
    assert.throws(() => createConfig({ nativeAdapters: [] }), /不支持.*nativeAdapters/, '工厂也应拒绝分离的生产授权参数');
  } finally { fs.t_unmock(); }
});

/** 场景：litenvi 同名文件的软链接指向包外时，不可继承真实底层的权限。 */
test('越界软链接不能借用内置权限', function testBuiltinSymlinkBoundary() {
  const root = i_createFixture({ 'package.json': JSON.stringify({ name: 'litenvi-node', type: 'module', exports: { './lite-*.mjs': './scripts/lite-*.mjs' } }) });
  const outside = `${root}-outside`;
  try {
    fs.mkdirSync(`${root}/scripts`, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(`${outside}/foreign.mjs`, '');
    fs.symlinkSync(`${outside}/foreign.mjs`, `${root}/scripts/lite-fs.mjs`);
    const config = [{ files: ['**/*.mjs'], plugins: { atb: plugin }, rules: { 'atb/no-blacklist-module-imports': 'error' } }];
    const result = new Linter({ cwd: root }).verify("import 'node:fs';", config, { filename: `${root}/scripts/lite-fs.mjs` });
    assert.deepEqual(result.map(item => item.messageId), ['deniedModule'], '包外源码不能通过同名软链接获得原生权限');
  } finally { fs.t_unmock(); }
});

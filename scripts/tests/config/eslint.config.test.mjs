// 仓库根 eslint.config.mjs 守护测试：真实读取根配置源码并断言其组合形态（经公共工厂、
// JSON parser 接线），断言工厂产出的 plugins / rules 关键字段。读取经 lite-fs 门面并完成
// mock 装配（排除仓库根透传真实配置）；new URL(import.meta.url) 是 no-missing-config-tests
// 的真实读取证据形态（lite-fs mock 分派对 file: URL 归一为真实路径）；import 工厂自引用
// 满足 config 分区入口要求。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'litenvi-node/lite-fs.mjs';
import rootConfig from '../../../eslint.config.mjs';

const REAL_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** 场景：根配置组合形态——必须经公共工厂组合规则集，JSON parser 接线在位。 */
test('valid：根配置锚定工厂组合', function test_valid_根配置锚定工厂组合() {
  fs.t_mock({ exclude: [REAL_ROOT] });
  try {
    const text = fs.readFileSync(new URL('../../../eslint.config.mjs', import.meta.url), 'utf8');
    assert.match(text, /createLayoutConfig/, '根配置必须经公共工厂组合规则集');
    assert.match(text, /parser/, 'JSON parser 接线在位（清单面规则依赖）');
  } finally { fs.t_unmock(); }
});

/** 场景：工厂产出关键字段——plugins 注册块与 rules 块在位。 */
test('valid：工厂产出 plugins 与 rules 块', function test_valid_工厂产出_plugins_与_rules_块() {
  const config = rootConfig;
  assert.ok(config.some((block) => block.plugins && block.plugins.atb), 'plugins.atb 注册块在位');
  assert.ok(config.some((block) => block.rules && Object.keys(block.rules).length > 0), 'rules 块在位');
});

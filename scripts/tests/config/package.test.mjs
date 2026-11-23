// 仓库根 package.json 守护测试：真实加载清单并断言关键字段（name / exports）——配置是行为面，
// 改动须经测试覆盖。读取经 lite-fs 门面并完成 mock 装配（排除仓库根透传真实清单，内存卷不
// 遮蔽）；new URL(import.meta.url) 是 no-missing-config-tests 的真实读取证据形态（lite-fs
// mock 分派对 file: URL 归一为真实路径）；import 插件入口自引用满足 config 分区入口要求，
// 顺带守护规则注册面。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'litenvi-node/lite-fs.mjs';
import plugin from 'atb-eslint-plugin/plugin.mjs';

const REAL_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** 场景：清单关键字段在位——包名是生态引用锚点，规则通配导出面是单规则导入通道。 */
test('valid：清单关键字段在位', function test_valid_清单关键字段在位() {
  fs.t_mock({ exclude: [REAL_ROOT] });
  try {
    const manifest = JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
    assert.equal(manifest.name, 'atb-eslint-plugin', '包名即生态引用锚点');
    assert.ok(Object.hasOwn(manifest.exports, './rules/*.mjs'), '规则通配导出面在位');
    assert.ok(Object.hasOwn(manifest.exports, './config.mjs'), '工厂导出面在位');
  } finally { fs.t_unmock(); }
});

/** 场景：exports 面真实可加载——自引用导入插件入口，守护规则注册面完整。 */
test('valid：exports 面加载与规则注册', function test_valid_exports_面加载与规则注册() {
  assert.ok(plugin.rules['no-blacklist-module-imports'] !== undefined, '环境模块黑名单规则在注册面');
  assert.ok(plugin.rules['no-missing-config-tests'] !== undefined, '本守护规则自身在注册面');
});

// atb-eslint-plugin ESLint 入口：本仓自检配置 = 仓库布局契约 v2 的「最佳模板」形态——
// 布局事实全部走工厂默认（root 下全域受管，测试 scripts/tests、共享代码 scripts/lib、
// 依赖 node_modules，八层内置全局忽略），仅叠加仓内专属事实：JSON parser 取自本仓
// devDependency eslint-plugin-package-json（公共工厂不携带项目依赖）、本地来源白名单登记
// litenvi-node 平级仓库。导出的 createConfig(root) 供内存夹具等按指定根目录装配同一套
// 配置；公共工厂请直接经 'atb-eslint-plugin/config.mjs' 导入。检查器源码自检职责在本仓
//（agent-team-board 原 SC-LINT-ROLE-029）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJsonPlugin from 'eslint-plugin-package-json';
import { createConfig as createLayoutConfig } from './scripts/config.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// 本仓专属事实：package.json 分区（parser）；布局目录全部走默认。litenvi-node 的 file:
// 本地来源是开发分支联调形态，no-loose-dependency-specs 不检（main 分支守护属交付流程）。
const repoLayout = {
  packageJson: {
    parser: packageJsonPlugin.configs.recommended.languageOptions.parser,
  },
};

export function createConfig(root = ROOT) {
  return createLayoutConfig({ root, ...repoLayout });
}

export default createConfig();

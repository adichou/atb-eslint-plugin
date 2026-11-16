// atb-eslint-plugin 公共配置工厂：createConfig(options) 组合 atb 规则集，按「仓库布局契约 v2」
// 产出 flat config 数组——布局事实全部有默认值，最佳模板形态下调用方只需传 root。
// 布局模型：
// - 管辖面 = root 下全部 js/mjs/cjs（统一三扩展名），除全局忽略层外一律有角色；
// - 角色目录（相对 root 解析，互不重叠）：testDir（测试身份——t_ 授权 + 测试规则）、libDir
//   （共享代码——生产侧分层底座，附加依赖单向检测）、depsDir（第三方依赖——全局忽略）；
// - 未落入角色的受管文件默认生产角色；根配置 eslint.config.mjs（内置常量）受越级访问/f_
//   分级/吞错管辖，不受依赖三级链与循环检查约束（配置基建不进运行时，合法引用 devDependencies）；
// - 全局忽略八层（内置于产出，不可配置）：depsDir、点号开头目录（隐藏目录及点号文件）、
//   temp/tmp 目录、coverage/output 产物目录、*.min.js 压缩文件、image 资产目录、
//   agent-team-board 看板数据目录（生态约定），之上叠加调用方 ignores；
// - no-unmanaged-js 在本模型下恒真（管辖面即 root 全域，不存在白名单外文件），工厂不再接线；
//   规则保留导出，供手动白名单式布局使用。
// 内置基线 1/2/3 默认启用，其余规则块默认【停用】——按需逐个启用（去掉行首注释即接入）；块内管辖文件与选项内聚，
// 规则 ID 全局唯一，块间无覆盖语义。本模块属包的公共导出面（经 'atb-eslint-plugin/config.mjs'
// 导入）：只依赖本包 plugin 与 Node 内置模块，不携带任何项目专属依赖与参数缺省——JSON
// parser（如 eslint-plugin-package-json，调用方自备依赖）与本地来源白名单等项目事实由
// 调用方传入；不经工厂、手动注册插件按需组合同样受支持（见 README 接入示例）。
// options 契约（随规则块启用逐步回归；当前仅以下三项）：
// - root（必需）：仓库根绝对路径——布局锚点，也是各规则 scanPath 的解析基准。
// - testDir（缺省 'scripts/tests'）：测试代码目录——测试规则块的管辖面（t_ 授权随越级规则回归）。
// - libDir（缺省 'scripts/lib'）：共享代码目录——lib 单向分层的管辖面。
// - depsDir（缺省 'node_modules'）：依赖目录——全局忽略第一层。
// - ignores（缺省 []）：在内置忽略之上追加的全局忽略。
// - plugins（缺省 {}）：调用方额外插件注册——测试文件内联 eslint-disable 引用的插件、
//   调用方自有规则块所需的插件在此登记；注册 playwright 即接线其三件套守卫（见下）。
// 其余布局与纪律选项（testDir / libDir / packageJsonPath /
// badTestExceptionFiles / badTestOptions / unmockedExceptionFiles / unmockedOptions /
// entry / entryExceptionFiles / webPage / packageJson）随对应规则块启用逐项回归，
// 各注释块内标注了该块所需的选项。
import path from 'node:path';
import atbRules from './plugin.mjs';

// 目录 → JS 受管面：统一覆盖 js/mjs/cjs 三扩展名（glob 相对 root 解析）。
const f_jsFilesUnder = (dir) => [`${dir}/**/*.js`, `${dir}/**/*.mjs`, `${dir}/**/*.cjs`];

export function createConfig({
  root,
  testDir = 'scripts/tests',
  libDir = 'scripts/lib',
  depsDir = 'node_modules',
  ignores = [],
  plugins = {},
} = {}) {
  if (!root || !path.isAbsolute(root)) {
    throw new Error('createConfig 需要 root 为仓库根绝对路径：布局目录与各规则 scanPath 均相对它解析');
  }
  const jsLanguage = { ecmaVersion: 'latest' }; // 解析面不锁 sourceType：按扩展名与清单 type 推断（.mjs=module、.cjs=commonjs、.js 按最近 package.json）
  const jsGlobs = ['**/*.js', '**/*.mjs', '**/*.cjs'];
  return [
  // ---------- 全局忽略：八层内置（依赖 / 隐藏目录 / 临时目录 / 产物 / 资产 / 看板数据）+ 调用方追加 ----------
  { ignores: [
      `${depsDir}/**`, // dependency 角色：第三方代码不参与任何检查
      '**/.*', '**/.*/**', // 点号开头目录（隐藏目录）及内容，顺带覆盖点号文件
      '**/temp/**', '**/tmp/**', // temp / tmp 临时目录及内容
      '**/coverage/**', '**/output/**', // 构建 / 报告产物目录
      '**/*.min.js', // 压缩产物文件
      'image/**', 'agent-team-board/**', // 资产目录与看板数据目录（生态约定）
      ...ignores,
  ] },
  // ---------- 插件注册：plugins 对整个配置数组生效（atb + 调用方追加），规则块不再重复声明 ----------
  { plugins: { atb: atbRules, ...plugins } },

  // ======== 内置基线 1/2/3 默认启用；其余规则块默认【停用】：按需逐个启用（去掉行首注释即接入） ========

  // ---------- 注释对账：权限标注与导出面/前缀核验（缺失不报）——受管全域 ----------
  // {
  //   files: jsGlobs,
  //   languageOptions: { ...jsLanguage },
  //   rules: {
  //     'atb/no-wrong-access-comment': ['error', { scanPath: root }],
  //   },
  // },

  // ---------- 内置基线 1：通配符导入禁令（按实际使用的公共导出写具名导入）——受管全域 ----------
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'ImportNamespaceSpecifier',
        message: "禁止 'import * as' 通配符导入：按实际使用的公共导出写具名导入",
      }],
    },
  },

  // ---------- 内置基线 2：finally 安全——受管全域 ----------
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'no-unsafe-finally': 'error',
    },
  },
  
  // ---------- 内置基线 3：禁止静默捕获异常不处理 ----------
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-silent-catch': 'error',
    },
  },
  // ---------- 未声明依赖三级判定链（生产 + lib + 测试；根配置合法引用 devDependencies 豁免） ----------
  // 规则自锚定项目根（受检文件向上找最近 package.json，无需 scanPath）；devPaths 相对所属包根解析。
  // {
  //   files: jsGlobs,
  //   ignores: ['eslint.config.mjs'],
  //   languageOptions: { ...jsLanguage },
  //   rules: {
  //     'atb/no-undeclared-dependencies-imports': ['error', { devPaths }],
  //   },
  // },
  // ----- 访问级别分级：非导出方法必须 f_，测试文件导出面必须 t_（testDir 相对仓库根，原样透传） --------
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-wrong-access-level': ['error', { testDir }],
    },
  },
  
  // ---------- 越级访问：f_/i_/t_ 前缀越级（生产 + lib + 测试 + 根配置）——受管全域 ----------
  // 规则自锚定项目根（受检文件向上找最近 package.json，无需 scanPath）；testDir 与分级块
  // 同名透传。
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-out-of-level-access': ['error', { testDir }],
    },
  },



  // ---------- 依赖循环：受管模块间本地依赖图回溯（生产 + lib + 测试；根配置豁免） ----------
  // {
  //   files: jsGlobs,
  //   ignores: ['eslint.config.mjs'],
  //   languageOptions: { ...jsLanguage },
  //   rules: {
  //     'atb/no-dependency-cycles': ['error', { scanPath: root }],
  //   },
  // },

  // ---------- playwright 守卫三件套：调用方注册 playwright 插件时接线（异步等待/固定睡眠/force 选项） ----------
  // ...(plugins.playwright ? [{
  //   files: f_jsFilesUnder(testDir),
  //   languageOptions: { ...jsLanguage },
  //   rules: {
  //     'playwright/missing-playwright-await': ['error', { includePageLocatorMethods: true }],
  //     'playwright/no-wait-for-timeout': 'error',
  //     'playwright/no-force-option': 'error',
  //   },
  // }] : []),

  // ---------- lib 单向分层：共享代码不得反向依赖 lib 外源代码（dependencies 包说明符与内置模块除外） ----------
  // 双规则承载：no-restricted-imports 禁相对上溯/旁路（静态导入与 export-from）；
  // no-restricted-syntax 禁动态 import（静态检查盲区，防绕行）。
  // {
  //   files: f_jsFilesUnder(libDir),
  //   languageOptions: { ...jsLanguage },
  //   rules: {
  //     'no-restricted-imports': ['error', { patterns: [{
  //       group: ['..', '../*', '../**'],
  //       message: `lib 层单向依赖：${libDir} 只能引用 lib 内模块（./）、内置模块与依赖清单中的包，不得上溯入口或旁路 lib 外的其他源代码；需要 lib 外能力时下沉到 lib 或经参数注入`,
  //     }] }],
  //     'no-restricted-syntax': ['error', {
  //       selector: 'ImportNamespaceSpecifier',
  //       message: "禁止 'import * as' 通配符导入：按实际使用的公共导出写具名导入",
  //     }, {
  //       selector: 'ImportExpression',
  //       message: 'lib 层单向依赖：禁用动态 import（静态检查盲区），需要懒加载能力时先在配置层明确放开',
  //     }],
  //   },
  // },


  // ---------- 测试坏写法三合一（质量模式 + SC 注释归属 + 页面交互真实性） ----------
  // {
  //   files: f_jsFilesUnder(testDir),
  //   languageOptions: { ...jsLanguage },
  //   rules: {
  //     'atb/no-bad-test-patterns': ['error', { scanPath: root, exceptionFiles: badTestExceptionFiles, ...badTestOptions }],
  //   },
  // },

  // ---------- litenvi 门面装配纪律（t_mock/t_install 装配与 t_unmock 复位配对） ----------
  // {
  //   files: f_jsFilesUnder(testDir),
  //   languageOptions: { ...jsLanguage },
  //   rules: {
  //     'atb/no-unmocked-litenvi-in-test': ['error', { scanPath: testRoot, exceptionFiles: unmockedExceptionFiles, ...unmockedOptions }],
  //   },
  // },

  // ---------- 测试入口驱动白名单（测试以 node 驱动生产脚本须命中 entry 清单） ----------
  // {
  //   files: f_jsFilesUnder(testDir),
  //   languageOptions: { ...jsLanguage },
  //   rules: {
  //     'atb/no-undeclared-entry-in-test': ['error', {
  //       scanPath: testRoot,
  //       entry,
  //       ...(webPage ? { webPage } : {}), // webPage 声明为 object，null 会过不了规则 schema
  //       exceptionFiles: entryExceptionFiles,
  //     }],
  //   },
  // },

  // ---------- package.json 依赖来源政策（禁 dist-tag + 本地来源白名单，parser 调用方自备） ----------
  // ...(packageJson?.parser ? [{
  //   files: [packageJsonPath],
  //   languageOptions: { parser: packageJson.parser },
  //   rules: {
  //     'atb/no-loose-dependency-specs': ['error', { localWhitelist: packageJson.localWhitelist || [] }],
  //   },
  // }] : []),
  ];
}

export default createConfig;

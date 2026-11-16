// atb-eslint-plugin 公共配置工厂：createConfig(options) 组合 atb 规则集，按「仓库布局契约 v2」
// 产出 flat config 数组——布局事实全部有默认值，最佳模板形态下调用方只需传 root。
// 布局模型：
// - 管辖面 = root 下全部 js/mjs/cjs（统一三扩展名），除全局忽略层外一律有角色；
// - 角色目录（相对 root 解析，互不重叠）：testDir（测试身份——t_ 授权 + 测试规则）、libDir
//   （共享代码——生产侧分层底座，附加依赖单向检测）、depsDir（第三方依赖——全局忽略）、
//   buildToolDir（构建工具目录——devDependencies 开放面，缺省不启用）；
// - 未落入角色的受管文件默认生产角色；根配置 eslint.config.mjs（内置常量）受越级访问/f_
//   分级/吞错与依赖三级链管辖（规则内置识别为开发代码：devDependencies 合法，未声明依赖照抓），
//   不受依赖循环检查约束；
// - 全局忽略八层（内置于产出，不可配置）：depsDir、点号开头目录（隐藏目录及点号文件）、
//   temp/tmp 目录、coverage/output 产物目录、*.min.js 压缩文件、image 资产目录、
//   agent-team-board 看板数据目录（生态约定），之上叠加调用方 ignores；
// - no-unmanaged-js 在本模型下恒真（管辖面即 root 全域，不存在白名单外文件），工厂不再接线；
//   规则保留导出，供手动白名单式布局使用。
// 内置基线 1/2/3、依赖三级链、死代码三件（死导出/文件私有死绑定/未使用依赖——后者随
// packageJson.parser 接入）、访问级别分级与越级访问默认启用，其余规则块默认【停用】——按需逐个启用（去掉行首注释即接入）；块内管辖文件与选项内聚，
// 规则 ID 全局唯一，块间无覆盖语义。本模块属包的公共导出面（经 'atb-eslint-plugin/config.mjs'
// 导入）：只依赖本包 plugin 与 Node 内置模块，不携带任何项目专属依赖与参数缺省——JSON
// parser（如 eslint-plugin-package-json，调用方自备依赖）与本地来源白名单等项目事实由
// 调用方传入；不经工厂、手动注册插件按需组合同样受支持（见 README 接入示例）。
// options 契约（随规则块启用逐步回归）：
// - root（必需）：仓库根绝对路径——布局锚点，也是各规则 scanPath 的解析基准。
// - testDir（缺省 'scripts/tests'）：测试代码目录——测试规则块的管辖面（t_ 授权随越级规则回归）。
// - libDir（缺省 'scripts/lib'）：共享代码目录——lib 单向分层的管辖面。
// - depsDir（缺省 'node_modules'）：依赖目录——全局忽略第一层。
// - buildToolDir（缺省 ''）：构建工具目录——构建期/开发期辅助支撑代码的角色目录，devDependencies
//   对它开放（依赖三级链块同名桥接）；未声明时不桥接。
// - ignores（缺省 []）：在内置忽略之上追加的全局忽略。
// - plugins（缺省 {}）：调用方额外插件注册——测试文件内联 eslint-disable 引用的插件、
//   调用方自有规则块所需的插件在此登记；注册 playwright 即接线其三件套守卫（见下）。
// - packageJson（缺省 {}）：package.json 面规则接线——传 parser（调用方自备依赖，如
//   eslint-plugin-package-json）即启用清单面三件（未使用运行时依赖、入口面指向核验、
//   dist-tag 禁令）；本地来源（file:/link:）不检——开发分支联调形态，main 分支守护归交付流程。
// - packageJsonPath（缺省 'package.json'）：package.json 面规则的文件目标（相对 root）。
// - uiTest（缺省 null 不传）：UI 分区接线（测试三分区模型）——{ enabled（缺省 true）, startup }
//   启动命令为「入口文件 + 参数」词序列，入口文件必须在 package.json bin 声明块中声明。
// 其余布局与纪律选项（badTestExceptionFiles / badTestOptions / unmockedExceptionFiles /
// unmockedOptions）随对应规则块启用逐项回归，
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
  buildToolDir = '',
  ignores = [],
  plugins = {},
  packageJson = {},
  uiTest = null,
  packageJsonPath = 'package.json',
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

  
  // ---------- 通配符导入禁令（按实际使用的公共导出写具名导入）——受管全域 ----------
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
  
  // ---- 禁止不安全的 finally 语句，例如 finally中直接 return 吞返回值 ----------
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'no-unsafe-finally': 'error',
    },
  },
  
  // ---------- 禁止静默捕获异常不处理 ----------
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-silent-catch': 'error',
    },
  },
  // ---------- 禁止未在 package.json 中声明的依赖导入 ----------
  // 规则自锚定项目根（受检文件向上找最近 package.json，无需 scanPath）。testDir 同名桥接
  //（测试代码 = devDependencies 合法受众），buildToolDir 同名透传（构建工具目录，未声明不
  // 桥接）；根配置 eslint.config.mjs 由规则内置识别为开发代码（不经参数，未声明依赖照抓）；
  // 本块不设 ignores，不支持忽略。
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-undeclared-dependencies-imports': ['error', { testDir, buildToolDir }],
    },
  },
  // ---------- 禁止无用代码：无用导出，无用私有代码和无用导入
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-unused-exports': ['error', { testDir }],
      'atb/no-unused-file-private-codes': 'error',
      'atb/no-unused-imports': 'error',
    },
  },
  // ---------- 禁止 package.json 中的无用依赖、错误导出与宽松版本标签----
  // 公共工厂不携带项目专属依赖；三规则自锚定 package.json 所在目录——依赖扫描收集裸导入包名；
  // 入口面核验禁止 bin/main/exports 指向 testDir 测试文件与 buildToolDir 构建工具文件；
  // 版本政策禁全部 dist-tag 浮动标签（本地 file:/link: 来源不检——开发分支联调形态，
  // main 分支守护归交付流程，见看板 REQ-20261116-003）。
  ...(packageJson?.parser ? [{
    files: [packageJsonPath],
    languageOptions: { parser: packageJson.parser },
    rules: {
      'atb/no-unused-runtime-dependencies-in-package': 'error',
      'atb/no-wrong-exports-in-package': ['error', { testDir, buildToolDir }],
      'atb/no-loose-dependency-specs': 'error',
    },
  }] : []),
  // ----- 禁止错误的访问级别和注释：非导出方法必须 f_，测试文件导出面必须 t_  --------
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-wrong-access-level': ['error', { testDir }],
    },
  },
  
  // ----禁止越级访问------
  // 规则自锚定项目根（受检文件向上找最近 package.json，无需 scanPath）；testDir 与分级块
  // 同名透传。
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-out-of-level-access': ['error', { testDir }],
    },
  },

  // -----禁止共享库反向导入业务代码 ----------
  {
    files: f_jsFilesUnder(libDir),
    languageOptions: { ...jsLanguage },
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        group: ['..', '../*', '../**'],
        message: `lib 层单向依赖：${libDir} 只能引用 lib 内模块（./）、内置模块与依赖清单中的包，不得上溯入口或旁路 lib 外的其他源代码；需要 lib 外能力时下沉到 lib 或经参数注入`,
      }] }],
      /*
      flat config 同名规则后者覆盖前者——lib 块声明了 no-restricted-syntax（ImportExpression）就会在 lib 文件上整体覆盖前面的通配符禁令，lib 文件立即失守（复现：lib 下通配符导入零报告），因此需要在这里重复声明通配符禁令，才能在 lib 文件上同时生效两条规则。
      */
      'no-restricted-syntax': ['error', {
        selector: 'ImportNamespaceSpecifier',
        message: "禁止 'import * as' 通配符导入：按实际使用的公共导出写具名导入",
      }, {
        selector: 'ImportExpression',
        message: 'lib 层单向依赖：禁用动态 import（静态检查盲区），需要懒加载能力时先在配置层明确放开',
      }],
    },
  },

  // ----禁止循环导入（项目根自锚定建图，无路径参数与豁免：根配置同样受检） ----
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-import-cycles': 'error',
    },
  },
  
  // ---- 测试三分区入口模型：测试文件必须归入 bin/export/ui 分区，各分区绑定入口纪律 ----
  // bin：驱动目标 ∈ package.json bin 声明；export：import ∈ exports/main 声明面；
  // ui（按 uiTest 启用）：驱动匹配 uiTest.startup 命令（入口文件 ∈ bin）。testDir 同名桥接；
  // uiTest 由调用方传入（{ enabled, startup }，enabled 缺省 true）。
  {
    files: f_jsFilesUnder(testDir),
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-undeclared-entry-in-test': ['error', { testDir, ...(uiTest ? { uiTest } : {}) }],
    },
  },
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


  ];
}

export default createConfig;

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
//   agent-team-board 看板数据目录（生态约定），不接受调用方追加；
// - no-unmanaged-js 在本模型下恒真（管辖面即 root 全域，不存在白名单外文件），工厂不再接线；
//   规则保留导出，供手动白名单式布局使用。
// 默认启用基础质量、依赖与访问级别、入口、测试装配、测试质量和黑盒边界；清单规则随
// packageJson.parser 接入。块内管辖文件与选项内聚，
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
// - packageJson（缺省 {}）：package.json 面规则接线——传 parser（调用方自备依赖，如
//   eslint-plugin-package-json）即启用清单面三件（未使用运行时依赖、入口面指向核验、
//   dist-tag 禁令）；本地来源（file:/link:）不检——开发分支联调形态，main 分支守护归交付流程。
// - packageJsonPath（缺省 'package.json'）：package.json 面规则的文件目标（相对 root）。
// - hooksDir（缺省 ''，不启用）：AI Agent 的 hook JSON 目录（相对 root，递归扫描）。命令文件
//   加入 bin 测试入口，JSON 配置加入 no-missing-config-tests 的读取与字段断言守护。
// - uiTest（缺省 null 不传）：UI 分区接线——{ enabled（缺省 true）, startup, index（缺省 /） }
//   启动命令为「入口文件 + 参数」词序列，入口文件须在 bin 中声明；UI 用例还须导航到
//   http://127.0.0.1:{port}/{index}，端口可动态，首页 index 缺省 /。
// - deniedModules（缺省环境模块组）：测试环境模块黑名单（no-modules-import-in-test）——testDir
//   内禁止导入的模块清单；归一化匹配（fs ≡ node:fs）且子路径连带（node:fs 拦 node:fs/promises），
//   传入即整组覆盖。环境组属生态通用纪律而非项目专属事实，故入工厂缺省。
// - exceptionFilesAllowModules（缺省 []）：测试原生模块文件例外登记 [{ file, modules, reason }]——
//   file 是相对 testDir 的精确文件（禁止越界与 glob），仅放行所列模块及子路径，理由必填；
//   与黑名单是两个独立参数（极性不混叠）：本参数只做「按文件放行」。明确授权 node:child_process
//   的 export 测试还可使用原生对照进程，不豁免本包命令分区或公开导入要求。
// - packageJsonPath 守护同名桥接：配置测试守护（no-missing-config-tests）的守护对象为固定
//   双配置——根配置 eslint.config.mjs（家族内置常量）与 packageJsonPath 指向的清单（缺省
//   'package.json'），并追加 hooksDir 下的 JSON；不设自由守护清单入参。守护测试按约定命名（package.test.mjs /
//   eslint.config.test.mjs）在 testDir 内定位，须真实读取并断言关键字段。
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
  packageJson = {},
  uiTest = null,
  packageJsonPath = 'package.json',
  hooksDir = '',
  deniedModules = ['node:fs', 'node:http', 'node:https', 'node:child_process', 'node:process'],
  exceptionFilesAllowModules = [],
  ...unsupportedOptions
} = {}) {
  if (!root || !path.isAbsolute(root)) {
    throw new Error('createConfig 需要 root 为仓库根绝对路径：布局目录与各规则 scanPath 均相对它解析');
  }
  const unsupported = Object.keys(unsupportedOptions);
  if (unsupported.length) throw new TypeError(`createConfig 不支持配置参数：${unsupported.join(', ')}`);
  const jsLanguage = { ecmaVersion: 'latest' }; // 解析面不锁 sourceType：按扩展名与清单 type 推断（.mjs=module、.cjs=commonjs、.js 按最近 package.json）
  const jsGlobs = ['**/*.js', '**/*.mjs', '**/*.cjs'];
  return [
  // -- 全局忽略：八层内置（依赖 / 隐藏目录 / 临时目录 / 产物 / 资产 / 看板数据） -----
  { ignores: [
      `${depsDir}/**`, // dependency 角色：第三方代码不参与任何检查
      '**/.*', '**/.*/**', // 点号开头目录（隐藏目录）及内容，顺带覆盖点号文件
      '**/temp/**', '**/tmp/**', // temp / tmp 临时目录及内容
      '**/coverage/**', '**/output/**', // 构建 / 报告产物目录
      '**/*.min.js', // 压缩产物文件
      'image/**', 'agent-team-board/**', // 资产目录与看板数据目录（生态约定）
  ] },
  // ---------- 插件注册：内置 atb 对整个配置数组生效，规则块不再重复声明 ----------
  { plugins: { atb: atbRules } },

  // ---------- 禁止通配符导入（按实际使用的公共导出写具名导入）-----
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

  // -- 禁止不从声明的入口进行测试：bin/export/ui/config 分别绑定命令、公开 API、页面和配置证据 ----
  // bin：驱动目标 ∈ package.json bin 或 hooksDir 命令声明；export：import ∈ exports/main 声明面；
  // ui（按 uiTest 启用）：驱动匹配 uiTest.startup 命令（入口文件 ∈ bin）。testDir 同名桥接；
  // uiTest 由调用方传入（{ enabled, startup, index }，enabled 缺省 true）。
  {
    files: f_jsFilesUnder(testDir),
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-undeclared-entry-in-test': ['error', { testDir, ...(packageJsonPath !== 'package.json' ? { packageJsonPath } : {}), ...(hooksDir ? { hooksDir } : {}), ...(uiTest ? { uiTest } : {}), ...(exceptionFilesAllowModules.length ? { exceptionFilesAllowModules } : {}) }],
    },
  },
  // ---- 禁止测试环境模块导入黑名单：测试代码不得直接导入 node:fs/http/child_process 等环境模块 ----
  // 内存世界纪律的导入面闭环：no-unmocked-litenvi-in-test 约束走了 lite 门面的装配，本规则拦住
  // 绕过门面的直接导入。黑名单 deniedModules（缺省环境组）与文件例外 exceptionFilesAllowModules
  // 是两个独立参数——前者全局禁止、后者按文件放行，极性不混叠；testDir 同名桥接；归一化匹配
  //（fs ≡ node:fs）与子路径连带（node:fs 拦 node:fs/promises）。
  {
    files: f_jsFilesUnder(testDir),
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-modules-import-in-test': ['error', { testDir, deniedModules, exceptionFilesAllowModules }],
    },
  },
  // ---- 禁止配置文件无测试：关键配置文件必须有「真实读取 + 关键字段断言」的守护测试 ----
  // 锚点为根配置 eslint.config.mjs（家族内置常量，无需 JSON parser——挂在可选 parser 上的
  // 规则在未接线时静默失效，违背 fail-loud）：自锚定包根，守护对象为固定双配置——根配置与
  // packageJsonPath 清单（同名桥接，缺省 package.json），另追加 hooksDir JSON。守护测试按约定命名（package.test.mjs
  // / eslint.config.test.mjs）在 testDir 内递归定位，且须静态可解地真实读取该配置（import
  // 说明符 / new URL(import.meta.url) / path.join 构造）并断言关键字段（node:assert 绑定归因）
  // ——配置是行为面，改动须经测试覆盖。
  {
    files: ['eslint.config.mjs'],
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-missing-config-tests': ['error', { testDir, packageJsonPath, ...(hooksDir ? { hooksDir } : {}) }],
    },
  },
  // -- 禁止 litenvi 在测试用例中不 mock（t_mock/t_install 装配与 t_unmock 复位配对） ----------
  {
    files: f_jsFilesUnder(testDir),
    languageOptions: { ...jsLanguage },
    rules: {
      'atb/no-unmocked-litenvi-in-test': 'error',
    },
  },
  // ---------- 模块与黑盒边界：不提供文件例外，沿已声明布局检查 ----------
  {
    files: jsGlobs,
    languageOptions: { ...jsLanguage },
    rules: { 'atb/no-test-boundary-violations': ['error', { testDir, libDir, ...(hooksDir ? { hooksDir } : {}) }] },
  },
  // ---------- 测试质量：由 files 统一决定范围，不提供文件例外 ----------
  {
    files: f_jsFilesUnder(testDir),
    languageOptions: { ...jsLanguage },
    rules: { 'atb/no-bad-test-patterns': 'error' },
  },


  ];
}

export default createConfig;

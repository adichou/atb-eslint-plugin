# atb-eslint-plugin

ATB 访问级别与测试边界 ESLint 规则集。解决两个问题：**代码里的接口谁能用**（f_/i_/t_ 前缀级别体系）与**测试怎么写才算测了真东西**（依赖来源、装配纪律、交互真实性）。

适用任何采用该前缀体系的项目（当前：agent-team-board、litenvi-node）。ESLint 9 flat config，Node ≥ 22.12。

## 级别体系

| 前缀 | 级别 | 谁能用 |
| --- | --- | --- |
| 无前缀 | 公开 | 任何调用方 |
| `i_` | 包内协作 | 仅本包生产代码（外部包与测试一律禁） |
| `t_` | 测试专用 | 仅测试代码路径内的文件（生产引用即报） |
| `f_` | 文件私有 | 仅定义文件内（跨文件一律报） |

测试代码不设 `i_` 级别：测试文件导入或导出 `i_` 一律报错，测试协作接口用 `t_`——测试文件导出面只放行 `t_`（具名导出非 `t_` 即报，无前缀导出即公开接口，生产可引用即绕过边界）。非导出方法必须 `f_`；非导出绑定不得携带 `i_`/`t_` 前缀。导出面分工：测试文件导出面由 `no-wrong-access-level` 核验（只放行 `t_`），生产文件导出面由 `no-out-of-level-access` 核验（禁 `f_` 导出与 `t_` 公开别名），互不重叠。返回面相干：函数 `return` 的对象树里，显式带 `i_`/`t_`/`f_` 前缀的键，级别只能与函数同级或为 `f_`——牌子与句柄受众不符即假牌子（公开工厂藏 `t_` 方法、`i_` 工厂藏 `t_` 键、`t_` 工厂挂 `i_` 名均报）。无前缀键不是级别声明（读法 B）：受众由句柄封顶，不参与核级——`i_` 函数返回 `{ query() {} }` 放行，线协议字段名与框架契约键不受累；PascalCase 键是框架协议分派名如 ESLint visitor，同样不参与。测试文件例外：返回树中显式 `i_` 键是 mock 实现生产契约的唯一合法拼写（测试导出必须 `t_`、非导出绑定禁 `i_`），放行；`t_` 键不放行（注入生产即越权消费）。

## 规则一览

| 规则 | 管什么 |
| --- | --- |
| `atb/no-out-of-level-access` | f_ 跨文件、i_ 测试触达、t_ 生产消费；保留模块对象来源，普通函数返回值视为数据不传播接口身份。依赖包与 node: 的 f_/i_ 由其所属项目检查，t_ 名例外——生产禁用（名字即声明，不读依赖源码） |
| `atb/no-wrong-access-level` | 非导出方法必须 f_；非导出绑定不得用 i_/t_ 前缀；测试文件导出必须 t_；非入口面文件（manifest main/exports 之外）不得挂公开/t_ 具名导出——公开/t_ 属于对外接口面，内部文件导出面用 i_；函数返回对象树中显式前缀键的级别须与函数同级或为 f_（无前缀键随句柄不核级）；注释对账：方法紧邻注释的级别标注（私有/内部/测试专用/外部）须与前缀及导出情况一致（缺失不报，原 no-wrong-access-comment 并入） |
| `atb/no-undeclared-dependencies-imports` | 未声明依赖三级判定链：dependencies(含 optional)→peerDependencies→开发路径文件（testDir、buildToolDir、根配置 eslint.config.mjs 三源并集）+devDependencies；本包自引用（specifier 包名 = 本包名）放行；不设 ignores，不支持忽略 |
| `atb/no-import-cycles` | 受管模块间本地依赖循环：相对导入依赖图回溯，成环即报出完整环链；裸包名与 node: 内建不参与建图 |
| `atb/no-unmocked-litenvi-in-test` | 测试直接使用需开关的 litenvi 门面时，helper 链内必须有 t_mock/t_install 装配与 t_unmock 复位 |
| `atb/no-bad-test-patterns` | 测试坏写法三合一：质量模式（缩减执行/恒真断言/吞错/固定睡眠…）+ SC 注释归属 + 伪造页面交互（route 桩/evaluate 写 fetch/裸 HTTP/合成点击） |
| `atb/no-undeclared-entry-in-test` | 测试三分区入口模型：测试文件必须归入 testDir 下 bin/export/ui 分区（ui 按 uiTest 启用），分区外一律报——bin 分区驱动目标 ∈ package.json bin 声明块；export 分区 import ∈ exports/main 声明面；ui 分区驱动匹配 uiTest.startup（node 命令 = 入口文件 + 参数，入口文件 ∈ bin，自洽校验）；testDir 基建互驱/互导放行；非 *.test.* 基建文件不受分区约束；无 entry 手写清单与 exceptionFiles 豁免 |
| `atb/no-unmanaged-js` | 受管路径封闭集合：被枚举到的 JS 不在 managedPaths 内即报（fail-loud） |
| `atb/no-loose-dependency-specs` | package.json 版本政策：禁全部 dist-tag 浮动标签（registry 依赖须精确版本）；本地 file:/link: 来源不检——开发分支平级仓联调形态，main 分支合入前替换为正式版本属交付流程约束（看板需求承接） |
| `atb/no-silent-catch` | 空 catch/仅注释 catch 吞错（按需启用，存量须先语义迁移） |
| `atb/no-unused-runtime-dependencies-in-package` | 清单声明但从未导入的运行时依赖（dependencies/optionalDependencies 检；dev/peer 如实留白）；与死导出/文件私有死绑定同属死代码块区——package.json 面经工厂 packageJson.parser 传入即接入，包内全量 js 正则扫描收集裸导入包名 |
| `atb/no-unused-exports` | 导出但无消费方的死导出（按受众分类）：测试文件全检（测试文件不产出对外接口）；bin 直驱入口整放过（不走 import 加载器，死活不可判）；对外导入面文件（manifest main/exports/根配置）只检 i_（公开/t_ 受众可能在包外）；其余内部文件全检（npm scripts 直驱的脚本亦在此列——直驱脚本不该有导出）；f_ 导出移交 no-out-of-level-access。项目根自锚定 + AST 导出面 + 正则消费图（与依赖循环同口径）；touched（命名空间/副作用/动态字面量/export *）文件级保守豁免 |
| `atb/no-unused-file-private-codes` | 文件内零引用的 f_ 绑定（文件私有死代码）：f_ 契约即仅本文件可用，作用域引用计数判准，无需跨文件分析；顶层绑定与 f_ 分级同界，嵌套局部不查（core no-unused-vars 领域，经典脚本桥接形态不代其表态）；导出面移交 no-out-of-level-access |
| `atb/no-unused-imports` | 导入但未使用的绑定（死导入）：具名/默认/命名空间/别名全形态，作用域引用计数判准，报告带来源说明符；副作用导入（import 'x'）无绑定不检；CJS require 与普通变量留白（core no-unused-vars 领域） |
| `atb/no-wrong-exports-in-package` | package.json 入口面（bin/main/exports）不得指向测试文件（testDir）或构建工具目录（buildToolDir）文件——它们不产出对外接口，入口面必须指向生产代码；exports 通配模式以探测文件近似判定（模式能命中内部目录即报）；跑在 package.json 上（JSON parser 接线，与 no-unused-runtime-dependencies-in-package 同块） |

## 配置键（贯穿各规则）

- **scanPath**（依赖类规则）— 管辖路径：路径内文件受检，路径外不受检（由其所属仓库自查）。`no-wrong-access-level` 与 `no-out-of-level-access` 不设 scanPath：前者受检面由 ESLint files 决定；后者按受检文件向上查找最近 package.json 自锚定项目根（manifest、内外部判定与显示路径的基准），不落在任何包内的文件不受检。`no-undeclared-dependencies-imports` 同样不设 scanPath：自锚定所属包根读依赖清单与解析开发路径（testDir/buildToolDir 同名桥接、根配置内置识别），monorepo 各包按自身清单自查。
- **testDir**（no-wrong-access-level、no-out-of-level-access）— 测试目录：测试代码唯一居所，目录内文件即测试身份——前者据此要求导出面 `t_`，后者据此放行 `t_`、禁 `i_` 触达。不设多目录与 fixture 名单，所有测试代码集中在 testDir 下管理。仅支持相对仓库根的相对路径（缺省 `scripts/tests`，工厂原样透传），按 ESLint 运行目录解析——**前提约束：ESLint 运行目录必须在仓库根**（工厂与手动注册同此要求）。不支持绝对路径，传入即抛（fail-loud）：运行目录漂移（monorepo 子包、IDE 的 `eslint.workingDirectories`）属配置错误，直接暴露而非静默失效。
- **requireItemNumber**（no-bad-test-patterns）— 单号注释要求开关：默认关；使用看板单号的项目可在自己的配置中开启。
- **buildToolDir**（缺省不启用）— 构建工具目录：构建期/开发期辅助支撑代码的角色目录——依赖 devDependencies 的多为构建期工具，生产期用的工具不在其列；同名桥接进依赖三级链规则。开发路径代码 = 三源并集：`testDir` 测试代码（同名桥接）、`buildToolDir` 构建工具、根配置 `eslint.config.mjs`（规则内置识别，不经参数，未声明依赖照抓）；第三级判定（devDependencies）仅对开发路径代码放行。

## 接入示例

本包提供全部规则与公共配置工厂 `createConfig`（经 `atb-eslint-plugin/config.mjs` 导入）：工厂按「仓库布局契约」组合规则——root 下全部 js/mjs/cjs 受管，角色目录划分身份（测试 `testDir`、共享代码 `libDir`、依赖 `depsDir`，其余默认生产），全局忽略八层内置（依赖目录、点号隐藏目录、temp/tmp、coverage/output、\*.min.js、image、agent-team-board 数据目录）之上叠加调用方 ignores；布局事实全部有默认值，最佳模板形态只需传 root。工厂不携带任何项目专属依赖——`packageJson.parser` 依赖的 `eslint-plugin-package-json` 等由调用方自备依赖并声明。

```js
import packageJsonPlugin from 'eslint-plugin-package-json';
import { createConfig } from 'atb-eslint-plugin/config.mjs';

export default createConfig({
  root: import.meta.dirname,
  // 布局目录全部走默认（testDir='scripts/tests'、libDir='scripts/lib'、depsDir='node_modules'、
  // buildToolDir 缺省不启用、packageJsonPath='package.json'），自定义布局时逐项覆盖：
  // testDir: 'tests', libDir: 'src/lib', depsDir: 'vendor', buildToolDir: 'tools', packageJsonPath: 'package.json',
  entry: ['src/cli.mjs'],                // 业务入口清单（纯库项目留空设防）
  badTestExceptionFiles: [],             // 相对 root
  unmockedExceptionFiles: [],            // 相对测试根
  entryExceptionFiles: [],               // 相对测试根
  packageJson: {
    parser: packageJsonPlugin.configs.recommended.languageOptions.parser,
  },
});
```

不经工厂手动注册同样受支持：各项目在自己的 `eslint.config.mjs` 中注册插件，按源码、测试等文件范围组合规则与参数。规则选项中的路径（如 `no-wrong-access-level` 的 `testDir`）一律为相对仓库根的相对路径（相对 ESLint 运行目录解析），**前提约束：ESLint 运行目录必须在仓库根**——不支持绝对路径，传入即抛。

```js
import atbRules from 'atb-eslint-plugin';
export default [
  {
    files: ['**/*.mjs'],
    plugins: { atb: atbRules },
    rules: {
      'atb/no-out-of-level-access': 'error', // 项目根自锚定；测试目录缺省 scripts/tests，自定义传 { testDir }
      // …按需启用其余规则
    },
  },
];
```

单条规则具名导入：`import { outOfLevelAccess } from 'atb-eslint-plugin';`

访问边界只解释当前项目的接口。相对路径和包名自引用按项目实际路径归属，`node_modules`、项目外目标和越界软链不纳入前缀检查。第三方包的 `f_`/`i_` 名称当前项目不替它判断权限（由其所属项目自查）；`t_` 名称例外——测试专用接口不得在生产文件中引用或调用，来源是依赖包或 node: 也不例外（名字即声明，不读依赖源码）；依赖声明等其他规则仍正常执行。项目内的模块对象继续受检；普通函数返回值一律视为数据、不继承模块接口身份——级别随名字走：测试专用接口以 `t_` 命名，直接导入与模块对象访问即被拦，工厂返回值无须登记。模块对象的属性名可静态确定时检查权限，包括点访问、固定字符串和可解析常量键；属性名无法确定时只跳过当前成员的权限判断，不因未知属性报错。成员读取、调用和可选链采用相同原则，同一文件内其他可确认的越级访问仍正常报告。返回数据的正常数组下标不会被当成接口访问。

动态加载与越级访问分开判断。`import(url.href)`、`require(target)` 或加载器别名的目标无法静态确定时，规则停止追踪来源，不因目标未知报错；带 `mtime` 查询参数的配置 URL 无须例外登记。固定路径或可解析常量加载的本项目模块仍继续检查 `f_ / i_ / t_` 权限。是否禁止动态加载不属于本规则职责。

## 测试

`scripts/tests/` 内存世界驱动真实 ESLint 执行本包规则，覆盖项目范围、导出面分工、越级访问矩阵、依赖三级链、测试纪律、插件集成与装配纪律。`npm test`（pretest 先跑自检 lint——本包源码同样受规则管辖，即原 agent-team-board SC-LINT-ROLE-029 的检查器自检职责）。

## 依赖

运行时依赖 [litenvi-node](../litenvi-node) 的 `lite-fs`，文件读取走内存世界门面。公共配置工厂（config.mjs）只依赖本包与 Node 内置模块。`globals`、`eslint-plugin-playwright` 和 `eslint-plugin-package-json` 仅用于本包自检与集成测试，列为开发依赖；其他项目经工厂启用 package.json 分区或需要这些检查时，在各自项目中声明依赖并传入 parser。

## 静态边界（如实声明）

归因按 AST 绑定，不执行函数或推断任意返回数据类型；包名自引用读取本项目清单的静态 exports 映射，不执行依赖包源码。不分析计算属性拼接、eval 级混淆与跨函数运行时返回值；同文件直接传参可追踪接口来源，但不宣称完整控制流分析。`no-unmocked-litenvi-in-test` 不判调用顺序、只追两层 helper；字符串脚本按已知标记扫描，不宣称解析任意脚本语义。

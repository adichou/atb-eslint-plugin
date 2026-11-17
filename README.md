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
| `atb/no-import-cycles` | 按真实 AST 构建本包依赖图：相对路径、包名自引用、再导出和静态动态导入统一解析；字符串、注释与影子 require 不当作依赖；内容变更后缓存失效，成环报告完整链 |
| `atb/no-unmocked-litenvi-in-test` | 测试直接使用需开关的 litenvi 门面时，helper 链内必须有 t_mock/t_install 装配与 t_unmock 复位 |
| `atb/no-bad-test-patterns` | 按真实 API 来源检查执行完整性、有效断言、非空名称与诊断、Promise 归属、吞错、裸睡眠和已确认页面操作；只要求紧邻非空说明，模板与编号交由评审；无 scanPath、文件例外或断言名称白名单 |
| `atb/no-undeclared-entry-in-test` | 按每个测试文件检查必需入口：bin 必须调用 package.json bin 或 hooksDir 的 hook JSON 声明的命令文件；export 必须导入 exports/main 声明的文件；config 仅允许实际读取已登记配置并对读取结果断言关键字段；ui 必须执行 uiTest.startup 并通过浏览器导航到 http://127.0.0.1:{port}/{index}（index 默认 /，端口可动态）。追踪实际调用的本地 helper，统一相对路径与包自引用的模块来源。export 允许本包公开子进程 API 自测；原生对照或隔离进程经 exceptionFilesAllowModules 的模块例外授权（node:child_process）；启动本包 bin 始终按命令分区处理。 |
| `atb/no-modules-import-in-test` | 测试代码环境模块导入黑名单：testDir 内禁止导入 deniedModules 中的模块（内存世界纪律的导入面闭环——no-unmocked-litenvi-in-test 管走了门面的装配，本规则拦绕过门面的直接导入）；归一化匹配（fs ≡ node:fs 双向）与子路径连带（node:fs 拦 node:fs/promises、lodash 拦 lodash/fp），静态 import、export-from、静态可解动态 import 与 require 同口径；文件例外经 exceptionFilesAllowModules 独立参数按文件登记（与黑名单极性不混叠） |
| `atb/no-test-boundary-violations` | 黑盒与模块边界：禁止替换本项目业务函数、导入其他测试文件、生产依赖测试目录、共享库反向导入声明入口、加载时写盘、篡改公共活账本；检查命令钩子复位和进程状态恢复登记，无文件例外。 |
| `atb/no-missing-config-tests` | 关键配置文件必须有「真实读取 + 关键字段断言」的守护测试：锚定根配置 eslint.config.mjs（家族内置常量，无需 JSON parser），守护对象为根配置（关键字段 rules/plugins）、packageJsonPath 清单（缺省 package.json，关键字段 name/exports）及 hooksDir 下发现的 JSON（关键字段 hooks），不设自由守护清单入参；守护测试按约定命名（配置名去扩展名 + .test.mjs，如 package.json → package.test.mjs、manifest.json → manifest.test.mjs）在 testDir 树内递归定位，且须静态可解地真实读取仓库根该配置（import 说明符或 new URL(字面量, import.meta.url)、path.join(字面量…) 构造；支持常量绑定追踪）并有断言关键字段的 node:assert 调用（绑定归因，实际比较值来自对应配置，验证关键字段）；清单条目在仓库中不存在时不设该条要求 |
| `atb/no-unmanaged-js` | 受管路径封闭集合：被枚举到的 JS 不在 managedPaths 内即报（fail-loud） |
| `atb/no-loose-dependency-specs` | package.json 版本政策：禁全部 dist-tag 浮动标签（registry 依赖须精确版本）；本地 file:/link: 来源不检——开发分支平级仓联调形态，main 分支合入前替换为正式版本属交付流程约束（看板需求承接） |
| `atb/no-silent-catch` | 空 catch/仅注释 catch 吞错（按需启用，存量须先语义迁移） |
| `atb/no-unused-runtime-dependencies-in-package` | 清单声明但从未导入的运行时依赖（dependencies/optionalDependencies 检；dev/peer 如实留白）；与死导出/文件私有死绑定同属死代码块区——package.json 面经工厂 packageJson.parser 传入即接入，包内全量 js 正则扫描收集裸导入包名 |
| `atb/no-unused-exports` | 导出但无消费方的死导出（按受众分类）：测试文件全检（测试文件不产出对外接口）；bin 直驱入口整放过（不走 import 加载器，死活不可判）；对外导入面文件（manifest main/exports/根配置）只检 i_（公开/t_ 受众可能在包外）；其余内部文件全检（npm scripts 直驱的脚本亦在此列——直驱脚本不该有导出）；f_ 导出移交 no-out-of-level-access。项目根自锚定 + AST 导出面 + 正则消费图（与依赖循环同口径）；touched（命名空间/副作用/动态字面量/export *）文件级保守豁免 |
| `atb/no-unused-file-private-codes` | 文件内零引用的 f_ 绑定（文件私有死代码）：f_ 契约即仅本文件可用，作用域引用计数判准，无需跨文件分析；顶层绑定与 f_ 分级同界，嵌套局部不查（core no-unused-vars 领域，经典脚本桥接形态不代其表态）；导出面移交 no-out-of-level-access |
| `atb/no-unused-imports` | 导入但未使用的绑定（死导入）：具名/默认/命名空间/别名全形态，作用域引用计数判准，报告带来源说明符；副作用导入（import 'x'）无绑定不检；CJS require 与普通变量留白（core no-unused-vars 领域） |
| `atb/no-wrong-exports-in-package` | package.json 入口面（bin/main/exports）不得指向测试文件（testDir）或构建工具目录（buildToolDir）文件——它们不产出对外接口，入口面必须指向生产代码；exports 通配模式以探测文件近似判定（模式能命中内部目录即报）；跑在 package.json 上（JSON parser 接线，与 no-unused-runtime-dependencies-in-package 同块） |

## 配置键（贯穿各规则）

- **scanPath**（依赖类规则）— 管辖路径：路径内文件受检，路径外不受检（由其所属仓库自查）。`no-wrong-access-level`、`no-unmocked-litenvi-in-test` 与 `no-out-of-level-access` 不设 scanPath：前两者受检面由 ESLint files 决定；后者按受检文件向上查找最近 package.json 自锚定项目根（manifest、内外部判定与显示路径的基准），不落在任何包内的文件不受检。`no-undeclared-dependencies-imports` 同样不设 scanPath：自锚定所属包根读依赖清单与解析开发路径（testDir/buildToolDir 同名桥接、根配置内置识别），monorepo 各包按自身清单自查。
- **testDir**（no-wrong-access-level、no-out-of-level-access）— 测试目录：测试代码唯一居所，目录内文件即测试身份——前者据此要求导出面 `t_`，后者据此放行 `t_`、禁 `i_` 触达。不设多目录与 fixture 名单，所有测试代码集中在 testDir 下管理。仅支持相对仓库根的相对路径（缺省 `scripts/tests`，工厂原样透传），按 ESLint 运行目录解析——**前提约束：ESLint 运行目录必须在仓库根**（工厂与手动注册同此要求）。不支持绝对路径，传入即抛（fail-loud）：运行目录漂移（monorepo 子包、IDE 的 `eslint.workingDirectories`）属配置错误，直接暴露而非静默失效。
- **requireItemNumber**（no-bad-test-patterns）— 单号注释要求开关：默认关；使用看板单号的项目可在自己的配置中开启。
- **deniedModules**（no-modules-import-in-test）— 测试环境模块黑名单：testDir 内禁止导入的模块清单，传入即整组覆盖。工厂缺省环境组 `node:fs` / `node:http` / `node:https` / `node:child_process` / `node:process`（环境组属生态通用纪律而非项目专属事实）。匹配按双向归一化（裸内置名 `fs` 与 `node:fs` 是同一模块）+ 子路径连带（黑名单条目命中说明符自身或其祖先段：`node:fs` 拦 `node:fs/promises`，`lodash` 拦 `lodash/fp`；黑名单写子路径只拦子路径自身）。
- **exceptionFilesAllowModules**（缺省 []，相对 testDir）— 测试原生模块文件例外登记 `[{ file, modules, reason }]`：确需真实 IO 的存量测试（如驱动真实 ESLint 的磁盘 fixture）按文件登记窄豁免——`file` 是精确文件（禁止越界与 glob），仅放行所列模块及子路径，理由必填；例外只豁免登记文件自身，不掩盖同目录其他文件的违规。与黑名单是两个独立参数（极性不混叠）：本参数只做「按文件放行」。
- **packageJsonPath**（缺省 `'package.json'`，相对包根）— 清单文件路径：package.json 面规则的文件目标，也是配置测试守护（no-missing-config-tests）的守护对象之一——基础守护对象为固定双配置（根配置 `eslint.config.mjs` 内置常量 + packageJsonPath 清单），另追加 hooksDir 下发现的 JSON，不设守护清单入参。守护测试按约定命名（配置名去扩展名 + `.test.mjs`）在 testDir 树内递归定位，须静态可解地真实读取该配置（import 说明符 / `new URL(字面量, import.meta.url)` / `path.join(字面量…)`，支持常量绑定追踪）并断言关键字段（node:assert 绑定归因，实际比较值来自对应配置，验证关键字段：清单 → name/exports、根配置 → rules/plugins）。
- **hooksDir**（缺省 `''`，关闭；相对 root）— AI Agent hook JSON 目录，递归提取 process 型 `command/args` 与 command 型命令字符串中的本地脚本，作为 bin 分区入口；每份 JSON 自动加入配置守护。目录与脚本必须在项目内，无法解析的变量、损坏配置、缺失脚本与 shell 复合命令明确报错，不执行命令。
- **buildToolDir**（缺省不启用）— 构建工具目录：构建期/开发期辅助支撑代码的角色目录——依赖 devDependencies 的多为构建期工具，生产期用的工具不在其列；同名桥接进依赖三级链规则。开发路径代码 = 三源并集：`testDir` 测试代码（同名桥接）、`buildToolDir` 构建工具、根配置 `eslint.config.mjs`（规则内置识别，不经参数，未声明依赖照抓）；第三级判定（devDependencies）仅对开发路径代码放行。

## 接入示例

本包提供全部规则与公共配置工厂 `createConfig`（经 `atb-eslint-plugin/config.mjs` 导入）：工厂按「仓库布局契约」组合规则——root 下全部 js/mjs/cjs 受管，角色目录划分身份（测试 `testDir`、共享代码 `libDir`、依赖 `depsDir`，其余默认生产），全局忽略八层内置（依赖目录、点号隐藏目录、temp/tmp、coverage/output、\*.min.js、image、agent-team-board 数据目录）不接受调用方追加；布局事实全部有默认值，最佳模板形态只需传 root。工厂不携带任何项目专属依赖——`packageJson.parser` 依赖的 `eslint-plugin-package-json` 等由调用方自备依赖并声明。

```js
import packageJsonPlugin from 'eslint-plugin-package-json';
import { createConfig } from 'atb-eslint-plugin/config.mjs';

export default createConfig({
  root: import.meta.dirname,
  // 布局目录全部走默认（testDir='scripts/tests'、libDir='scripts/lib'、depsDir='node_modules'、
  // buildToolDir 缺省不启用、packageJsonPath='package.json'），自定义布局时逐项覆盖：
  // testDir: 'tests', libDir: 'src/lib', depsDir: 'vendor', buildToolDir: 'tools', packageJsonPath: 'package.json',
  hooksDir: '',                        // Agent 插件可填写 'hooks'，自动发现 hook 命令与 JSON 配置
  uiTest: null,                         // 有页面测试时填写 { startup: 'src/cli.mjs serve', index: '/' }
  deniedModules: ['node:fs', 'node:http', 'node:https', 'node:child_process', 'node:process'],  // 测试环境模块黑名单（缺省环境组，传入整组覆盖）
  exceptionFilesAllowModules: [],       // 文件例外 [{ file, modules, reason }]，相对测试根（testDir）——只做按文件放行
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

`scripts/tests/` 中的规则行为测试通过真实 `RuleTester` 或 `Linter.verify()` 执行本包规则；需要项目文件时，使用 `lite-fs` 内存夹具，每例独立路径并在结束时复位。被测规则与 JSON parser 均保持真实实现。`config.test.mjs` 保留真实 ESLint 类，通过 `overrideConfigFile: true` 和 `overrideConfig` 注入实际工厂产物，验证忽略路径、规则接线与内存项目清单。本仓测试无需原生环境模块的导入黑名单例外。

用例覆盖项目范围、导出面分工、越级访问矩阵、依赖三级链、测试纪律、插件集成与装配纪律。`npm test` 的 pretest 先跑自检 lint，本包源码同样受规则管辖。

### export 中如何判断子进程调用

先看启动目标：启动当前包 `bin` 声明的文件或命令名，属于命令业务，放入 `bin/` 或 `ui/`。本包公开子进程 API 的自测可以留在 `export/`，例如 litenvi-node 调用自己导出的 `spawn()` 验证返回值、输出和退出事件。模块身份按所属包清单与真实文件核对，相对路径、包自引用和具名别名采用相同口径；其他项目导入 litenvi-node 时不能借用它的 API 自测身份。

原生 `node:child_process`（含裸名 `child_process`）用于对照或隔离时，经测试环境模块黑名单的例外登记授权：`exceptionFilesAllowModules: [{ file: 'export/native-reference.test.mjs', modules: ['node:child_process'], reason: '对照原生信号和退出行为' }]`。file 是相对 `testDir` 的精确文件（禁止越界与 glob），仅放行所列模块及子路径，理由必填。登记文件仍须导入本包公开入口，面外导入和启动本包 bin 仍报告；第三方子进程门面不因该登记放行。

这些是静态分类约定，不能证明每条断言是否有效，也不会执行 `node -e` 等字符串载荷来推断其中的业务。

### config 分区

纯配置守护放在 `scripts/tests/config/`，使用约定名称 `package.test.mjs`、`eslint.config.test.mjs` 等。配置范围来自 packageJsonPath、根 ESLint 配置和 hooksDir JSON；只有实际 import 或已绑定 fs API 读取配置，并用 node:assert 对其读取结果验证关键字段时才通过。无需添加无关命令或包导入。入口规则与配置守护共用同一证据分析，拒绝仅提及路径、同名假读取对象、局部假配置、未调用函数或只在说明文本中出现的字段。静态检查不执行测试，也不证明所有断言和业务分支的覆盖完整性。

### Agent hook 的入口与配置守护

在工厂或两条规则的选项中设置 `hooksDir: 'hooks'`。目录内的 `hooks.json`、`codex.json` 等 JSON 会分别要求 `hooks.test.mjs`、`codex.test.mjs`：真实读取对应配置，并在 `node:assert` 断言中验证 `hooks` 字段。它们声明的命令脚本归入 bin 测试入口，不需要额外发布成 npm bin。只读取配置或创建未调用的宿主 helper，不能代替实际命令调用。

支持引号、Node 常用启动选项、直接脚本以及简单的 bash/sh/zsh/python/python3 脚本命令。`$PLUGIN_ROOT`、`${PLUGIN_ROOT}` 及 ZCODE/CLAUDE/CODEX 前缀形式按项目根解析。只认可项目内的文件；第三方裸命令不成为本包入口，内联脚本与 shell 复合语句不作为 hook 文件声明。临时脚本副本须有可追踪的 `copyFileSync` 来源，不按同名文件猜测身份。

## 依赖

运行时依赖 [litenvi-node](../litenvi-node) 的 `lite-fs`，文件读取走内存世界门面。公共配置工厂（config.mjs）只依赖本包与 Node 内置模块。`globals`、`eslint-plugin-playwright` 和 `eslint-plugin-package-json` 仅用于本包自检与集成测试，列为开发依赖；其他项目经工厂启用 package.json 分区或需要这些检查时，在各自项目中声明依赖并传入 parser。

## 静态边界（如实声明）

归因按 AST 绑定，不执行函数或推断任意返回数据类型；包名自引用读取本项目清单的静态 exports 映射，不执行依赖包源码。不分析计算属性拼接、eval 级混淆与跨函数运行时返回值；同文件直接传参可追踪接口来源，但不宣称完整控制流分析。`no-unmocked-litenvi-in-test` 不判调用顺序、只追两层 helper；字符串脚本按已知标记扫描，不宣称解析任意脚本语义。


### 默认测试质量与黑盒边界

`createConfig` 默认以 error 启用 `no-bad-test-patterns` 和 `no-test-boundary-violations`，范围由 flat config 的 files 与已声明的 testDir/libDir 决定。质量规则不接受 scanPath、任何 exceptionFiles 或 assertionHelperNames；旧参数直接由 schema 拒绝。测试说明要求紧邻且非空，场景、输入、预期的内容与编号由 skill 和评审核对。具名和别名导入采用真实作用域，套件与 hook 不被误当作独立测试。

异步异常断言、本地 async 操作及已识别的异步页面断言必须等待、直接返回或保留后消费。外层 await 不能替另一个函数里的操作等待；未调用函数、恒假分支、return 后代码及单独 expect() 不能充当有效断言。调用本地 helper 明确执行的回调可计入，不能按函数名称登记“可信断言”。

页面 API 只有来源可确认时才检查 route、force、固定等待和合成点击；普通同名对象不当作浏览器。动态对象与跨模块回调未能归因时不猜测。原生 HTTP 直调是否符合业务入口还需结合分区和环境模块规则。裸定时 Promise 不能用来猜测业务完成；有实际操作参与的超时竞赛、超时保护及手动推进的时钟属于不同契约，不按裸睡眠处理。

架构规则检查明确的写入与清理位置：业务函数替换与可写环境数据区分，公共活请求账本与可修改的独立调用快照区分。持续存在的命令钩子需要 finally、node:test after 或实际返回的清理函数复位；进程状态先保存原值再恢复。它证明能够静态确认的登记，不证明所有运行时分支都释放资源。没有声明的业务层级、任意对象的可写性和动态调用，仍需设计与评审；不能凭目录片段或方法名补造架构约束。

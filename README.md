# atb-eslint-plugin

ATB 访问级别与测试边界 ESLint 规则集。解决两个问题：**代码里的接口谁能用**（f_/i_/t_ 前缀级别体系）与**测试怎么写才算测了真东西**（依赖来源、装配纪律、交互真实性）。

适用任何采用该前缀体系的项目（当前：agent-team-board、litenvi-node）。ESLint 9 flat config，Node ≥ 22.12。

本文的「内部库」指 `libDir` 指定的项目内代码目录，默认 `scripts/lib`；第三方依赖由 `depsDir` 指定，默认 `node_modules`。

## 级别体系

| 前缀 | 级别 | 谁能用 |
| --- | --- | --- |
| 无前缀 | 公开 | 任何调用方 |
| `i_` | 包内同侧协作 | 生产代码之间、测试代码之间分别允许；两侧互访及跨包访问禁止 |
| `t_` | 测试专用 | 仅测试代码路径内的文件（生产引用即报） |
| `f_` | 文件私有 | 仅定义文件内（跨文件一律报） |

测试代码使用三层接口：文件私有实现用 `f_`，本项目测试文件间协作用 `i_`，对外提供的测试接口用 `t_` 并登记在包导入入口。生产代码不能使用测试侧的 `i_`，测试代码也不能使用生产侧的 `i_`；跨包 `i_` 禁止，不能通过别名、解构或再导出绕过。仅本文件使用的函数仍应取消导出并使用 `f_`。第三方 lite 门面的 `t_mock`、`t_unmock` 等真实对外测试 API 保留原名。

`main/exports` 可以精确登记测试辅助模块；可执行 `.test.*` 文件、指向测试目录的 bin 命令及可能暴露测试用例的宽泛模式仍禁止。对外导入面上的 `t_` 允许包外测试消费，不要求仓内调用；该文件中的 `i_` 仍须有本包消费者。定义处的级别注释有标注时必须与接口级别一致。无前缀数据键随句柄，测试内部句柄可提供 `i_` 契约键，对外 `t_` 句柄不能返回 `i_` 成员。


## 规则一览

内部库依赖统一由 `atb/no-business-imports-in-lib` 检查，全局 `no-restricted-syntax` 只禁止通配符导入。内部库不再全面禁止动态 `import()`：目标明确且属于允许范围时可以使用。

| 规则 | 管什么 |
| --- | --- |
| `atb/no-business-imports-in-lib` | 内部库的静态导入、再导出、动态导入与已识别的 require 共用实际目标检查；允许库内模块、Node 内置与声明的运行/可选/peer 依赖，库外本地目标、未声明依赖及未知目标明确报告；软链接、包自引用、标准条件导出与 imports 别名按实际身份处理 |
| `atb/no-out-of-level-access` | 先禁止跨包文件路径引用和生产文件加载测试目录/可执行测试，再检查 f_ 跨文件、i_ 跨包与生产/测试跨侧访问、t_ 生产消费；跨包必须通过包名与 Node 入口加载，软链接按真实包归属判断。保留模块对象来源，普通返回值不传播接口身份；未知动态目标沿静态边界停止归因 |
| `atb/no-wrong-access-level` | 非导出方法必须 f_；非导出绑定不得用 i_/t_ 前缀；测试内部导出用 i_、对外测试导出用 t_ 并登记入口；公开导出（含 default、类、解构、再导出与 CommonJS）必须位于 main/exports 声明入口，根 eslint.config.mjs 保留内置宿主入口身份，内部文件导出面用 i_；函数返回对象树中显式前缀键的级别须与函数同级或为 f_（无前缀键随句柄不核级）；注释对账：方法紧邻注释的级别标注（私有/内部/测试专用/外部）须与前缀及导出情况一致（缺失不报，原 no-wrong-access-comment 并入） |
| `atb/no-undeclared-dependencies-imports` | 未声明依赖三级判定链：dependencies(含 optional)→peerDependencies→开发路径文件（testDir、buildToolDir、根配置 eslint.config.mjs 三源并集）+devDependencies；本包自引用（specifier 包名 = 本包名）放行；不设 ignores，不支持忽略 |
| `atb/no-import-cycles` | 按真实 AST 构建本包依赖图：相对路径、包名自引用、再导出和静态动态导入统一解析；字符串、注释与影子 require 不当作依赖；内容变更后缓存失效，成环报告完整链 |
| `atb/no-unmocked-litenvi-in-test` | 测试直接使用需开关的 litenvi 门面时，helper 链内必须有 t_mock/t_install 装配与 t_unmock 复位 |
| `atb/no-skip-test-exectution` | 禁止 only/skip/todo、测试选项和 TestContext 跳过操作缩减执行 |
| `atb/no-invalid-test-definition` | 检查非空标题、内联具名且可唯一引用的回调、测试选项和 done/async 完成机制 |
| `atb/no-missing-test-comment` | 要求紧邻非空注释，可选要求 REQ-/BUG- 单号；详细内容和编号格式交由评审 |
| `atb/no-invalid-test-assertions` | 检查实际断言、非空诊断消息、明显恒真断言和异常匹配条件 |
| `atb/no-unawaited-test-operations` | 检查异步异常断言、子测试、本地 async 操作及页面/轮询断言的 Promise 消费关系 |
| `atb/no-fixed-sleep-in-test` | 禁止页面固定等待及裸定时 Promise；保留明确的超时竞赛和可控时钟 |
| `atb/no-uncleanup-injection-in-test` | 持续故障注入不能丢弃移除句柄；once 注入按契约消费，不证明已执行清理 |
| `atb/no-fake-page-interactions-in-test` | 禁止响应桩、写请求替代用户操作、force 强制操作和合成 click；按真实页面来源识别 |
| `atb/no-undeclared-entry-in-test` | 按每个测试文件检查必需入口：bin 必须调用 package.json bin 或 hooksDir 的 hook JSON 声明的命令文件；export 必须导入 exports/main 声明的文件；config 仅允许实际读取已登记配置并对读取结果断言关键字段；ui 必须执行 uiTest.startup 并通过浏览器导航到 http://127.0.0.1:{port}/{index}（index 默认 /，端口可动态）。追踪实际调用的本地 helper，统一相对路径与包自引用的模块来源。export 允许本包公开子进程 API 自测；原生对照仅允许 litenvi-node 内置的 native-reference.test.mjs；启动本包 bin 始终按命令分区处理。 |
| `atb/no-blacklist-module-imports` | 统一检查生产、测试与工具代码的原生文件、网络、进程、OS、定时器等模块加载；裸名与 node 前缀、子路径、再导出、常量动态 import、require/createRequire 别名及 getBuiltinModule 共用来源检查。仅内置 litenvi-node 必需的精确文件和模块权限，不开放项目例外配置 |
| `atb/no-business-replacement-in-test` | 禁止测试通过 mock、赋值或 Object 写入替换本项目业务方法；环境装配数据可写 |
| `atb/no-test-case-imports-in-test` | 禁止测试导入或再导出其他 .test.js/.mjs/.cjs 文件；普通 helper 可复用 |
| `atb/no-observation-data-write-in-test` | 禁止修改登记观察接口的返回数据，含副本、别名及共享引用；独立新数据可写 |
| `atb/no-unreset-onRun-hooks-in-test` | 命令 t_onRun 钩子必须有同一命令的清理复位登记 |
| `atb/no-unrestored-process-state-in-test` | 测试修改 process.env/argv/exitCode 后须登记原值恢复 |
| `atb/no-missing-config-tests` | 关键配置文件必须有「真实读取 + 关键字段断言」的守护测试：锚定根配置 eslint.config.mjs（家族内置常量，无需 JSON parser），守护对象为根配置（关键字段 rules/plugins）、packageJsonPath 清单（缺省 package.json，关键字段 name/exports）及 hooksDir 下发现的 JSON（关键字段 hooks），不设自由守护清单入参；守护测试按约定命名（配置名去扩展名 + .test.mjs，如 package.json → package.test.mjs、manifest.json → manifest.test.mjs）在 testDir 树内递归定位，且须静态可解地真实读取仓库根该配置（import 说明符或 new URL(字面量, import.meta.url)、path.join(字面量…) 构造；支持常量绑定追踪）并有断言关键字段的 node:assert 调用（绑定归因，实际比较值来自对应配置，验证关键字段）；清单条目在仓库中不存在时不设该条要求 |
| `atb/no-unmanaged-js` | 受管路径封闭集合：被枚举到的 JS 不在 managedPaths 内即报（fail-loud） |
| `atb/no-loose-dependency-specs` | package.json 版本政策：禁全部 dist-tag 浮动标签（registry 依赖须精确版本）；本地 file:/link: 来源不检——开发分支平级仓联调形态，main 分支合入前替换为正式版本属交付流程约束（看板需求承接） |
| `atb/no-silent-catch` | 默认对生产、工具和测试启用：空或仅注释 catch 块，以及可确认 Promise 的空拒绝回调均报告；普通同名 catch 方法和未知返回值不猜测，无自动修复 |
| `atb/no-unused-runtime-dependencies-in-package` | 清单声明但从未导入的运行时依赖（dependencies/optionalDependencies 检；dev/peer 如实留白）；与死导出/文件私有死绑定同属死代码块区——package.json 面由工厂内置 parser 并默认接入，包内全量 js 正则扫描收集裸导入包名 |
| `atb/no-unused-exports` | 导出但无消费方的死导出（按受众分类）：内部测试 helper 全检（显式声明对外 t_ 的入口按导入面检查）；bin 直驱入口整放过（不走 import 加载器，死活不可判）；对外导入面文件（manifest main/exports/根配置）只检 i_（公开/t_ 受众可能在包外）；其余内部文件全检（npm scripts 直驱的脚本亦在此列——直驱脚本不该有导出）；f_ 导出移交 no-out-of-level-access。项目根自锚定 + AST 导出面 + 正则消费图（与依赖循环同口径）；touched（命名空间/副作用/动态字面量/export *）文件级保守豁免 |
| `atb/no-unused-file-private-codes` | 文件内零引用的 f_ 绑定（文件私有死代码）：f_ 契约即仅本文件可用，作用域引用计数判准，无需跨文件分析；顶层绑定与 f_ 分级同界，嵌套局部不查（core no-unused-vars 领域，经典脚本桥接形态不代其表态）；导出面移交 no-out-of-level-access |
| `atb/no-unused-imports` | 导入但未使用的绑定（死导入）：具名/默认/命名空间/别名全形态，作用域引用计数判准，报告带来源说明符；副作用导入（import 'x'）无绑定不检；CJS require 与普通变量留白（core no-unused-vars 领域） |
| `atb/no-wrong-exports-in-package` | 禁止入口面暴露可执行测试和构建工具，测试目录的 bin 仍禁止；main/exports 可以精确登记测试辅助模块，公开接口级别由定义规则继续检查，宽泛测试目录模式拒绝；跑在 package.json 上（JSON parser 接线，与 no-unused-runtime-dependencies-in-package 同块） |

## 配置键（贯穿各规则）

- **scanPath**（依赖类规则）— 管辖路径：路径内文件受检，路径外不受检（由其所属仓库自查）。`no-wrong-access-level`、`no-unmocked-litenvi-in-test` 与 `no-out-of-level-access` 不设 scanPath：前两者受检面由 ESLint files 决定；后者按受检文件向上查找最近 package.json 自锚定项目根（manifest、内外部判定与显示路径的基准），不落在任何包内的文件不受检。`no-undeclared-dependencies-imports` 同样不设 scanPath：自锚定所属包根读依赖清单与解析开发路径（testDir/buildToolDir 同名桥接、根配置内置识别），monorepo 各包按自身清单自查。
- **testDir**（no-wrong-access-level、no-out-of-level-access）— 测试目录：测试代码唯一居所，目录内文件即测试身份——前者据此要求导出面 `t_`，后者据此放行 `t_`、禁 `i_` 触达。不设多目录与 fixture 名单，所有测试代码集中在 testDir 下管理。仅支持相对仓库根的相对路径（缺省 `scripts/tests`，工厂原样透传），按 ESLint 运行目录解析——**前提约束：ESLint 运行目录必须在仓库根**（工厂与手动注册同此要求）。不支持绝对路径，传入即抛（fail-loud）：运行目录漂移（monorepo 子包、IDE 的 `eslint.workingDirectories`）属配置错误，直接暴露而非静默失效。
- **requireItemNumber**（no-missing-test-comment）— 单号注释要求开关：默认关；使用看板单号的项目可在自己的配置中开启。
- **deniedModules** — 统一规则在固定原生环境组上追加的模块黑名单，支持普通包名和子路径。传空数组不能关闭固定环境约束。
- **packageJsonPath**（缺省 `'package.json'`，相对包根）— 清单文件路径：package.json 面规则的文件目标，也是配置测试守护（no-missing-config-tests）的守护对象之一——基础守护对象为固定双配置（根配置 `eslint.config.mjs` 内置常量 + packageJsonPath 清单），另追加 hooksDir 下发现的 JSON，不设守护清单入参。守护测试按约定命名（配置名去扩展名 + `.test.mjs`）在 testDir 树内递归定位，须静态可解地真实读取该配置（import 说明符 / `new URL(字面量, import.meta.url)` / `path.join(字面量…)`，支持常量绑定追踪）并断言关键字段（node:assert 绑定归因，实际比较值来自对应配置，验证关键字段：清单 → name/exports、根配置 → rules/plugins）。
- **hooksDir**（缺省 `''`，关闭；相对 root）— AI Agent hook JSON 目录，递归提取 process 型 `command/args` 与 command 型命令字符串中的本地脚本，作为 bin 分区入口；每份 JSON 自动加入配置守护。目录与脚本必须在项目内，无法解析的变量、损坏配置、缺失脚本与 shell 复合命令明确报错，不执行命令。
- **uiTest**（缺省 `null`，关闭）— UI 测试启动与首页约定；启用时传入 `{ startup, index?, enabled? }`，`enabled: false` 也表示关闭。工厂将 `hooksDir`、`uiTest` 等参数直接传给相应规则，默认空值继续表示关闭。
- **buildToolDir**（缺省不启用）— 构建工具目录：构建期/开发期辅助支撑代码的角色目录——依赖 devDependencies 的多为构建期工具，生产期用的工具不在其列；同名桥接进依赖三级链规则。开发路径代码 = 三源并集：`testDir` 测试代码（同名桥接）、`buildToolDir` 构建工具、根配置 `eslint.config.mjs`（规则内置识别，不经参数，未声明依赖照抓）；第三级判定（devDependencies）仅对开发路径代码放行。

## 接入示例

本包提供全部规则与公共配置工厂 `createConfig`（经 `atb-eslint-plugin/config.mjs` 导入）：工厂按「仓库布局契约」组合规则——项目内全部 js/mjs/cjs 受管，角色目录划分身份（测试 `testDir`、内部库 `libDir`、依赖 `depsDir`，其余默认生产），全局忽略八层内置（依赖目录、点号隐藏目录、temp/tmp、coverage/output、\*.min.js、image、agent-team-board 数据目录）不接受调用方追加；布局事实全部有默认值，最佳模板形态无需传入 root。工厂通过运行时依赖 `eslint-plugin-package-json` 固定提供 JSON parser，并默认启用三条清单规则；不继承第三方 recommended 规则，也不再接收 packageJson 入参。

```js
import { createConfig } from 'atb-eslint-plugin/config.mjs';

export default createConfig({
  // 布局目录全部走默认（testDir='scripts/tests'、libDir='scripts/lib'、depsDir='node_modules'、
  // buildToolDir 缺省不启用、packageJsonPath='package.json'），自定义布局时逐项覆盖：
  // testDir: 'tests', libDir: 'src/lib', depsDir: 'vendor', buildToolDir: 'tools', packageJsonPath: 'package.json',
  hooksDir: '',                        // Agent 插件可填写 'hooks'，自动发现 hook 命令与 JSON 配置
  uiTest: null,                         // 有页面测试时填写 { startup: 'src/cli.mjs serve', index: '/' }
  deniedModules: [],                    // 可追加禁止模块；固定原生环境组不受此数组清空影响
});
```

配置工厂不接收 `root` 参数；各规则沿既有实现使用 ESLint 的 `context.cwd`，或从受检文件向上查找最近的 `package.json`。删除参数不改变路径解析，使用依赖 cwd 的规则时仍须在项目根启动 ESLint，API 测试则显式设置 ESLint 实例的 cwd。

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

原生 `node:child_process`（含裸名）仅在具有 litenvi-node 包身份及公开入口结构的 `scripts/tests/export/native-reference.test.mjs` 内用于对照。普通项目采用同名文件不获权限，其他 litenvi 测试也不获原生进程权限；该文件仍须导入本包公开入口，本包 bin 启动和面外导入仍报告。

这些是静态分类约定，不能证明每条断言是否有效，也不会执行 `node -e` 等字符串载荷来推断其中的业务。

### config 分区

纯配置守护放在 `scripts/tests/config/`，使用约定名称 `package.test.mjs`、`eslint.config.test.mjs` 等。配置范围来自 packageJsonPath、根 ESLint 配置和 hooksDir JSON；只有实际 import 或已绑定 fs API 读取配置，并用 node:assert 对其读取结果验证关键字段时才通过。无需添加无关命令或包导入。入口规则与配置守护共用同一证据分析，拒绝仅提及路径、同名假读取对象、局部假配置、未调用函数或只在说明文本中出现的字段。静态检查不执行测试，也不证明所有断言和业务分支的覆盖完整性。

### Agent hook 的入口与配置守护

在工厂或两条规则的选项中设置 `hooksDir: 'hooks'`。目录内的 `hooks.json`、`codex.json` 等 JSON 会分别要求 `hooks.test.mjs`、`codex.test.mjs`：真实读取对应配置，并在 `node:assert` 断言中验证 `hooks` 字段。它们声明的命令脚本归入 bin 测试入口，不需要额外发布成 npm bin。只读取配置或创建未调用的宿主 helper，不能代替实际命令调用。

支持引号、Node 常用启动选项、直接脚本以及简单的 bash/sh/zsh/python/python3 脚本命令。`$PLUGIN_ROOT`、`${PLUGIN_ROOT}` 及 ZCODE/CLAUDE/CODEX 前缀形式按项目根解析。只认可项目内的文件；第三方裸命令不成为本包入口，内联脚本与 shell 复合语句不作为 hook 文件声明。临时脚本副本须有可追踪的 `copyFileSync` 来源，不按同名文件猜测身份。

## 依赖

运行时依赖 [litenvi-node](../litenvi-node) 的 `lite-fs`，文件读取走内存世界门面。公共配置工厂（config.mjs）通过运行时依赖 `eslint-plugin-package-json` 提供 JSON parser，消费项目无需直接声明或传入它。`globals` 与 `eslint-plugin-playwright` 用于本包自检和测试，仍为开发依赖。

本地使用 file: 软链接联调时，应在 atb-eslint-plugin 仓库安装其自身依赖；消费项目不再直接安装或传入 JSON parser。

## 静态边界（如实声明）

归因按 AST 绑定，不执行函数或推断任意返回数据类型；包名自引用读取本项目清单的静态 exports 映射，不执行依赖包源码。不分析 eval 级混淆与任意跨模块运行时返回值；同文件直接传参可追踪接口来源，观察只读检查还分析可确认的本地 helper 返回和闭包，但不宣称完整控制流分析。`no-unmocked-litenvi-in-test` 不判调用顺序、只追两层 helper；字符串脚本按已知标记扫描，不宣称解析任意脚本语义。


### 默认测试质量与黑盒边界

`createConfig` 将测试检查按定义与可读性、断言与等待、隔离与真实交互、清理登记分类，默认以 error 启用表中的 13 条独立规则，范围由 flat config 的 files 与 testDir 决定。原 no-bad-patterns-in-test 和 no-boundary-violations-in-test 已移除，不保留规则 ID、命名导出或旧子路径别名；手动接线须按职责迁移。默认工厂调用无需修改。

`allowedTestOptions` 仅属于 no-invalid-test-definition，`requireItemNumber` 仅属于 no-missing-test-comment；原 pageInteraction 的 routeStub、fetchWriteInEvaluate、banDirectHttp、syntheticClick 直接作为 no-fake-page-interactions-in-test 的选项，默认值保持。五条隔离与状态清理规则接受 testDir。各规则不提供 scanPath、文件例外或断言 helper 名称白名单，无关选项由 schema 拒绝。内部库导入库外代码继续由 no-business-imports-in-lib 负责。

异步异常断言、本地 async 操作及已识别的异步页面断言必须等待、直接返回或保留后消费。外层 await 不能替另一个函数里的操作等待；未调用函数、恒假分支、return 后代码及单独 expect() 不能充当有效断言。调用本地 helper 明确执行的回调可计入，不能按函数名称登记“可信断言”。

测试标题和回调方法名分别校验。用例使用 `test('创建成功', async function testCreateSuccessfully(t) { ... })` 形式，回调方法名须在文件内可唯一定位，避免 testcase.md 的 code-ref 引用歧义；箭头、匿名 function 和单独传入函数引用不满足内联具名注册要求。套件、hook 和普通业务回调不受此命名要求。规则识别真实 runner 及其别名，具名回调不代替非空标题、说明或断言。动态生成的用例标题能否被看板精确运行仍取决于看板解析能力，命名检查不执行测试来求运行时标题。

空 catch 和空 Promise.catch 统一由全域的 `no-silent-catch` 检查，测试质量规则不再重复报告。Promise 来源包括未被遮蔽的原生构造器、resolve/reject/all/allSettled/race/any、原生 fetch、可确认的本地 async 函数及其返回链和稳定别名；拒绝回调也支持可确认的本地函数引用。未传拒绝回调会继续传播拒绝，不按空处理报告。未知工厂、跨模块返回类型、反射调用等不做完整推断；非空处理仍放行，不宣称其中的语句一定有效处理了错误。

页面 API 只有来源可确认时才检查 route、force、固定等待和合成点击；普通同名对象不当作浏览器。动态对象与跨模块回调未能归因时不猜测。原生 HTTP 直调是否符合业务入口还需结合分区和环境模块规则。裸定时 Promise 不能用来猜测业务完成；有实际操作参与的超时竞赛、超时保护及手动推进的时钟属于不同契约，不按裸睡眠处理。

架构规则检查明确的写入与清理位置：业务函数替换与可写环境数据区分，观察数据按已登记接口契约统一只读。持续存在的命令钩子需要 finally、node:test after 或实际返回的清理函数复位；进程状态先保存原值再恢复。它证明能够静态确认的登记，不证明所有运行时分支都释放资源。没有声明的业务层级、任意对象的可写性和动态调用，仍需设计与评审；不能凭目录片段或方法名补造架构约束。

### 观察数据只读

`no-observation-data-write-in-test` 按真实模块与导出接口登记观察来源，当前包括 litenvi-node 的 `lite-server` 默认导出 `t_requests()`、`lite-child_process` 默认导出 `t_calls()`、`lite-process` 具名导出 `liteProcess.t_exitCodes()`、`lite-cmd-mgr` 默认导出 `t_defined()`。即使接口返回独立副本，测试也不能修改这些观察结果。普通同名方法、其他 `t_` 接口、输入参数及环境装配数据保持原有可写性。

规则追踪本文件内可确认的别名、解构、对象包装、辅助函数传参与返回、闭包、数组回调及 for-of 元素。赋值、自增、自减、删除、数组修改方法、Object/Reflect 写入及其可确认的别名、call/apply/bind 调用均受检。`map` 投影出的独立值可修改；展开、slice、filter 等产生的新容器可修改，其中共享的观察记录和嵌套引用仍只读。`structuredClone` 得到的独立数据可以修改。防御性复制测试通过引用不相同及内容断言验证隔离，无需改写观察结果。

这是静态检查：不执行源码，不追踪任意跨模块辅助函数、运行时反射或动态生成的属性和调用关系；无法确认的数据来源不猜测。新增观察接口需要在规则中明确登记契约并补用例，不能仅凭变量名或 `t_` 前缀自动认定。对应行为用例位于 `scripts/tests/export/readonly-observations.test.mjs`。

### 原生环境能力统一入口

公共工厂默认启用 `atb/no-blacklist-module-imports`，覆盖全部受管 JS。固定环境组为 fs、http、https、net、tls、dgram、dns、child_process、worker_threads、os、process、timers、cluster、readline、inspector、sqlite、tty，并连带子路径；path、url、events、buffer 等计算工具与测试框架不因此被禁止。

业务及测试经 lite 门面访问环境。规则仅内置 litenvi-node 原有的七个原生底层文件、lite-os.test.mjs 和 native-reference.test.mjs；每个文件只允许其必要模块及子路径。判定同时核对包名、ESM 公开入口结构与真实文件归属，同名普通项目、嵌套普通包、其他模块及越界软链接不能继承权限。模块规则和测试入口共用此策略，不再接受 exceptionFilesAllowModules，也不提供替代例外参数。

模块规则不需要 testDir，测试入口仍用 testDir 识别分区。ATB 宿主钩子的真实 ESM 源码夹具通过 lite-fs 在 mock 前准备并在 suite 结束后清理，业务数据继续留在内存卷；第三方依赖内部不递归检查。

检查包括静态 import、export-from、常量字符串及拼接/模板的动态 import、require 别名、createRequire、module.require、process.getBuiltinModule 及其简单别名，包含 call/apply/bind 调用。未知 getBuiltinModule 目标报错，因为目标必然是内置模块；未知普通动态加载目标不猜测。任意反射、跨函数值传播和动态生成源码仍属于静态边界。

本规则限制模块加载，不等同于禁止全部全局 API：浏览器 fetch、process 的现有协议、Date/随机数或定时器全局对象不在本规则中全面封禁，测试隔离还需门面装配和行为验证。测试位于 `scripts/tests/export/no-blacklist-module-imports.test.mjs`；旧的 no-native-environment-imports 和 no-blacklist-modules-in-test 已移除，不保留兼容别名。

### 禁止内部库导入业务代码

`libDir` 默认是 `scripts/lib`，相对项目根解析。加载目标解析后仍在内部库内即允许，因此嵌套目录使用 `../peer.mjs` 不会仅因包含 `..` 被拒绝。相对路径、绝对路径、file URL、包自引用和软链接按同一实际路径边界检查；包自引用的标准 `node` / `import` / `require` / `default` 条件分别选择，不把其他条件的目标混作当前目标。

动态 `import('./peer.mjs')`、Node 内置及已声明运行依赖允许；`import('../business.mjs')` 指向库外时报告。运行时参数 `import(target)` 无法确定目标时报告，要求调用方明确来源；不会执行源码、网络请求或包入口求值。未声明包和只在 devDependencies 中登记的包不能作为内部库的运行依赖。

已识别的加载器包括未被遮蔽的 `require`、`module.require`、标准 `createRequire` 及稳定别名；`createRequire` 保留显式解析基准，不假定相对路径总是从当前文件出发。可解析值限稳定字符串常量、拼接/模板以及来源可确认的标准 path/URL 构造。全相对的 `path.resolve()` 依赖运行时工作目录，按目标未知报告；URL 被别名修改或交给未知函数后，不再沿用初值。任意工厂、跨函数参数传递、动态加载器包装和自定义条件不做完整推断；本规则不宣称能证明所有运行时依赖。

对应测试位于 `scripts/tests/export/no-business-imports-in-lib.test.mjs`；`config.test.mjs` 另以真实 ESLint 验证工厂接线、合法动态加载、越界/未知目标及全局通配符禁令。

### 模块加载与接口级别的检查顺序

`no-out-of-level-access` 先检查加载目标，再检查具体接口。相对路径、绝对路径和 file URL 只能加载本包文件；跨包必须使用包名，由 Node 按对方 package.json 的入口解析。即使文件已公开，也不能通过路径跨包直连。包名加载最终落到 node_modules 或软链接目标，不会因此被当成文件路径导入。

生产文件不能加载测试目录内的 helper、初始化脚本或可执行测试，纯副作用导入同样受检；目录外遗留的 .test.js/.mjs/.cjs 文件也按测试处理。跨包路径错误优先报告，通过模块边界后再检查 i_/t_/f_，避免一次导入产生多层重复错误。测试文件互相依赖的检查由 no-test-case-imports-in-test 负责；生产依赖测试的检查移至访问规则，不再双报。

检查覆盖静态 import、再导出、常量动态 import、require、module.require、标准 createRequire 及可确认的别名和 call/apply/bind 调用。支持稳定字符串、拼接/模板和来源明确的 path/URL 构造；createRequire 保留其实际解析基准。未知运行时目标仍沿既有静态边界停止归因，不宣称能够阻止所有动态加载，也不执行受检模块。包名入口的静态读取仅用于包/测试身份归因，不代替 Node 报告入口不存在、条件不匹配等加载错误。

行为用例位于 scripts/tests/export/module-access.test.mjs，使用真实 Linter 与 lite-fs 内存包覆盖同包/跨包、软链接、条件入口、加载器、生产/测试边界及错误优先级。

// atb/no-missing-config-tests — 关键配置文件必须有「真实读取 + 关键字段断言」的守护测试。
// 配置文件（package.json、eslint.config.mjs）是行为面——清单、入口、纪律都在里面，改动
// 没有测试守护就会静默漂移。守护对象为固定双配置，另自动追加 hooksDir 中发现的 JSON：
// - eslint.config.mjs（包根，家族内置常量——本规则锚点本身），关键字段 rules / plugins；
// - packageJsonPath 条目（清单语义，缺省 'package.json'，与工厂同名入参桥接），关键字段
//   name / exports。
// - hooksDir 下每份 hook JSON：关键字段 hooks；目录由同名工厂入参指定，不执行 hook 命令。
// 证据三级（不满足即报，messageId 分列）：
// ① 守护测试文件存在：按约定命名定位——配置 basename 去扩展名 + '.test.mjs'
//   （package.json → package.test.mjs、eslint.config.mjs → eslint.config.test.mjs），在
//   testDir 树内递归查找，任一命中文件可作守护载体。
// ② 真实读取：与 config 分区共用 AST 证据，识别实际配置 import 或绑定到 fs 的读取调用。
//   路径须可静态确认，可追踪常量别名；仅提到路径、未调用函数与普通同名读取对象不算。
// ③ 关键字段断言：node:assert 按词法绑定归因，实际比较值须来自配置读取结果，且验证
//   关键字段；局部假对象、遮蔽绑定与断言说明里的字段文字不能代替证据。不执行源码。
// 锚点为包根 eslint.config.mjs（无需 JSON parser——挂在可选 parser 上的规则在未接线时静默
// 失效，违背 fail-loud），自锚定包根，报告落在根配置的 Program 节点；无根配置文件的项目
// 不接线本规则。存在才要求：packageJsonPath 指向的清单在仓库中不存在时不设该条要求。
// testDir 与 packageJsonPath 均为相对路径，绝对传入即抛（fail-loud，防配置错误静默失效）。
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { i_projectRootOf } from '../lib/attributions.mjs';
import { i_configEntries, i_configTestName, i_configTestEvidence } from '../lib/config-test-analysis.mjs';

const DEFAULT_TEST_DIR = 'scripts/tests';
const ROOT_CONFIG = 'eslint.config.mjs';
// 私有：目录树递归收集指定 basename 的文件（跳过 node_modules 与点号目录，家族枚举口径）。
function f_walkNamed(dir, name, out = []) {
 for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) f_walkNamed(full, name, out);
  else if (entry.isFile() && entry.name === name) out.push(full);
 }
 return out;
}

export default {
 meta: {
  type: 'problem',
  docs: { description: '关键配置文件必须有守护测试：根配置、packageJsonPath 清单与 hooksDir 中的 hook JSON 须有约定命名的测试，真实读取并断言关键字段（node:assert 绑定归因）' },
  schema: [{
   type: 'object',
   properties: {
    testDir: { type: 'string' },
    packageJsonPath: { type: 'string' },
    hooksDir: { type: 'string' },
   },
   additionalProperties: false,
  }],
  messages: {
   missingConfigTestFile: "配置 '{{config}}' 的守护测试文件 '{{test}}' 不存在：按约定命名（配置名去扩展名 + .test.mjs，如 package.json → package.test.mjs）在 testDir 内提供守护测试",
   configTestNoRead: "守护测试 '{{test}}' 未真实读取配置 '{{config}}'：须实际导入该配置，或通过已绑定的 fs API 读取可静态确认的路径；只提到路径或未调用的函数不能作证",
   configTestNoFieldAssertion: "守护测试 '{{test}}' 未断言配置 '{{config}}' 的关键字段（{{fields}}）：node:assert 的实际比较值须来自配置读取结果，假对象与说明文本不能代替",
  },
 },

 create(context) {
  const options = context.options[0] || {};
  // 锚点：包根的 eslint.config.mjs（家族内置常量）；其他文件不受检，包外文件不受检。
  const filename = path.resolve(context.filename || context.getFilename());
  const root = i_projectRootOf(filename);
  if (root === null) return {};
  if (path.relative(root, filename).split(path.sep).join('/') !== ROOT_CONFIG) return {};
  // packageJsonPath：清单条目路径（相对包根，与工厂同名入参桥接），绝对传入即抛。
  const packageJsonPathInput = options.packageJsonPath || 'package.json';
  if (path.isAbsolute(packageJsonPathInput)) {
   throw new Error(`packageJsonPath 必须是相对包根的相对路径，不接受绝对路径：${packageJsonPathInput}`);
  }
  // testDir：相对仓库根的相对路径（缺省 scripts/tests，家族同名同语义），绝对传入即抛。
  const cwd = context.cwd || context.getCwd();
  const testDirInput = options.testDir || DEFAULT_TEST_DIR;
  if (path.isAbsolute(testDirInput)) {
   throw new Error(`testDir 必须是相对仓库根的相对路径（前提约束：ESLint 运行目录必须在仓库根），不接受绝对路径：${testDirInput}`);
  }
  const testDir = path.resolve(cwd, testDirInput);
  const parser = context.languageOptions && context.languageOptions.parser;
  const entries = i_configEntries(root, { packageJsonPath: packageJsonPathInput, hooksDir: options.hooksDir });

  // 守护测试定位与证据核验；扫描读取意外失败不吞——fail-loud，交给 ESLint 暴露
  //（testDir 缺失按无守护测试文件如实报告）。
  function guardOf(entry) {
   const configPath = path.join(root, entry.config);
   const displayName = i_configTestName(entry.config);
   const candidates = fs.existsSync(testDir) ? f_walkNamed(testDir, displayName): [];
   const existing = candidates.filter((file) => fs.existsSync(file));
   if (existing.length === 0) {
   return { ok: false, messageId: 'missingConfigTestFile', data: { config: entry.config, test: displayName } };
   }
   const fields = entry.fields;
   const analyses = existing.map((file) => ({ file, evidence: i_configTestEvidence(file, configPath, fields, parser, fs.readFileSync(file, 'utf8'), root) }));
   const satisfied = (evidence) => evidence.read && evidence.fieldAssert;
   if (analyses.some((item) => satisfied(item.evidence))) return { ok: true };
   // 全候选不满足：有读取缺字段断言优先报（可定位到具体文件），全无读取报 configTestNoRead。
   const withRead = analyses.find((item) => item.evidence.read);
   if (withRead) {
    return { ok: false, messageId: 'configTestNoFieldAssertion', data: { config: entry.config, test: path.relative(testDir, withRead.file).split(path.sep).join('/'), fields: fields.join('、') } };
   }
   return { ok: false, messageId: 'configTestNoRead', data: { config: entry.config, test: path.relative(testDir, analyses[0].file).split(path.sep).join('/') } };
  }

  return {
  Program(node) {
   for (const entry of entries) {
    // 存在才要求：清单条目在仓库中不存在时不设该条要求（根配置条目由锚点判定保证存在）。
    if (!fs.existsSync(path.join(root, entry.config))) continue;
    const guard = guardOf(entry);
    if (!guard.ok) context.report({ node, messageId: guard.messageId, data: guard.data });
   }
  },
  };
 },
};

// 测试文件按 bin/export/ui/config 声明类型，并核验实际业务入口或配置读取与字段断言。
// 静态分析只证明可解析的调用关系，不执行测试、业务模块或字符串形式的受检代码。
import path from 'node:path';
import { i_projectRootOf } from '../lib/attributions.mjs';
import { i_hookEntries } from '../lib/hook-entries.mjs';
import { i_testModuleExceptionsSchema, i_validModuleExceptionFile, i_moduleExceptionAllows } from '../lib/test-module-exceptions.mjs';
import { i_configEntries, i_configTestName, i_configTestEvidence } from '../lib/config-test-analysis.mjs';
import { i_testEntryManifest, i_testCommandWords, i_resolveTestModule, i_isTestImportEntry, i_analyzeTestEntries } from '../lib/test-entry-analysis.mjs';

// 私有：路径包含关系按完整目录段判定。
function f_inside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

// 私有：动态值只允许出现在端口或查询参数，主机与首页路径必须可确认。
function f_matchesIndex(url, index) {
  if (typeof url !== 'string') return false;
  const match = url.match(/^http:\/\/127\.0\.0\.1:(\d+|__dynamic__)(\/[^?#]*)?(?:[?#].*)?$/);
  if (!match) return false;
  const port = match[1];
  return (port === '__dynamic__' || Number(port) > 0 && Number(port) <= 65535) && (match[2] || '/') === index;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: '按测试文件检查入口：bin 调用声明命令、export 导入公开入口、ui 启动并导航首页、config 读取登记配置并断言关键字段；追踪实际调用的 helper' },
    schema: [{
      type: 'object',
      properties: {
        testDir: { type: 'string' },
        hooksDir: { type: 'string' },
        packageJsonPath: { type: 'string' },
        exceptionFilesAllowModules: i_testModuleExceptionsSchema,
        uiTest: {
          type: 'object',
          properties: { enabled: { type: 'boolean' }, startup: { type: 'string' }, index: { type: 'string' } },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    }],
    messages: {
      testOutsidePartitions: "测试文件 '{{file}}' 不在测试分区（bin/export/ui/config）内：每篇测试必须归入一个分区声明所测业务",
      undeclaredConfigTest: 'config 分区只能测试已登记的 packageJsonPath、eslint.config.mjs 或 hooksDir 配置，文件名须采用对应的约定守护名',
      configTestNoRead: 'config 分区测试必须实际导入或通过已绑定的 fs API 读取对应配置；路径字符串、未调用函数和假读取对象不算证据',
      configTestNoFieldAssertion: 'config 分区测试必须用 node:assert 对真实配置读取结果断言关键字段，假对象与断言说明文本不能代替',
      undeclaredEntry: "bin 分区测试的驱动目标 '{{file}}' 不在 package.json bin 声明块或 hooksDir 的 hook 命令声明中",
      unresolvableEntry: '进程驱动的脚本目标无法静态解析，请改为明确路径常量以便入口核验',
      importOffExportFace: "export 分区测试 import 的 '{{file}}' 不在 package.json exports/main 声明面：导出 API 业务测试只能经声明面文件测试",
      driveOffStartup: "ui 分区测试没有执行 uiTest.startup（'{{startup}}'）要求的命令参数",
      configStartupMissing: 'uiTest 已启用但未声明 startup：必须声明启动命令',
      startupOffBin: "uiTest.startup 的入口文件 '{{file}}' 不在 package.json bin 声明块",
      invalidIndexConfig: 'uiTest.index 必须是站内首页路径，例如 / 或 /index.html，不能包含协议、查询或片段',
      spawnInExportPartition: 'export 分区测试的进程驱动放错分区或缺少原生用途登记：本包 bin 应移至 bin/ 或 ui/；本包公开子进程 API 可自测，原生对照或隔离进程须按文件登记 exceptionFilesAllowModules 的 node:child_process 模块与理由',
      invalidModuleException: "exceptionFilesAllowModules 的 '{{file}}' 必须是相对 testDir 的单个代码文件，不允许绝对路径、越界或通配符",
      missingBinEntry: 'bin 分区测试必须实际调用 package.json bin 声明块或 hooksDir 的 hook 命令文件；只导入 helper 或运行测试 runner 不算业务入口',
      missingExportEntry: 'export 分区测试必须 import package.json exports/main 声明的任一文件；内建、第三方依赖和未调用的 helper 不算被测入口',
      missingStartupCall: "ui 分区测试必须实际执行 uiTest.startup 命令（'{{startup}}'），可通过已调用的 helper 完成",
      missingIndexNavigation: "ui 分区测试必须通过浏览器页面导航到 http://127.0.0.1:{port}{{index}}，可通过已调用的 helper 完成",
      invalidIndexNavigation: "未找到符合约定的首页导航：应访问 http://127.0.0.1:{port}{{index}}，实际 '{{url}}'",
      helperAnalysisFailed: "无法分析测试入口调用链 '{{file}}'：{{message}}",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const cwd = context.cwd || context.getCwd();
    const testDirInput = options.testDir || 'scripts/tests';
    if (path.isAbsolute(testDirInput)) throw new Error(`testDir 必须是相对仓库根的相对路径，不接受绝对路径：${testDirInput}`);
    const testDir = path.resolve(cwd, testDirInput);
    const filename = path.resolve(context.filename || context.getFilename());
    if (!f_inside(testDir, filename) || !/\.test\.[cm]?js$/.test(filename)) return {};
    const root = i_projectRootOf(filename);
    if (!root) return {};
    const ui = options.uiTest;
    const uiEnabled = !!ui && ui.enabled !== false;
    const partition = path.relative(testDir, filename).split(path.sep)[0];

    return {
      'Program:exit'(node) {
        let reported = false;
        const report = (messageId, data = {}, location = node) => { reported = true; context.report({ node: location, messageId, data }); };
        const exceptions = options.exceptionFilesAllowModules || [];
        for (const item of exceptions) {
          if (!i_validModuleExceptionFile(testDir, item.file)) {
            report('invalidModuleException', { file: item.file }); return;
          }
        }
        if (!['bin', 'export', 'config', ...(uiEnabled ? ['ui'] : [])].includes(partition)) {
          report('testOutsidePartitions', { file: path.relative(testDir, filename) }); return;
        }
        let info;
        try {
          info = i_testEntryManifest(root);
          const hooks = i_hookEntries(root, options.hooksDir);
          info.scriptEntries = new Set([...info.bins, ...hooks.scripts]);
          info.hookConfigs = new Set(hooks.configs.map(entry => path.resolve(root, entry.config)));
        }
        catch (error) { report('helperAnalysisFailed', { file: 'package.json', message: error.message }); return; }
        if (partition === 'config') {
          const entries = i_configEntries(root, options).filter(entry => i_configTestName(entry.config) === path.basename(filename));
          if (!entries.length) { report('undeclaredConfigTest'); return; }
          const evidence = entries.map(entry => i_configTestEvidence(filename, path.resolve(root, entry.config), entry.fields, context.languageOptions.parser, context.sourceCode.text, root));
          if (!evidence.some(item => item.read && item.fieldAssert)) report(evidence.some(item => item.read) ? 'configTestNoFieldAssertion' : 'configTestNoRead');
          return;
        }
        const startup = uiEnabled ? i_testCommandWords(ui.startup) || [] : [];
        if (startup[0] === 'node' || startup[0] === 'node.exe') startup.shift();
        if (uiEnabled && !startup.length) { report('configStartupMissing'); return; }
        const startupFile = startup.length ? info.commands.get(startup[0]) || path.resolve(root, startup[0]) : null;
        if (uiEnabled && !info.bins.has(startupFile)) { report('startupOffBin', { file: startup[0] }); return; }
        const indexInput = ui?.index ?? '/';
        if (uiEnabled && (!indexInput || /[:?#]|__dynamic__/.test(indexInput))) { report('invalidIndexConfig'); return; }
        const index = `/${indexInput.replace(/^\/+/, '')}`;
        const evidence = i_analyzeTestEntries({ context, filename, root, testDir, info });
        for (const failure of evidence.failures) report('helperAnalysisFailed', { file: failure.file, message: failure.message }, failure.node);
        if (partition === 'export') {
          let found = false;
          for (const item of evidence.imports) {
            const target = i_resolveTestModule(root, info, item.file, item.specifier);
            if (target && f_inside(testDir, target)) continue;
            if (target && i_isTestImportEntry(root, info, target)) { found = true; continue; }
            const self = item.specifier === info.manifest.name || item.specifier.startsWith(`${info.manifest.name}/`);
            if (self || target && f_inside(root, target)) report('importOffExportFace', { file: target ? path.relative(root, target) : item.specifier }, item.node);
          }
          const nativeReference = i_moduleExceptionAllows(exceptions, testDir, filename, 'node:child_process');
          for (const drive of evidence.drives) {
            // 启动本包 bin 优先按命令分区处理；API 自测与原生对照登记均不能覆盖它。
            const ownBin = info.scriptEntries.has(drive.target);
            const native = drive.source === 'node:child_process' || drive.source === 'child_process';
            if (!ownBin && (drive.selfPublicApi || native && nativeReference)) continue;
            report('spawnInExportPartition', {}, drive.node);
          }
          if (!found && !reported) report('missingExportEntry');
          return;
        }
        let found = false;
        const mismatches = [];
        for (const drive of evidence.drives) {
          // 内联脚本可用于测试进程装配，但不能充当清单文件或服务启动的正向证据。
          if (drive.mode === 'inline' || drive.mode === 'command') continue;
          if (!drive.target) { report('unresolvableEntry', {}, drive.node); continue; }
          if (partition === 'bin') {
            if (info.scriptEntries.has(drive.target)) found = true;
            else if (!f_inside(testDir, drive.target)) report('undeclaredEntry', { file: drive.head }, drive.node);
          } else if (drive.target === startupFile && startup.slice(1).every((word, index) => drive.args?.[index + 1] === word)) found = true;
          else mismatches.push(drive);
        }
        if (partition === 'bin') {
          if (!found && !reported) report('missingBinEntry');
          return;
        }
        if (!found && !reported) report(mismatches.length ? 'driveOffStartup' : 'missingStartupCall', { startup: ui.startup }, mismatches[0]?.node || node);
        if (!evidence.navigations.some(item => f_matchesIndex(item.url, index)) && !reported) {
          const navigation = evidence.navigations[0];
          report(navigation ? 'invalidIndexNavigation' : 'missingIndexNavigation', { index, url: String(navigation?.url ?? '无法静态解析') }, navigation?.node || node);
        }
      },
    };
  },
};

// atb/no-modules-import-in-test — 测试代码环境模块导入黑名单（内存世界纪律的导入面闭环）。
// no-unmocked-litenvi-in-test 只能约束走了 lite 门面的代码（用了 liteFs 没 mock 会报），测试
// 绕过门面直接 import 'node:fs' 的导入面此前无人拦截——本规则补上：testDir 目录内的文件禁止
// 导入 deniedModules 黑名单中的模块。黑名单由配置传入（公共工厂缺省环境组 node:fs/http/
// https/child_process/process，调用方可整组覆盖），规则不内置组；空黑名单即无约束。
// 文件例外经 exceptionFilesAllowModules 独立参数登记（精确文件、模块清单和理由），只放行
// 对应模块——与黑名单是两个独立参数，极性不混叠。
// 匹配语义：双向归一化 + 子路径连带——裸内置名（fs/http）经 builtinModules 等价加 node: 前缀
//（Node 双写法同一模块），黑名单与说明符两侧同口径归一；黑名单条目命中说明符自身或其祖先段
//（'node:fs' 拦 'node:fs/promises'，'lodash' 拦 'lodash/fp'；黑名单写子路径只拦子路径自身）。
// 导入形态与 no-undeclared-dependencies-imports 同口径：静态 import（含副作用导入）、
// export-from 两形态、静态可解的动态 import() 与 require()（被遮蔽的 require 不算）；目标
// 静态不可解时放行（静态边界，如实声明）。相对导入与绝对路径不经判定。testDir 与
// no-wrong-access-level 同名同语义：相对仓库根的相对路径（缺省 scripts/tests），按 ESLint
// 运行目录解析，不支持绝对路径（传入即抛 fail-loud）；目录外文件不受检。
import path from 'node:path';
import { i_evaluateStaticString } from '../lib/attributions.mjs';

import { i_testModuleExceptionsSchema, i_normalizeTestModule, i_validModuleExceptionFile, i_moduleExceptionAllows } from '../lib/test-module-exceptions.mjs';

const DEFAULT_TEST_DIR = 'scripts/tests';
// 私有：祖先段序列——自身起按 / 逐级去尾段（'node:fs/promises' → ['node:fs/promises','node:fs']，
// 'lodash/fp' → ['lodash/fp','lodash']；'@scope' 形态的中间段不构成合法说明符，入列无害）。
function f_ancestorSegments(specifier) {
  const segments = [];
  let current = specifier;
  for (;;) {
    segments.push(current);
    const cut = current.lastIndexOf('/');
    if (cut <= 0) break;
    current = current.slice(0, cut);
  }
  return segments;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: '测试代码环境模块导入黑名单：testDir 内禁止导入 deniedModules 中的模块（归一化 fs ≡ node:fs，子路径连带 node:fs 拦 node:fs/promises），补 no-unmocked-litenvi-in-test 管不到的绕过门面直接导入；文件例外经 exceptionFilesAllowModules 独立参数按文件登记' },
    schema: [{
      type: 'object',
      properties: {
        testDir: { type: 'string' },
        deniedModules: { type: 'array', items: { type: 'string' } },
        exceptionFilesAllowModules: i_testModuleExceptionsSchema,
      },
      additionalProperties: false,
    }],
    messages: {
      invalidModuleException: "exceptionFilesAllowModules 的 '{{file}}' 必须是相对 testDir 的单个代码文件，不允许绝对路径、越界或通配符",
      deniedModule: "测试代码禁止导入 '{{specifier}}'（命中黑名单 '{{denied}}'）：文件/网络/进程等环境能力走内存世界门面（lite-fs/lite-http/lite-child_process 等），确需真实 IO 的存量场景按文件登记 exceptionFilesAllowModules 例外",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    // 测试身份：testDir（相对仓库根的相对路径，缺省 scripts/tests）目录内即测试代码路径；
    // 前提约束：ESLint 运行目录必须在仓库根——不支持绝对路径，传入即抛。
    const cwd = context.cwd || context.getCwd();
    const testDirInput = options.testDir || DEFAULT_TEST_DIR;
    if (path.isAbsolute(testDirInput)) {
      throw new Error(`testDir 必须是相对仓库根的相对路径（前提约束：ESLint 运行目录必须在仓库根），不接受绝对路径：${testDirInput}`);
    }
    const testDir = path.resolve(cwd, testDirInput);
    const filename = path.resolve(context.filename || context.getFilename());
    const relative = path.relative(testDir, filename).split(path.sep).join('/');
    if (relative.startsWith('../')) return {};
    const exceptions = options.exceptionFilesAllowModules || [];
    const invalid = exceptions.find(item => !i_validModuleExceptionFile(testDir, item.file));
    if (invalid) return { Program(node) { context.report({ node, messageId: 'invalidModuleException', data: { file: invalid.file } }); } };
    // 黑名单双向归一化；空黑名单即无约束（规则不内置组，由配置传入）。
    const denied = new Set((options.deniedModules || []).map(i_normalizeTestModule));
    if (denied.size === 0) return {};
    const sourceCode = context.sourceCode || context.getSourceCode();

    function checkSpecifier(node, specifier) {
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) return;
      if (i_moduleExceptionAllows(exceptions, testDir, filename, specifier)) return;
      for (const segment of f_ancestorSegments(i_normalizeTestModule(specifier))) {
        if (denied.has(segment)) {
          context.report({ node, messageId: 'deniedModule', data: { specifier, denied: segment } });
          return;
        }
      }
    }

    return {
      ImportDeclaration(node) {
        checkSpecifier(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkSpecifier(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        checkSpecifier(node, node.source.value);
      },
      ImportExpression(node) {
        const evaluated = i_evaluateStaticString(node.source, sourceCode);
        if (evaluated.resolved) checkSpecifier(node, evaluated.value);
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
        if (sourceCode.getScope(node.callee).set.has('require')) return;
        const evaluated = i_evaluateStaticString(node.arguments[0], sourceCode);
        if (evaluated.resolved) checkSpecifier(node, evaluated.value);
      },
    };
  },
};

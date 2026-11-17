// 按可确认的模块身份检查黑盒边界、依赖方向、观察对象和资源清理；不执行受检代码。
// 无文件例外。跨函数动态传值无法确认时不猜测，资源检查证明清理已登记，不宣称证明运行时释放。
import path from 'node:path';
import { i_projectRootOf } from '../lib/attributions.mjs';
import { i_testEntryManifest } from '../lib/test-entry-analysis.mjs';
import { i_hookEntries } from '../lib/hook-entries.mjs';
import { i_testApiAnalysis, i_testProperty, i_testSourceTarget, i_walkTestNodes } from '../lib/test-quality-analysis.mjs';

// 私有：按完整目录段判断所属范围。
const f_inside = (directory, file) => file === directory || file.startsWith(directory + path.sep);
// 私有：最近的函数或模块是本次注册的所有者。
function f_frame(node) {
  for (let parent = node.parent; parent; parent = parent.parent) if (/Function/.test(parent.type) || parent.type === 'Program') return parent;
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: '禁止测试替换业务、测试文件互相依赖、篡改观察账本和丢失可确认的清理登记' },
    schema: [{ type: 'object', properties: { testDir: { type: 'string' }, libDir: { type: 'string' }, hooksDir: { type: 'string' } }, additionalProperties: false }],
    messages: {
      businessReplacement: '测试不能替换本项目业务实现；通过真实入口执行，在环境门面或已设计的测试接口装配依赖',
      testFileDependency: '不能导入另一个测试文件；共享准备、操作和观察放在普通 helper',
      productionDependsOnTests: '生产代码不能依赖测试目录或夹具',
      reverseEntryDependency: '共享库不能反向导入声明的命令入口，请下沉共同实现',
      observationMutation: '公共观察账本只能读取，不能通过改写观察值制造测试结果',
      missingHookReset: '命令钩子缺少同一命令的清理登记，请在 finally、after 或返回的清理函数复位',
      globalStateLeak: '修改进程全局状态后缺少原值恢复，请保存原值并在 finally/after 恢复',
      moduleLoadSideEffect: '共享模块不能在加载时写盘、启动监听或修改进程状态；将操作放入明确调用的函数',
    },
  },
  create(context) {
    const filename = path.resolve(context.filename);
    const root = i_projectRootOf(filename);
    if (!root) return {};
    const settings = context.options[0] || {};
    const testDir = path.resolve(root, settings.testDir || 'scripts/tests');
    const libDir = path.resolve(root, settings.libDir || 'scripts/lib');
    const testing = f_inside(testDir, filename);
    const source = context.sourceCode;
    const api = i_testApiAnalysis(source, filename);
    const info = i_testEntryManifest(root);
    const entries = new Set([...info.bins, ...i_hookEntries(root, settings.hooksDir).scripts]);
    const installs = [], resets = [], mutations = [], restores = [];
    const report = (node, messageId) => context.report({ node, messageId });
    const f_global = (node, name) => node?.type === 'Identifier' && node.name === name && !api.binding(node)?.defs.length;
    // 私有：只有确定属于当前项目生产模块的目标才判业务替换。
    const f_business = node => {
      const identity = api.symbol(node);
      if (!identity) return false;
      const target = i_testSourceTarget(filename, identity.source);
      return target && f_inside(root, target) && !f_inside(testDir, target);
    };
    // 私有：命令名是配置句柄身份；普通同名方法不参与检查。
    const f_command = (node, seen = new Set()) => {
      if (node?.type === 'Identifier') {
        const variable = api.binding(node);
        if (!variable || seen.has(variable)) return null;
        return f_command(variable.defs[0]?.node?.init, new Set(seen).add(variable));
      }
      if (node?.type !== 'CallExpression') return null;
      const symbol = api.symbol(node.callee);
      if (symbol?.source !== 'litenvi-node/lite-cmd-mgr.mjs' || !/\.command$/.test(symbol.name)) return null;
      const name = node.arguments[0];
      return name?.type === 'Literal' ? `command:${name.value}` : null;
    };
    // 私有：清理位置必须属于真正的 finally、node:test hook 或返回给调用方的清理函数。
    const f_cleanupOwner = node => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (parent.type === 'TryStatement' && parent.finalizer && node.range[0] >= parent.finalizer.range[0] && node.range[1] <= parent.finalizer.range[1]) return f_frame(parent);
        if (/Function/.test(parent.type)) {
          const call = parent.parent;
          if (call?.type === 'CallExpression' && ['after', 'afterEach'].includes(api.runner(call)?.name)) return f_frame(call);
          if (call?.type === 'ReturnStatement') return f_frame(call);
          return null;
        }
      }
      return null;
    };
    const f_stateKey = node => {
      const value = api.symbol(node);
      if (value?.source !== 'node:process') return null;
      const name = value.name.replace(/^(?:default|\*)\./, '');
      return /^env\.[^.]+$/.test(name) || ['argv', 'exitCode'].includes(name) ? `process.${name}` : null;
    };
    // 私有：只把可确认的函数写入当作实现替换，普通可写数据不冒认业务方法。
    const f_callable = node => {
      if (!node) return false;
      if (/Function/.test(node.type)) return true;
      const def = api.binding(node)?.defs[0];
      return def?.type === 'FunctionName' || /Function/.test(def?.node?.init?.type);
    };
    const f_snapshot = (node, key) => {
      const variable = api.binding(node);
      return variable?.defs.some(def => f_stateKey(def.node?.init) === key);
    };
    const f_dependency = (node, specifier) => {
      if (typeof specifier !== 'string') return;
      const target = i_testSourceTarget(filename, specifier);
      if (!target) return;
      if (/\.test\.[cm]?js$/.test(target)) report(node, 'testFileDependency');
      else if (!testing && f_inside(testDir, target)) report(node, 'productionDependsOnTests');
      if (f_inside(libDir, filename) && entries.has(target)) report(node, 'reverseEntryDependency');
    };
    return {
      ImportDeclaration(node) { f_dependency(node, node.source.value); },
      ExportNamedDeclaration(node) { if (node.source) f_dependency(node, node.source.value); },
      ExportAllDeclaration(node) { f_dependency(node, node.source.value); },
      ImportExpression(node) { if (node.source.type === 'Literal') f_dependency(node, node.source.value); },
      AssignmentExpression(node) {
        if (!testing) {
          if (f_inside(libDir, filename) && f_frame(node)?.type === 'Program' && f_stateKey(node.left)) report(node, 'moduleLoadSideEffect');
          return;
        }
        if (api.symbol(node.left)?.readonly) report(node, 'observationMutation');
        else if (node.left.type === 'MemberExpression' && f_callable(node.right) && f_business(node.left.object)) report(node, 'businessReplacement');
        const key = f_stateKey(node.left);
        if (key) {
          const owner = f_cleanupOwner(node);
          if (owner && f_snapshot(node.right, key)) restores.push({ key, owner });
          else if (!owner) mutations.push({ node, key, owner: f_frame(node) });
        }
      },
      UnaryExpression(node) {
        if (testing && node.operator === 'delete' && api.symbol(node.argument)?.readonly) report(node, 'observationMutation');
      },
      CallExpression(node) {
        api.runner(node);
        const method = i_testProperty(node.callee);
        const object = node.callee.type === 'MemberExpression' ? node.callee.object : null;
        const identity = api.symbol(node.callee);
        if (f_global(node.callee, 'require') && node.arguments[0]?.type === 'Literal') f_dependency(node, node.arguments[0].value);
        if (testing) {
          if (['node:test', 'node:test-context'].includes(identity?.source) && /(?:^|\.)mock\.(?:method|getter|setter)$/.test(identity.name) && node.arguments.length >= 3 && f_business(node.arguments[0])) report(node, 'businessReplacement');
          if (f_global(object, 'Object') && ['defineProperty', 'defineProperties', 'assign'].includes(method) && f_business(node.arguments[0])) {
            const values = method === 'defineProperty' ? [node.arguments[2]] : node.arguments.slice(1);
            const replaces = values.some(value => value?.type === 'ObjectExpression' && value.properties.some(property => f_callable(property.value) || method === 'defineProperties' && property.value?.properties?.some(item => f_callable(item.value))));
            if (replaces) report(node, 'businessReplacement');
          }
          if (method === 't_onRun') {
            const command = f_command(object);
            if (command) {
              if (node.arguments[0]?.type === 'Literal' && node.arguments[0].value === null) {
                resets.push({ command, node });
              } else installs.push({ node, command, owner: f_frame(node) });
            }
          }
          if (api.symbol(object)?.readonly && ['push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'sort', 'fill', 'copyWithin'].includes(method)) report(node, 'observationMutation');
        } else if (f_inside(libDir, filename) && !entries.has(filename) && f_frame(node)?.type === 'Program') {
          if (identity && ['node:fs', 'node:fs/promises', 'litenvi-node/lite-fs.mjs'].includes(identity.source) && /(?:^|\.)(?:writeFile(?:Sync)?|appendFile(?:Sync)?|mkdir(?:Sync)?|rm(?:Sync)?|unlink(?:Sync)?)$/.test(identity.name)
            || method === 'listen' && identity?.source && ['node:http', 'node:net', 'litenvi-node/lite-server.mjs'].includes(identity.source)) report(node, 'moduleLoadSideEffect');
        }
      },
      'Program:exit'() {
        for (const reset of resets) reset.owner = f_cleanupOwner(reset.node);
        const helperCleanup = (owner, command) => i_walkTestNodes(owner.body, node => {
          if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || f_cleanupOwner(node) !== owner) return false;
          const init = api.binding(node.callee)?.defs[0]?.node?.init;
          if (init?.type !== 'CallExpression' || init.callee.type !== 'Identifier') return false;
          const def = api.binding(init.callee)?.defs[0];
          const helper = def?.type === 'FunctionName' ? def.node : def?.node?.init;
          return resets.some(reset => reset.command === command && reset.owner === helper);
        }, true);
        for (const install of installs) if (!resets.some(reset => reset.command === install.command && reset.owner === install.owner) && !helperCleanup(install.owner, install.command)) report(install.node, 'missingHookReset');
        for (const mutation of mutations) if (!restores.some(restore => restore.key === mutation.key && (restore.owner === mutation.owner || restore.owner?.type === 'Program'))) report(mutation.node, 'globalStateLeak');
      },
    };
  },
};

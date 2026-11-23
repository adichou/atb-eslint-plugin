// 持续命令 t_onRun 钩子必须登记同一命令的复位，不证明所有运行时路径都已执行清理。
import { i_testBoundaryContext, i_testCleanupOwner, i_testFrame } from '../lib/test-rule-context.mjs';
import { i_testProperty, i_walkTestNodes } from '../lib/test-quality-analysis.mjs';
export default {
  meta: { type: 'problem', docs: { description: '命令 t_onRun 钩子必须登记同一命令的清理复位' }, schema: [{ type: 'object', properties: { testDir: { type: 'string' } }, additionalProperties: false }], messages: {
    missingHookReset: '命令钩子缺少同一命令的清理登记，请在 finally、after 或返回的清理函数复位',
  } },
  create(context) {
    const state = i_testBoundaryContext(context);
    if (!state) return {};
    const { api, report } = state, installs = [], resets = [];
    const command = (node, seen = new Set()) => {
      if (node?.type === 'Identifier') {
        const variable = api.binding(node);
        if (!variable || seen.has(variable)) return null;
        return command(variable.defs[0]?.node?.init, new Set(seen).add(variable));
      }
      if (node?.type !== 'CallExpression') return null;
      const identity = api.symbol(node.callee);
      if (identity?.source !== 'litenvi-node/lite-cmd-mgr.mjs' || !/\.command$/.test(identity.name)) return null;
      return node.arguments[0]?.type === 'Literal' ? `command:${node.arguments[0].value}` : null;
    };
    return {
      CallExpression(node) {
        api.runner(node);
        if (i_testProperty(node.callee) !== 't_onRun') return;
        const name = command(node.callee.object);
        if (!name) return;
        if (node.arguments[0]?.type === 'Literal' && node.arguments[0].value === null) resets.push({ command: name, node });
        else installs.push({ node, command: name, owner: i_testFrame(node) });
      },
      'Program:exit'() {
        for (const reset of resets) reset.owner = i_testCleanupOwner(reset.node, api);
        const helperCleanup = (owner, name) => i_walkTestNodes(owner.body, node => {
          if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || i_testCleanupOwner(node, api) !== owner) return false;
          const init = api.binding(node.callee)?.defs[0]?.node?.init;
          if (init?.type !== 'CallExpression' || init.callee.type !== 'Identifier') return false;
          const def = api.binding(init.callee)?.defs[0], helper = def?.type === 'FunctionName' ? def.node : def?.node?.init;
          return resets.some(reset => reset.command === name && reset.owner === helper);
        }, true);
        for (const install of installs) if (!resets.some(reset => reset.command === install.command && reset.owner === install.owner) && !helperCleanup(install.owner, install.command)) report(install.node, 'missingHookReset');
      },
    };
  },
};

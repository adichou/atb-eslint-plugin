// 测试中的进程全局状态修改必须能确认保存原值和恢复登记。
import { i_testBoundaryContext, i_testCleanupOwner, i_testFrame } from '../lib/test-rule-context.mjs';
export default {
  meta: { type: 'problem', docs: { description: '测试修改进程环境、参数或退出码后必须登记原值恢复' }, schema: [{ type: 'object', properties: { testDir: { type: 'string' } }, additionalProperties: false }], messages: {
    globalStateLeak: '修改进程全局状态后缺少原值恢复，请保存原值并在 finally/after 恢复',
  } },
  create(context) {
    const state = i_testBoundaryContext(context);
    if (!state) return {};
    const { api, report } = state, mutations = [], restores = [];
    const stateKey = node => {
      const identity = api.symbol(node);
      if (identity?.source !== 'node:process') return null;
      const name = identity.name.replace(/^(?:default|\*)\./, '');
      return /^env\.[^.]+$/.test(name) || ['argv', 'exitCode'].includes(name) ? `process.${name}` : null;
    };
    return {
      CallExpression(node) { api.runner(node); },
      AssignmentExpression(node) {
        const key = stateKey(node.left);
        if (!key) return;
        const owner = i_testCleanupOwner(node, api);
        if (owner && api.binding(node.right)?.defs.some(def => stateKey(def.node?.init) === key)) restores.push({ key, owner });
        else if (!owner) mutations.push({ node, key, owner: i_testFrame(node) });
      },
      'Program:exit'() {
        for (const mutation of mutations) if (!restores.some(restore => restore.key === mutation.key && (restore.owner === mutation.owner || restore.owner?.type === 'Program'))) report(mutation.node, 'globalStateLeak');
      },
    };
  },
};

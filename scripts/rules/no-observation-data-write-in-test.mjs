// 只读观察契约独立检查，不对同名普通方法或输入数据附加限制。
import { i_testBoundaryContext } from '../lib/test-rule-context.mjs';
import { i_checkReadonlyObservations } from '../lib/readonly-observations.mjs';
export default {
  meta: { type: 'problem', docs: { description: '禁止测试修改已登记观察接口的返回数据及共享引用' }, schema: [{ type: 'object', properties: { testDir: { type: 'string' } }, additionalProperties: false }], messages: {
    observationMutation: '观察接口的返回数据只能读取，不能修改（即使是独立副本）',
  } },
  create(context) {
    const state = i_testBoundaryContext(context);
    return state ? { 'Program:exit'() { i_checkReadonlyObservations(state.source, state.api, node => state.report(node, 'observationMutation')); } } : {};
  },
};

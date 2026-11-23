// 规则拆分回归的装配数据；不复刻规则实现，也不封装断言。
export const i_QUALITY_RULES = [
  'no-skip-test-exectution', 'no-invalid-test-definition', 'no-missing-test-comment',
  'no-invalid-test-assertions', 'no-unawaited-test-operations', 'no-fixed-sleep-in-test',
  'no-uncleanup-injection-in-test', 'no-fake-page-interactions-in-test',
];
export const i_BOUNDARY_RULES = [
  'no-business-replacement-in-test', 'no-test-case-imports-in-test', 'no-observation-data-write-in-test',
  'no-unreset-onRun-hooks-in-test', 'no-unrestored-process-state-in-test',
];
export const i_MESSAGE_RULES = Object.fromEntries([
  ['no-skip-test-exectution', ['reducedExecution', 'testContextSkip']],
  ['no-invalid-test-definition', ['missingTestName', 'missingTestCallbackName', 'duplicateTestCallbackName', 'callbackAndPromise', 'unknownTestOption', 'unresolvableTestOptions']],
  ['no-missing-test-comment', ['missingScenario', 'missingItemNumber']],
  ['no-invalid-test-assertions', ['missingAssertion', 'missingAssertMessage', 'constantAssertion', 'throwsAsync', 'throwsExpectation']],
  ['no-unawaited-test-operations', ['unawaitedRejects', 'unawaitedSubtest', 'unawaitedOperation', 'unawaitedExpect']],
  ['no-fixed-sleep-in-test', ['fixedSleep']], ['no-uncleanup-injection-in-test', ['unregisteredInject']],
  ['no-fake-page-interactions-in-test', ['routeStub', 'fetchWrite', 'directHttp', 'forcedInteraction', 'syntheticClick']],
  ['no-business-replacement-in-test', ['businessReplacement']], ['no-test-case-imports-in-test', ['testFileDependency']],
  ['no-observation-data-write-in-test', ['observationMutation']], ['no-unreset-onRun-hooks-in-test', ['missingHookReset']],
  ['no-unrestored-process-state-in-test', ['globalStateLeak']],
].flatMap(([rule, messages]) => messages.map(message => [message, `atb/${rule}`])));

// 内部：旧回归矩阵的选项按新职责装配，未知选项不静默忽略。
export function i_qualitySettings(options = {}) {
  const keys = {
    allowedTestOptions: 'no-invalid-test-definition', requireItemNumber: 'no-missing-test-comment',
    routeStub: 'no-fake-page-interactions-in-test', fetchWriteInEvaluate: 'no-fake-page-interactions-in-test',
    banDirectHttp: 'no-fake-page-interactions-in-test', syntheticClick: 'no-fake-page-interactions-in-test',
  };
  const settings = Object.fromEntries(i_QUALITY_RULES.map(rule => [`atb/${rule}`, 'error']));
  for (const [key, value] of Object.entries(options)) {
    if (!keys[key]) throw new Error(`未知回归选项：${key}`);
    const id = `atb/${keys[key]}`;
    settings[id] = ['error', { ...(Array.isArray(settings[id]) ? settings[id][1] : {}), [key]: value }];
  }
  return settings;
}

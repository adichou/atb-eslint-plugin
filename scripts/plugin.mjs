// atb-eslint-plugin 插件入口：以 `import atbRules from 'atb-eslint-plugin'` 装配
//（plugins: { atb: atbRules }），规则经 'atb/<规则名>' 启用；单条规则也可具名导入。
// 规则明细与配置键说明见 README.md。
import outOfLevelAccess from './rules/no-out-of-level-access.mjs';
import wrongAccessLevel from './rules/no-wrong-access-level.mjs';
import undeclaredDependenciesImports from './rules/no-undeclared-dependencies-imports.mjs';
import importCycles from './rules/no-import-cycles.mjs';
import businessImportsInLib from './rules/no-business-imports-in-lib.mjs';
import unmockedLitenviInTest from './rules/no-unmocked-litenvi-in-test.mjs';
import undeclaredEntryInTest from './rules/no-undeclared-entry-in-test.mjs';
import missingConfigTests from './rules/no-missing-config-tests.mjs';
import blacklistModuleImports from './rules/no-blacklist-module-imports.mjs';
import unmanagedJs from './rules/no-unmanaged-js.mjs';
import looseDependencySpecs from './rules/no-loose-dependency-specs.mjs';
import unusedRuntimeDependenciesInPackage from './rules/no-unused-runtime-dependencies-in-package.mjs';
import unusedExports from './rules/no-unused-exports.mjs';
import unusedFilePrivateCodes from './rules/no-unused-file-private-codes.mjs';
import unusedImports from './rules/no-unused-imports.mjs';
import wrongExportsInPackage from './rules/no-wrong-exports-in-package.mjs';
import silentCatch from './rules/no-silent-catch.mjs';

import skipTestExectution from './rules/no-skip-test-exectution.mjs';
import invalidTestDefinition from './rules/no-invalid-test-definition.mjs';
import missingTestComment from './rules/no-missing-test-comment.mjs';
import invalidTestAssertions from './rules/no-invalid-test-assertions.mjs';
import unawaitedTestOperations from './rules/no-unawaited-test-operations.mjs';
import fixedSleepInTest from './rules/no-fixed-sleep-in-test.mjs';
import uncleanupInjectionInTest from './rules/no-uncleanup-injection-in-test.mjs';
import fakePageInteractionsInTest from './rules/no-fake-page-interactions-in-test.mjs';
import businessReplacementInTest from './rules/no-business-replacement-in-test.mjs';
import testCaseImportsInTest from './rules/no-test-case-imports-in-test.mjs';
import observationDataWriteInTest from './rules/no-observation-data-write-in-test.mjs';
import unresetOnRunHooksInTest from './rules/no-unreset-onRun-hooks-in-test.mjs';
import unrestoredProcessStateInTest from './rules/no-unrestored-process-state-in-test.mjs';

const plugin = {
 rules: {
 'no-blacklist-module-imports': blacklistModuleImports,
 'no-out-of-level-access': outOfLevelAccess,
 'no-wrong-access-level': wrongAccessLevel,
 'no-undeclared-dependencies-imports': undeclaredDependenciesImports,
 'no-import-cycles': importCycles,
 'no-business-imports-in-lib': businessImportsInLib,
 'no-unmocked-litenvi-in-test': unmockedLitenviInTest,
 'no-undeclared-entry-in-test': undeclaredEntryInTest,
 'no-missing-config-tests': missingConfigTests,
 'no-unmanaged-js': unmanagedJs,
 'no-loose-dependency-specs': looseDependencySpecs,
 'no-unused-runtime-dependencies-in-package': unusedRuntimeDependenciesInPackage,
 'no-unused-exports': unusedExports,
 'no-unused-file-private-codes': unusedFilePrivateCodes,
 'no-unused-imports': unusedImports,
 'no-wrong-exports-in-package': wrongExportsInPackage,
 'no-silent-catch': silentCatch,
 'no-skip-test-exectution': skipTestExectution,
 'no-invalid-test-definition': invalidTestDefinition,
 'no-missing-test-comment': missingTestComment,
 'no-invalid-test-assertions': invalidTestAssertions,
 'no-unawaited-test-operations': unawaitedTestOperations,
 'no-fixed-sleep-in-test': fixedSleepInTest,
 'no-uncleanup-injection-in-test': uncleanupInjectionInTest,
 'no-fake-page-interactions-in-test': fakePageInteractionsInTest,
 'no-business-replacement-in-test': businessReplacementInTest,
 'no-test-case-imports-in-test': testCaseImportsInTest,
 'no-observation-data-write-in-test': observationDataWriteInTest,
 'no-unreset-onRun-hooks-in-test': unresetOnRunHooksInTest,
 'no-unrestored-process-state-in-test': unrestoredProcessStateInTest,
 },
};

export default plugin;
export {
 blacklistModuleImports,
 outOfLevelAccess,
 wrongAccessLevel,
 undeclaredDependenciesImports,
 importCycles,
 businessImportsInLib,
 unmockedLitenviInTest,
 undeclaredEntryInTest,
 missingConfigTests,
 unmanagedJs,
 looseDependencySpecs,
 unusedRuntimeDependenciesInPackage,
 unusedExports,
 unusedFilePrivateCodes,
 unusedImports,
 wrongExportsInPackage,
 silentCatch,
 skipTestExectution,
 invalidTestDefinition,
 missingTestComment,
 invalidTestAssertions,
 unawaitedTestOperations,
 fixedSleepInTest,
 uncleanupInjectionInTest,
 fakePageInteractionsInTest,
 businessReplacementInTest,
 testCaseImportsInTest,
 observationDataWriteInTest,
 unresetOnRunHooksInTest,
 unrestoredProcessStateInTest,
};

// atb-eslint-plugin 插件入口：以 `import atbRules from 'atb-eslint-plugin'` 装配
//（plugins: { atb: atbRules }），规则经 'atb/<规则名>' 启用；单条规则也可具名导入。
// 规则明细与配置键说明见 README.md。
import outOfLevelAccess from './rules/no-out-of-level-access.mjs';
import wrongAccessLevel from './rules/no-wrong-access-level.mjs';
import undeclaredDependenciesImports from './rules/no-undeclared-dependencies-imports.mjs';
import importCycles from './rules/no-import-cycles.mjs';
import reverseImportsInLib from './rules/no-reverse-imports-in-lib.mjs';
import unmockedLitenviInTest from './rules/no-unmocked-litenvi-in-test.mjs';
import badPatternsInTest from './rules/no-bad-patterns-in-test.mjs';
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
import boundaryViolationsInTest from './rules/no-boundary-violations-in-test.mjs';

const plugin = {
 rules: {
 'no-blacklist-module-imports': blacklistModuleImports,
 'no-out-of-level-access': outOfLevelAccess,
 'no-wrong-access-level': wrongAccessLevel,
 'no-undeclared-dependencies-imports': undeclaredDependenciesImports,
 'no-import-cycles': importCycles,
 'no-reverse-imports-in-lib': reverseImportsInLib,
 'no-unmocked-litenvi-in-test': unmockedLitenviInTest,
 'no-bad-patterns-in-test': badPatternsInTest,
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
 'no-boundary-violations-in-test': boundaryViolationsInTest,
 },
};

export default plugin;
export {
 blacklistModuleImports,
 outOfLevelAccess,
 wrongAccessLevel,
 undeclaredDependenciesImports,
 importCycles,
 reverseImportsInLib,
 unmockedLitenviInTest,
 badPatternsInTest,
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
 boundaryViolationsInTest,
};

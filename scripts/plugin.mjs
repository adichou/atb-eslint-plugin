// atb-eslint-plugin 插件入口：以 `import atbRules from 'atb-eslint-plugin'` 装配
//（plugins: { atb: atbRules }），规则经 'atb/<规则名>' 启用；单条规则也可具名导入。
// 规则明细与配置键说明见 README.md。
import outOfLevelAccess from './rules/no-out-of-level-access.mjs';
import wrongAccessLevel from './rules/no-wrong-access-level.mjs';
import undeclaredDependenciesImports from './rules/no-undeclared-dependencies-imports.mjs';
import importCycles from './rules/no-import-cycles.mjs';
import unmockedLitenviInTest from './rules/no-unmocked-litenvi-in-test.mjs';
import badTestPatterns from './rules/no-bad-test-patterns.mjs';
import undeclaredEntryInTest from './rules/no-undeclared-entry-in-test.mjs';
import modulesImportInTest from './rules/no-modules-import-in-test.mjs';
import missingConfigTests from './rules/no-missing-config-tests.mjs';
import unmanagedJs from './rules/no-unmanaged-js.mjs';
import looseDependencySpecs from './rules/no-loose-dependency-specs.mjs';
import unusedRuntimeDependenciesInPackage from './rules/no-unused-runtime-dependencies-in-package.mjs';
import unusedExports from './rules/no-unused-exports.mjs';
import unusedFilePrivateCodes from './rules/no-unused-file-private-codes.mjs';
import unusedImports from './rules/no-unused-imports.mjs';
import wrongExportsInPackage from './rules/no-wrong-exports-in-package.mjs';
import silentCatch from './rules/no-silent-catch.mjs';
import testBoundaryViolations from './rules/no-test-boundary-violations.mjs';

const plugin = {
 rules: {
 'no-out-of-level-access': outOfLevelAccess,
 'no-wrong-access-level': wrongAccessLevel,
 'no-undeclared-dependencies-imports': undeclaredDependenciesImports,
 'no-import-cycles': importCycles,
 'no-unmocked-litenvi-in-test': unmockedLitenviInTest,
 'no-bad-test-patterns': badTestPatterns,
 'no-undeclared-entry-in-test': undeclaredEntryInTest,
 'no-modules-import-in-test': modulesImportInTest,
 'no-missing-config-tests': missingConfigTests,
 'no-unmanaged-js': unmanagedJs,
 'no-loose-dependency-specs': looseDependencySpecs,
 'no-unused-runtime-dependencies-in-package': unusedRuntimeDependenciesInPackage,
 'no-unused-exports': unusedExports,
 'no-unused-file-private-codes': unusedFilePrivateCodes,
 'no-unused-imports': unusedImports,
 'no-wrong-exports-in-package': wrongExportsInPackage,
 'no-silent-catch': silentCatch,
 'no-test-boundary-violations': testBoundaryViolations,
 },
};

export default plugin;
export {
 outOfLevelAccess,
 wrongAccessLevel,
 undeclaredDependenciesImports,
 importCycles,
 unmockedLitenviInTest,
 badTestPatterns,
 undeclaredEntryInTest,
 modulesImportInTest,
 missingConfigTests,
 unmanagedJs,
 looseDependencySpecs,
 unusedRuntimeDependenciesInPackage,
 unusedExports,
 unusedFilePrivateCodes,
 unusedImports,
 wrongExportsInPackage,
 silentCatch,
 testBoundaryViolations,
};

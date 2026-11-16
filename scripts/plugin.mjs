// atb-eslint-plugin 插件入口：以 `import atbRules from 'atb-eslint-plugin'` 装配
//（plugins: { atb: atbRules }），规则经 'atb/<规则名>' 启用；单条规则也可具名导入。
// 规则明细与配置键说明见 README.md。
import outOfLevelAccess from './rules/no-out-of-level-access.mjs';
import wrongAccessLevel from './rules/no-wrong-access-level.mjs';
import wrongAccessComment from './rules/no-wrong-access-comment.mjs';
import undeclaredDependenciesImports from './rules/no-undeclared-dependencies-imports.mjs';
import dependencyCycles from './rules/no-dependency-cycles.mjs';
import unmockedLitenviInTest from './rules/no-unmocked-litenvi-in-test.mjs';
import badTestPatterns from './rules/no-bad-test-patterns.mjs';
import undeclaredEntryInTest from './rules/no-undeclared-entry-in-test.mjs';
import unmanagedJs from './rules/no-unmanaged-js.mjs';
import looseDependencySpecs from './rules/no-loose-dependency-specs.mjs';
import silentCatch from './rules/no-silent-catch.mjs';

const plugin = {
 rules: {
 'no-out-of-level-access': outOfLevelAccess,
 'no-wrong-access-level': wrongAccessLevel,
 'no-wrong-access-comment': wrongAccessComment,
 'no-undeclared-dependencies-imports': undeclaredDependenciesImports,
 'no-dependency-cycles': dependencyCycles,
 'no-unmocked-litenvi-in-test': unmockedLitenviInTest,
 'no-bad-test-patterns': badTestPatterns,
 'no-undeclared-entry-in-test': undeclaredEntryInTest,
 'no-unmanaged-js': unmanagedJs,
 'no-loose-dependency-specs': looseDependencySpecs,
 'no-silent-catch': silentCatch,
 },
};

export default plugin;
export {
 outOfLevelAccess,
 wrongAccessLevel,
 wrongAccessComment,
 undeclaredDependenciesImports,
 dependencyCycles,
 unmockedLitenviInTest,
 badTestPatterns,
 undeclaredEntryInTest,
 unmanagedJs,
 looseDependencySpecs,
 silentCatch,
};

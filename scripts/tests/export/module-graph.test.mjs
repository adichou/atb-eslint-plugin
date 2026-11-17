// 通过公开循环依赖规则验证真实 AST 建图，样例代码不会被导入执行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import rule from 'atb-eslint-plugin/rules/no-import-cycles.mjs';
import { t_createFixture } from '../lint-fixture.mjs';
const f_CASES = [
  ['相对导入成环', "import './a.mjs';", ['dependencyCycle']],
  ['包名自引用成环', "export { value } from 'fixture/a';", ['dependencyCycle']],
  ['动态字面量成环', "import('./a.mjs');", ['dependencyCycle']],
  ['字符串不是依赖', 'export const text = "import \\\'./a.mjs\\\'";', []],
  ['注释不是依赖', "// import './a.mjs';\nexport const value = 1;", []],
  ['影子 require 不是依赖', "function operation(require) { return require('./a.mjs'); }", []],
];
for (const [name, other, expected] of f_CASES) {
  /** 场景：依赖边来自真实导入 API，字符串或注释不能伪造成环。 */
  test(name, () => {
    const root = t_createFixture({ 'package.json': JSON.stringify({ name: 'fixture', exports: { './a': './src/a.mjs' } }), 'src/b.mjs': other });
    try {
      const config = [{ files: ['**/*.mjs'], plugins: { atb: { rules: { cycles: rule } } }, rules: { 'atb/cycles': 'error' } }];
      const linter = new Linter({ cwd: root });
      const filename = path.join(root, 'src/a.mjs');
      const source = "export const value = 1; import './b.mjs';";
      assert.deepEqual(linter.verify(source, config, { filename }).map(message => message.messageId), expected, `${name}：应按实际模块边判断`);
      fs.writeFileSync(path.join(root, 'src/b.mjs'), 'export const value = 1;');
      assert.deepEqual(linter.verify(source, config, { filename }), [], '文件改变后不能沿用失效的循环缓存');
    } finally { fs.t_unmock(); }
  });
}

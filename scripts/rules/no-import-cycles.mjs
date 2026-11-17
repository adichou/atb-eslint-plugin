// 以真实 AST 建立本包依赖图，统一相对路径、包名自引用、再导出和静态动态导入。
// 字符串与注释不是依赖。文件内容参与缓存身份，修改文件后立即失效，不污染 globalThis。
// 未知运行时路径不推测；链深上限 80，达到上限明确报告分析受限，不把未证明当通过。
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { i_projectRootOf, i_repoRelative, i_evaluateStaticString } from '../lib/attributions.mjs';
import { i_testSourceTarget, i_walkTestNodes } from '../lib/test-quality-analysis.mjs';

const f_graphs = new WeakMap();

export default {
  meta: {
    type: 'problem', docs: { description: '根据真实 AST 与模块身份检查本包依赖循环，不扫描字符串载荷' },
    schema: [{ type: 'object', properties: {}, additionalProperties: false }],
    messages: {
      dependencyCycle: '依赖循环：{{chain}}；请下沉共同实现到独立模块',
      graphAnalysisFailed: "无法分析依赖 '{{file}}'：{{message}}",
    },
  },
  create(context) {
    const filename = path.resolve(context.filename), root = i_projectRootOf(filename);
    if (!root) return {};
    const parser = context.languageOptions.parser;
    if (!f_graphs.has(parser)) f_graphs.set(parser, new Map());
    const cache = f_graphs.get(parser);
    const source = context.sourceCode;
    const virtualFiles = new Set([filename]);
    // 私有：解析其他模块的真实语法；不执行模块，静态未知的 require 来源不冒认。
    const f_references = file => {
      const text = fs.readFileSync(file, 'utf8');
      const existing = cache.get(file);
      if (existing?.text === text) return existing.references;
      const options = { ecmaVersion: 'latest', sourceType: file.endsWith('.cjs') ? 'commonjs' : 'module', range: true, loc: true, comment: true, tokens: true };
      const ast = parser.parseForESLint ? parser.parseForESLint(text, options).ast : parser.parse(text, options);
      const references = new Set();
      const shadowed = i_walkTestNodes(ast, node => node.type === 'VariableDeclarator' && node.id.name === 'require' || /Function/.test(node.type) && node.params?.some(parameter => parameter.name === 'require'), true);
      i_walkTestNodes(ast, node => {
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type) && node.source?.type === 'Literal') references.add(node.source.value);
        if (!shadowed && node.type === 'CallExpression' && node.callee.name === 'require' && node.arguments[0]?.type === 'Literal') references.add(node.arguments[0].value);
        return false;
      }, true);
      cache.set(file, { text, references });
      return references;
    };
    const f_check = (node, specifier) => {
      const target = i_testSourceTarget(filename, specifier, virtualFiles);
      if (!target || !i_repoRelative(target, root)) return;
      const display = file => i_repoRelative(file, root);
      const visited = new Set();
      // 私有：按每次分析自己的访问集合搜索，避免不同入口之间共享错误结论。
      const f_visit = (file, chain) => {
        if (file === filename) { context.report({ node, messageId: 'dependencyCycle', data: { chain: chain.map(display).join(' → ') } }); return true; }
        if (visited.has(file)) return false;
        if (chain.length > 80) throw new Error('依赖链超过 80 层，需要拆分模块或明确分析范围');
        visited.add(file);
        for (const reference of f_references(file)) {
          const next = i_testSourceTarget(file, reference, virtualFiles);
          if (next && i_repoRelative(next, root) && f_visit(next, [...chain, next])) return true;
        }
        return false;
      };
      try { f_visit(target, [filename, target]); }
      catch (error) { context.report({ node, messageId: 'graphAnalysisFailed', data: { file: display(target), message: error.message } }); }
    };
    return {
      ImportDeclaration(node) { f_check(node, node.source.value); },
      ExportNamedDeclaration(node) { if (node.source) f_check(node, node.source.value); },
      ExportAllDeclaration(node) { f_check(node, node.source.value); },
      ImportExpression(node) { const value = i_evaluateStaticString(node.source, source); if (value.resolved) f_check(node, value.value); },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
        if (source.getScope(node.callee).references.find(reference => reference.identifier === node.callee)?.resolved?.defs.length) return;
        const value = i_evaluateStaticString(node.arguments[0], source);
        if (value.resolved) f_check(node, value.value);
      },
    };
  },
};

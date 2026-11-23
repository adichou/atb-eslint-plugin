// 真实规则检查 Promise 来源和空拒绝回调；不执行受检字符串。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import silent from 'atb-eslint-plugin/rules/no-silent-catch.mjs';
import plugin from 'atb-eslint-plugin';
import { i_qualitySettings } from '../rule-groups.mjs';

const f_CASES = [
  ['构造原生 Promise', 'new Promise(resolve => resolve()).catch(() => {});', true],
  ['resolve 返回 Promise', 'Promise.resolve(value).catch(() => {});', true],
  ['reject 返回 Promise', 'Promise.reject(error).catch(function () {});', true],
  ['空异步拒绝回调', 'Promise.resolve(value).catch(async function ignore() {});', true],
  ['注释不代替错误处理', 'Promise.resolve(value).catch(error => { /* 明确忽略 */ });', true],
  ['标准聚合结果', 'Promise.all(inputs).catch(() => {});', true],
  ['allSettled 结果', 'Promise.allSettled(inputs).catch(() => {});', true],
  ['race 结果', 'Promise.race(inputs).catch(() => {});', true],
  ['any 结果', 'Promise.any(inputs).catch(() => {});', true],
  ['then 返回链', 'Promise.resolve(value).then(convert).catch(() => {});', true],
  ['finally 返回链', 'Promise.resolve(value).finally(cleanup).catch(() => {});', true],
  ['catch 返回链', 'Promise.resolve(value).catch(handle).catch(() => {});', true],
  ['稳定 Promise 变量别名', 'const pending = Promise.resolve(value); const alias = pending; alias.catch(() => {});', true],
  ['构造器别名', 'const P = Promise; new P(resolve => resolve()).catch(() => {});', true],
  ['静态成员的字符串键', 'Promise["resolve"](value)["catch"](() => {});', true],
  ['可选链', 'const pending = Promise.resolve(value); pending?.catch?.(() => {});', true],
  ['本地 async 函数', 'async function run() { return value; } run().catch(() => {});', true],
  ['本地 async 箭头', 'const run = async () => value; run().catch(() => {});', true],
  ['async 函数别名', 'async function run() { return value; } const start = run; start().catch(() => {});', true],
  ['本地 async 对象方法', 'const api = { async run() { return value; } }; api.run().catch(() => {});', true],
  ['原生 fetch 返回 Promise', 'fetch(url).catch(() => {});', true],
  ['空拒绝函数声明引用', 'function ignore(error) {} Promise.resolve(value).catch(ignore);', true],
  ['空拒绝函数稳定别名', 'const ignore = error => {}; const alias = ignore; Promise.resolve(value).catch(alias);', true],
  ['错误重抛', 'Promise.resolve(value).catch(error => { throw error; });', false],
  ['错误记录', 'Promise.resolve(value).catch(error => { console.error(error); });', false],
  ['恢复结果', 'Promise.resolve(value).catch(error => ({ error }));', false],
  ['非空语句保留现有判定', 'Promise.resolve(value).catch(() => { return; });', false],
  ['未提供拒绝回调仍传播拒绝', 'Promise.resolve(value).catch();', false],
  ['非函数参数仍传播拒绝', 'Promise.resolve(value).catch(null);', false],
  ['普通同名 catch 方法', 'const other = { catch(callback) {} }; other.catch(() => {});', false],
  ['影子 Promise 不能冒认原生', 'function run(Promise) { Promise.resolve(value).catch(() => {}); }', false],
  ['局部 Promise 对象不能冒认原生', 'const Promise = { resolve() { return other; } }; Promise.resolve(value).catch(() => {});', false],
  ['影子 fetch 不冒认原生', 'function fetch() { return other; } fetch(url).catch(() => {});', false],
  ['未知工厂返回值不猜测', 'external().catch(() => {});', false],
  ['普通同步返回对象不猜成 Promise', 'function run() { return other; } run().catch(() => {});', false],
  ['异步生成器返回迭代器而非 Promise', 'async function* run() { yield value; } run().catch(() => {});', false],
  ['withResolvers 返回对象不当成 Promise', 'Promise.withResolvers().catch(() => {});', false],
  ['可写别名不沿用过期来源', 'let pending = Promise.resolve(value); pending = other; pending.catch(() => {});', false],
  ['循环别名不造成递归溢出', 'const a = b; const b = a; a.catch(() => {});', false],
  ['未知拒绝回调不猜成空函数', 'Promise.resolve(value).catch(handle);', false],
];

for (const [name, code, invalid] of f_CASES) {
  /** 场景：按 Promise 与回调的真实可确认来源识别空拒绝处理。 */
  test(name, function testPromiseCatchCase() {
    const actual = new Linter().verify(code, [{ plugins: { atb: { rules: { silent } } }, rules: { 'atb/silent': 'error' } }]);
    assert.deepEqual(actual.map(item => item.messageId), invalid ? ['swallowedPromiseError'] : [], `${name}：应准确判断是否为空拒绝处理`);
    for (const item of actual) assert.ok(item.line > 0 && item.column > 0, '诊断应指向吞错代码');
  });
}

/** 场景：两条规则同时启用时，两种吞错都由统一规则各报告一次。 */
test('吞错诊断统一归属且不重复', function testSingleErrorOwner() {
  const actual = new Linter().verify('try { run(); } catch {} Promise.resolve(value).catch(() => {});', [{
    plugins: { atb: plugin, extra: { rules: { silent } } }, rules: { ...i_qualitySettings(), 'extra/silent': 'error' },
  }]);
  assert.deepEqual(actual.map(item => [item.ruleId, item.messageId]), [['extra/silent', 'swallowedError'], ['extra/silent', 'swallowedPromiseError']], '吞错不应在测试质量规则中重复报告');
});

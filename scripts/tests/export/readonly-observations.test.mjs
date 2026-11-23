// 观察接口按契约标为只读；真实 Linter 分析代码，不执行业务字符串或修改真实账本。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'litenvi-node/lite-fs.mjs';
import { Linter } from 'eslint';
import boundaries from 'atb-eslint-plugin/rules/no-observation-data-write-in-test.mjs';
import { i_createFixture } from '../lint-fixture.mjs';

const f_IMPORTS = "import cp from 'litenvi-node/lite-child_process.mjs'; import server from 'litenvi-node/lite-server.mjs'; import { liteProcess as proc } from 'litenvi-node/lite-process.mjs'; import mgr from 'litenvi-node/lite-cmd-mgr.mjs';\n";
const f_CASES = [
  ['读取请求和调用记录', 'const requests = server.t_requests(); const calls = cp.t_calls(); console.log(requests[0]?.status, calls.length);', false],
  ['读取其他观察契约', 'console.log(proc.t_exitCodes().length, mgr.t_defined().includes("node"));', false],
  ['普通同名接口不冒认', 'const fake = { t_calls() { return []; }, t_requests() { return []; } }; fake.t_calls().pop(); fake.t_requests().push(1);', false],
  ['参数遮蔽真实模块不冒认', 'function f_use(cp) { cp.t_calls().pop(); } f_use({ t_calls() { return []; } });', false],
  ['未登记模块不冒认观察接口', 'import other from "other"; other.t_calls().pop();', false],
  ['环境装配输入保持可写', 'const options = { args: [] }; options.args.push("x"); cp.t_mock(options);', false],
  ['普通记录保持可写', 'const records = [{ status: 0 }]; records[0].status = 200; records.pop();', false],
  ['原始输入不因传给门面而变为观察数据', 'const args = ["x"]; cp.spawnSync("node", args); args[0] = "changed";', false],
  ['观察变量重新绑定不是修改账本', 'let calls = cp.t_calls(); calls = []; calls.push(1);', false],
  ['观察值派生的计数可重新赋值', 'let count = cp.t_calls().length; count++;', false],
  ['map 产生独立数据', 'const names = cp.t_calls().map(call => call.command); names.sort();', false],
  ['map 新对象的自身字段可写', 'const rows = cp.t_calls().map(call => ({ label: call.command })); rows[0].label = "changed";', false],
  ['显式浅复制的新数组容器可写', 'const copy = [...cp.t_calls()]; copy.pop();', false],
  ['Object assign 新容器自身字段可写', 'const record = Object.assign({}, cp.t_calls()[0]); record.command = "changed";', false],
  ['深复制的新数据可写', 'const copy = structuredClone(cp.t_calls()); copy[0].args.push("new");', false],
  ['同文件读取 helper 保持可用', 'function f_read(records) { return records.length; } console.log(f_read(cp.t_calls()));', false],
  ['同名全局工具被遮蔽时不冒认', 'const Object = { assign() {} }; Object.assign(cp.t_calls(), {});', false],
  ['借用观察数组的方法修改独立数组', 'const remove = cp.t_calls().pop; remove.call([]);', false],
  ['原型写入方法只修改独立数组', 'Array.prototype.push.call([], cp.t_calls()[0]);', false],
  ['Array from 复制的新容器可写', 'const copy = Array.from(cp.t_calls()); copy.pop();', false],
  ['rest 产生的新数组容器可写', 'const [...copy] = cp.t_calls(); copy.push({});', false],
  ['未调用 helper 不向主流程注入观察数据', 'const box = { records: [] }; function f_prepare() { box.records = cp.t_calls(); } { console.log("step"); } box.records.pop();', false],
  ['pop 调用账本副本', 'cp.t_calls().pop();', true],
  ['修改请求记录字段', 'server.t_requests()[0].status = 200;', true],
  ['修改调用参数字段', 'cp.t_calls()[0].args[0] = "fake";', true],
  ['修改调用选项字段', 'cp.t_calls()[0].options.cwd = "/fake";', true],
  ['修改退出码记录', 'proc.t_exitCodes().push(0);', true],
  ['修改注册状态记录', 'mgr.t_defined().sort();', true],
  ['API 方法别名仍识别', 'const { t_calls: read } = cp; read().splice(0, 1);', true],
  ['API bind 别名仍识别', 'const read = cp.t_calls.bind(cp); read().pop();', true],
  ['API call 仍识别', 'cp.t_calls.call(cp).pop();', true],
  ['普通别名仍只读', 'const calls = cp.t_calls(); const alias = calls; alias[0].command = "fake";', true],
  ['先声明后赋值的别名仍只读', 'let calls; calls = cp.t_calls(); calls.pop();', true],
  ['数组解构记录仍只读', 'const [first] = cp.t_calls(); first.args[0] = "fake";', true],
  ['对象解构嵌套参数仍只读', 'const [{ args: parameters }] = cp.t_calls(); parameters.push("fake");', true],
  ['对象属性中的观察引用仍只读', 'const box = { calls: cp.t_calls() }; box.calls.pop();', true],
  ['解构赋值写入观察成员', 'const calls = cp.t_calls(); [calls[0].command] = ["fake"];', true],
  ['删除观察字段', 'const calls = cp.t_calls(); delete calls[0].command;', true],
  ['自增观察字段', 'server.t_requests()[0].status++;', true],
  ['复合赋值观察字段', 'server.t_requests()[0].status += 1;', true],
  ['逻辑赋值观察字段', 'server.t_requests()[0].status ||= 200;', true],
  ['未知键写入仍可确认接收者只读', 'const first = cp.t_calls()[0]; first[getKey()] = "fake";', true],
  ['同文件 helper 参数写入', 'function f_change(records) { records[0].command = "fake"; } f_change(cp.t_calls());', true],
  ['箭头 helper 参数写入', 'const f_change = records => records.pop(); f_change(cp.t_calls());', true],
  ['helper 解构参数写入', 'function f_change([first]) { first.options.cwd = "/fake"; } f_change(cp.t_calls());', true],
  ['helper 返回观察引用', 'function f_first(records) { return records[0]; } f_first(cp.t_calls()).command = "fake";', true],
  ['helper 返回闭包保留只读身份', 'function f_build(records) { return () => records.pop(); } const change = f_build(cp.t_calls()); change();', true],
  ['forEach 回调参数仍只读', 'cp.t_calls().forEach(call => { call.command = "fake"; });', true],
  ['map 回调参数仍只读', 'cp.t_calls().map(call => { call.args.pop(); return call.command; });', true],
  ['回调第三参数仍是原观察数组', 'cp.t_calls().map((call, index, records) => { records.pop(); return call; });', true],
  ['filter 后共享记录仍只读', 'const filtered = cp.t_calls().filter(call => call.command === "node"); filtered[0].args.push("fake");', true],
  ['find 返回记录仍只读', 'const found = server.t_requests().find(record => record.status === 500); found.status = 200;', true],
  ['at 返回记录仍只读', 'cp.t_calls().at(0).command = "fake";', true],
  ['浅复制只解除新容器的可写限制', 'const copy = [...cp.t_calls()]; copy[0].command = "fake";', true],
  ['slice 后共享记录仍只读', 'const copy = cp.t_calls().slice(); copy[0].args.pop();', true],
  ['map 返回原记录仍只读', 'const copy = cp.t_calls().map(call => call); copy[0].command = "fake";', true],
  ['map 新对象的共享字段仍只读', 'const copy = cp.t_calls().map(call => ({ args: call.args })); copy[0].args.push("fake");', true],
  ['对象展开保留嵌套共享引用', 'const record = { ...cp.t_calls()[0] }; record.args.push("fake");', true],
  ['Object assign 修改观察对象', 'Object.assign(cp.t_calls()[0], { command: "fake" });', true],
  ['Object defineProperty 修改观察对象', 'Object.defineProperty(cp.t_calls()[0], "command", { value: "fake" });', true],
  ['Object defineProperties 修改观察对象', 'Object.defineProperties(cp.t_calls()[0], { command: { value: "fake" } });', true],
  ['Reflect set 修改观察对象', 'Reflect.set(cp.t_calls()[0], "command", "fake");', true],
  ['Reflect deleteProperty 修改观察对象', 'Reflect.deleteProperty(cp.t_calls()[0], "command");', true],
  ['Object 写入方法别名', 'const write = Object.assign; write(cp.t_calls()[0], { command: "fake" });', true],
  ['提取修改方法不能绕过', 'const calls = cp.t_calls(); const remove = calls.pop; remove();', true],
  ['原型方法 call 不能绕过', 'Array.prototype.pop.call(cp.t_calls());', true],
  ['原型方法 apply 不能绕过', 'Array.prototype.splice.apply(cp.t_calls(), [0, 1]);', true],
  ['原型方法 bind 不能绕过', 'const remove = Array.prototype.pop.bind(cp.t_calls()); remove();', true],
  ['Reflect apply 不能绕过', 'Reflect.apply(Array.prototype.pop, cp.t_calls(), []);', true],
  ['深层嵌套 args 数组仍只读', 'const box = { records: cp.t_calls() }; const { records: [first] } = box; first.args.fill("fake");', true],
  ['观察数组 for of 元素仍只读', 'for (const call of cp.t_calls()) { call.command = "fake"; }', true],
  ['命名空间导入定位默认接口', 'import * as module from "litenvi-node/lite-child_process.mjs"; module.default.t_calls().pop();', true],
  ['静态动态导入定位观察接口', 'const { default: child } = await import("litenvi-node/lite-child_process.mjs"); child.t_calls().pop();', true],
  ['静态 require 定位观察接口', 'const { default: child } = require("litenvi-node/lite-child_process.mjs"); child.t_calls().pop();', true],
  ['分支赋值合并只读来源', 'let records = []; if (flag) records = cp.t_calls(); records.pop();', true],
  ['helper 写入外层变量保留来源', 'let records; function f_load() { records = cp.t_calls(); } f_load(); records.pop();', true],
  ['helper 分支返回保留来源', 'function f_first(records) { if (flag) return records[0]; return {}; } f_first(cp.t_calls()).command = "fake";', true],
  ['观察嵌套未知字段的修改方法', 'server.t_requests()[0].body.parts.push("fake");', true],
  ['Array from 的共享元素只读', 'Array.from(cp.t_calls())[0].command = "fake";', true],
  ['rest 数组的共享元素只读', 'const [...copy] = cp.t_calls(); copy[0].command = "fake";', true],
  ['可写容器存放观察引用仍只读', 'const copy = []; copy.push(cp.t_calls()[0]); copy[0].args.pop();', true],
  ['迭代器返回的共享元素仍只读', 'for (const [index, call] of cp.t_calls().entries()) { call.command = "fake"; }', true],
  ['循环体中的观察写入', 'for (let index = 0; index < 1; index++) { cp.t_calls()[index].command = "fake"; }', true],
  ['浅复制未知嵌套字段仍共享只读引用', 'const options = { ...cp.t_calls()[0].options }; options.env.KEY = "fake";', true],
  ['assign 复制未知嵌套字段仍共享只读引用', 'const record = Object.assign({}, server.t_requests()[0]); record.response.headers.KEY = "fake";', true],
  ['动态导入常量来源仍可确认', 'const name = "litenvi-node/lite-child_process.mjs"; const { default: child } = await import(name); child.t_calls().pop();', true],
  ['门面装配返回公共门面仍可追踪', 'cp.t_mock().t_calls().pop();', true],
  ['未调用 helper 不能清除主流程的观察来源', 'let records = cp.t_calls(); function f_clear() { records = []; } { console.log("step"); } records.pop();', true],
  ['未调用函数内的直接观察写入仍报告', 'function f_change() { cp.t_calls().pop(); }', true],
];

for (const [name, code, invalid] of f_CASES) {
  /** 场景：按登记来源追踪共享观察数据，仅阻止对该数据的修改。 */
  test(name, function test_readonly_observations_name() {
    const root = i_createFixture({ 'package.json': '{"name":"fixture","type":"module"}' });
    try {
      const actual = new Linter({ cwd: root }).verify(f_IMPORTS + code, [{
        files: ['**/*.mjs'],
        plugins: { atb: { rules: { boundaries } } },
        rules: { 'atb/boundaries': 'error' },
      }], { filename: path.join(root, 'scripts/tests/export/readonly.test.mjs') });
      assert.deepEqual(actual.map(message => message.messageId), invalid ? ['observationMutation'] : [], name + '应按契约和共享关系判断：' + JSON.stringify(actual));
      for (const message of actual) assert.ok(message.line > 0 && message.column > 0, '诊断应定位到实际修改操作');
    } finally { fs.t_unmock(); }
  });
}

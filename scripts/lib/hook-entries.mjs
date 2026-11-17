// AI Agent hook 入口事实：只读取指定目录的 JSON，不执行配置中的命令。
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { i_testCommandWords } from './test-entry-analysis.mjs';

// 私有：按完整目录段确认目标在项目内。
function f_inside(root, target) {
  const relative = path.relative(root, target);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

// 私有：只展开宿主声明的插件根变量，未知环境变量不猜测。
function f_expand(value, root) {
  const expanded = value.replace(/\$\{(?:ZCODE_|CLAUDE_|CODEX_)?PLUGIN_ROOT\}|\$(?:ZCODE_|CLAUDE_|CODEX_)?PLUGIN_ROOT\b/g, () => root);
  if (expanded.includes('$')) throw new Error(`hook 命令包含无法解析的环境变量：${value}`);
  return expanded;
}

// 私有：提取本地命令文件；外部裸命令不作为本项目脚本入口。
function f_script(words, root) {
  const [command, ...args] = words;
  if (!command) throw new Error('hook 命令不能为空');
  const interpreter = ['node', 'node.exe', 'bash', 'sh', 'zsh', 'python', 'python3'].includes(path.basename(command));
  let at = 0;
  if (interpreter) {
    while (args[at]?.startsWith('-')) {
      const option = args[at++];
      if (['-e', '--eval', '-p', '--print', '-c', '-m'].includes(option)) throw new Error('hook 必须声明命令文件，不能使用内联脚本或模块名');
      if (['--import', '--require', '-r', '--loader', '--conditions'].includes(option)) at++;
      if (option === '--') break;
    }
  }
  const input = interpreter ? args[at] : command;
  if (!input) throw new Error('hook 命令缺少脚本文件');
  const expanded = f_expand(input, root);
  const target = path.resolve(root, expanded);
  if (!interpreter && !/[./\\]/.test(input) && !fs.existsSync(target)) return null;
  if (!f_inside(root, target)) throw new Error(`hook 命令文件超出项目：${input}`);
  if (!fs.statSync(target).isFile()) throw new Error(`hook 命令目标不是文件：${input}`);
  if (!f_inside(fs.realpathSync(root), fs.realpathSync(target))) throw new Error(`hook 命令文件通过软链接越出项目：${input}`);
  return target;
}

// 内部：hooksDir 缺省关闭；配置路径相对包根，返回 JSON 守护条目与命令文件集合。
export function i_hookEntries(root, hooksDir = '') {
  const scripts = new Set(), configs = [];
  if (!hooksDir) return { scripts, configs };
  const directory = path.resolve(root, hooksDir);
  if (path.isAbsolute(hooksDir) || !f_inside(root, directory) || directory === root) throw new Error('hooksDir 必须是项目内的相对目录，不能是绝对路径、项目根或越界路径');
  if (!f_inside(fs.realpathSync(root), fs.realpathSync(directory))) throw new Error('hooksDir 不能通过软链接越出项目');
  // 私有：只从 hook handler 的 type/command/args 读取入口，其他同名元数据不作为命令。
  function f_handlers(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'command' || value.type === 'process') {
      let words;
      if (value.type === 'process') {
        if (typeof value.command !== 'string' || !Array.isArray(value.args) || value.args.some(arg => typeof arg !== 'string')) throw new Error('process hook 需要 command 字符串与 args 字符串数组');
        words = [value.command, ...value.args];
      } else words = i_testCommandWords(value.command);
      if (!words) throw new Error('hook command 必须是可静态解析的简单命令，不支持 shell 复合语句');
      const target = f_script(words, root);
      if (target) scripts.add(target);
      return;
    }
    for (const item of Object.values(value)) f_handlers(item);
  }
  // 私有：递归读取 JSON，隐藏项和 node_modules 不纳入；不沿目录软链接越界扫描。
  function f_walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) f_walk(file);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (!data?.hooks || typeof data.hooks !== 'object') throw new Error('配置必须包含 hooks 对象');
          configs.push({ config: path.relative(root, file).split(path.sep).join('/'), fields: ['hooks'] });
          f_handlers(data.hooks);
        } catch (error) { throw new Error(`hook 配置 ${path.relative(root, file)}：${error.message}`, { cause: error }); }
      }
    }
  }
  f_walk(directory);
  return { scripts, configs };
}

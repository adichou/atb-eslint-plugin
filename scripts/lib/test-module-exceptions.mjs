// 测试原生模块例外的共享契约：精确文件、明确模块与可审查的用途说明。
// 与黑名单（deniedModules）是两个独立参数——本契约只做「按文件放行」，极性不混叠。
import path from 'node:path';
import { builtinModules } from 'node:module';

const f_BUILTINS = new Set(builtinModules);

// 内部：导入黑名单与测试入口规则共用同一例外结构。
export const i_testModuleExceptionsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      file: { type: 'string', minLength: 1 },
      modules: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', pattern: '\\S' } },
      reason: { type: 'string', pattern: '\\S' },
    },
    required: ['file', 'modules', 'reason'],
    additionalProperties: false,
  },
};

// 内部：裸内置名与 node 前缀采用同一身份，保留包名与模块子路径。
export function i_normalizeTestModule(specifier) {
  if (specifier.startsWith('node:')) return specifier;
  const head = specifier.split('/')[0];
  return !specifier.startsWith('@') && f_BUILTINS.has(head) ? `node:${specifier}` : specifier;
}

// 内部：只接受测试目录内的具体代码文件，不允许绝对路径、越界或 glob。
export function i_validModuleExceptionFile(testDir, file) {
  const relative = path.relative(testDir, path.resolve(testDir, file));
  return !path.isAbsolute(file) && !/[\\*?\[\]{}!:()]/.test(file)
    && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative) && /\.[cm]?js$/.test(relative);
}

// 内部：只授权同一文件中明确列出的模块及子路径，不扩大到其他环境能力。
export function i_moduleExceptionAllows(entries, testDir, filename, specifier) {
  const target = i_normalizeTestModule(specifier);
  return entries.some(item => path.resolve(testDir, item.file) === filename
    && item.modules.some(module => {
      const allowed = i_normalizeTestModule(module);
      return target === allowed || target.startsWith(`${allowed}/`);
    }));
}

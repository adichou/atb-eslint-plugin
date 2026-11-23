// ESLint 规则测试共用的内存项目装配；每个项目使用独立路径，避免规则缓存串用。
import fs from 'litenvi-node/lite-fs.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const f_SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
let f_sequence = 0;

// 内部：源码留在真实文件系统，夹具全部落入内存卷；调用方在 finally 中 t_unmock。
export function i_createFixture(files = {}) {
  fs.t_unmock();
  fs.t_mock({ exclude: [f_SOURCE_ROOT] });
  const root = `/atb-eslint-fixtures/${process.pid}-${++f_sequence}`;
  try {
    fs.mkdirSync(root, { recursive: true });
    for (const [relative, content] of Object.entries(files)) {
      const full = path.join(root, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return root;
  } catch (error) {
    fs.t_unmock();
    throw error;
  }
}

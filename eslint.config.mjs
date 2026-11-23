// 本仓自检复用公共配置工厂，JSON parser 和清单规则由工厂固定接线。
import { createConfig as createLayoutConfig } from './scripts/config.mjs';

export function createConfig() {
  return createLayoutConfig();
}

export default createConfig();

import type { OpencodeAPI } from '../types/opencode.js';
import plugin from './index.js';

export default function stackControlOpencodePlugin(api: OpencodeAPI) {
  return plugin(api);
}

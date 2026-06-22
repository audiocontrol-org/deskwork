import type { OpencodeAPI, Plugin } from '../../types/opencode.js';
import { createPlugin } from './plugin.js';

export default function plugin(api: OpencodeAPI): Plugin {
  const pluginState = createPlugin(api);
  
  const initialize = async (): Promise<void> => {
    await pluginState.initialize();
  };
  
  const onCommand = async (event: { command: string }): Promise<void> => {
    await pluginState.handleCommand(event as any);
  };
  
  void initialize();
  
  return {
    name: 'stack-control',
    version: '0.1.0',
    skills: pluginState.skills,
    onCommand,
  };
}

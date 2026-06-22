import type { OpencodeAPI, Skill, CommandEvent } from '../../types/opencode.js';
import { invokeCLI, formatCLIOutput, checkCLIAvailable } from './cli.js';
import { skills, findSkill, parseSkillCommand } from './skills.js';

export interface PluginState {
  cliAvailable: boolean;
  cliError: string | null;
  skills: Skill[];
}

export function createPlugin(api: OpencodeAPI): PluginState {
  const { $ } = api;
  
  const state: PluginState = {
    cliAvailable: false,
    cliError: null,
    skills: [],
  };
  
  const initialize = async (): Promise<void> => {
    const available = await checkCLIAvailable($);
    state.cliAvailable = available;
    
    if (!available) {
      state.cliError = 'stackctl CLI not found. Skills will fail until CLI is installed.';
    }
    
    state.skills = skills;
  };
  
  const handleCommand = async (event: CommandEvent): Promise<void> => {
    const command = event.command;
    
    if (!command.startsWith('/stack-control:')) {
      return;
    }
    
    const parsed = parseSkillCommand(command);
    if (!parsed) {
      api.log(`Invalid command format: ${command}`);
      return;
    }
    
    const { skill, args } = parsed;
    const skillObj = findSkill(skill);
    
    if (!skillObj) {
      api.error(`Unknown skill: ${skill}`);
      return;
    }
    
    if (!state.cliAvailable && state.cliError) {
      api.error(state.cliError);
      return;
    }
    
    const result = await invokeCLI(skill, args, $);
    const output = formatCLIOutput(result);
    
    api.log(output);
  };
  
  return {
    ...state,
    initialize,
    handleCommand,
  };
}

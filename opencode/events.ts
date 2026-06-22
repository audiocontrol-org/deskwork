import type { OpencodeAPI, CommandEvent } from '../../types/opencode.js';
import { parseSkillCommand, findSkill } from './skills.js';
import { invokeCLI, formatCLIOutput } from './cli.js';

export async function handleCommandEvent(event: CommandEvent, api: OpencodeAPI): Promise<void> {
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
  
  const result = await invokeCLI(skill, args, api.$);
  const output = formatCLIOutput(result);
  
  api.log(output);
}

import type { Skill } from '../../types/opencode.js';

export const skills: Skill[] = [
  {
    name: 'define',
    command: '/stack-control:define',
    description: 'Define a new feature using the stack-control workflow',
    handler: async (args: string[]) => {
      const commandArgs = ['define', ...args];
      return commandArgs.join(' ');
    },
  },
  {
    name: 'extend',
    command: '/stack-control:extend',
    description: 'Extend a feature mid-implementation',
    handler: async (args: string[]) => {
      const commandArgs = ['extend', ...args];
      return commandArgs.join(' ');
    },
  },
  {
    name: 'execute',
    command: '/stack-control:execute',
    description: 'Execute a feature implementation',
    handler: async (args: string[]) => {
      const commandArgs = ['execute', ...args];
      return commandArgs.join(' ');
    },
  },
  {
    name: 'workflow',
    command: '/stack-control:workflow',
    description: 'Manage workflow state',
    handler: async (args: string[]) => {
      const commandArgs = ['workflow', ...args];
      return commandArgs.join(' ');
    },
  },
  {
    name: 'roadmap',
    command: '/stack-control:roadmap',
    description: 'Manage roadmap state',
    handler: async (args: string[]) => {
      const commandArgs = ['roadmap', ...args];
      return commandArgs.join(' ');
    },
  },
];

export function findSkill(command: string): Skill | undefined {
  return skills.find((skill) => skill.command === command);
}

export function parseSkillCommand(fullCommand: string): { skill: string; args: string[] } | null {
  const prefix = '/stack-control:';
  if (!fullCommand.startsWith(prefix)) {
    return null;
  }
  
  const rest = fullCommand.slice(prefix.length);
  const parts = rest.split(' ').filter(Boolean);
  
  if (parts.length === 0) {
    return { skill: '', args: [] };
  }
  
  const skill = parts[0];
  const args = parts.slice(1);
  
  return { skill, args };
}

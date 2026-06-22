// Types for skill routing
export interface SkillRoute {
  name: string;
  commandPrefix: string;
  handler: (args: string[]) => Promise<string>;
}

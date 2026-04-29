import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_RELATIVE_PATH, defaultConfig } from '../config.js';

export async function install(args: string[]): Promise<void> {
  const projectRoot = args[0] ?? process.cwd();
  const configDir = join(projectRoot, '.dw-lifecycle');
  const configPath = join(configDir, 'config.json');

  if (existsSync(configPath)) {
    console.error(`Config already exists at ${configPath}. Refusing to overwrite.`);
    process.exit(1);
  }

  mkdirSync(configDir, { recursive: true });

  const config = defaultConfig();
  // The install skill is responsible for the interactive probe + operator confirmation
  // before this is called. The bin just writes the agreed-upon config.
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({ configPath, config }, null, 2));
}

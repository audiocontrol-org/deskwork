import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { ConfigSchema, type Config } from './config.types.js';

export const CONFIG_RELATIVE_PATH = '.dw-lifecycle/config.json';

export function validateConfig(raw: unknown): Config {
  try {
    return ConfigSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const messages = err.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      });
      throw new Error(messages.join('\n'));
    }
    throw err;
  }
}

export function defaultConfig(): Config {
  return ConfigSchema.parse({ version: 1 });
}

export function loadConfig(projectRoot: string): Config {
  const path = join(projectRoot, CONFIG_RELATIVE_PATH);
  if (!existsSync(path)) {
    throw new Error(
      `No ${CONFIG_RELATIVE_PATH} found at ${projectRoot}. Run /dw-lifecycle:install first.`
    );
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return validateConfig(raw);
}

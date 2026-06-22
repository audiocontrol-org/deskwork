import type { ShellAPI } from '../../types/opencode.js';

export async function getPluginVersion(): Promise<string> {
  try {
    const response = await fetch(new URL('../package.json', import.meta.url));
    const packageJson = (await response.json()) as { version: string };
    return packageJson.version;
  } catch {
    return 'unknown';
  }
}

export async function getCLIVersion($: ShellAPI): Promise<string | null> {
  const result = await $('/usr/bin/env stackctl --version');
  
  if (result.exitCode !== 0) {
    return null;
  }
  
  return result.stdout.trim();
}

export async function checkVersionMatch($: ShellAPI): Promise<boolean> {
  const pluginVersion = await getPluginVersion();
  const cliVersion = await getCLIVersion($);
  
  if (!cliVersion || pluginVersion === 'unknown') {
    return false;
  }
  
  return pluginVersion === cliVersion;
}

import { dispatchReleaseHelper } from '../release/helpers.js';

export async function runReleaseHelperCli(args: string[]): Promise<void> {
  const code = await dispatchReleaseHelper(args);
  process.exit(code);
}

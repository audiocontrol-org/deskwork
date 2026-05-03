import { repoRoot } from '../repo.js';
import { copyTemplateOverride } from '../templates.js';

export async function customize(args: string[]): Promise<void> {
  const category = args[0];
  const name = args[1];

  if (!category || !name || args.length !== 2) {
    throw new Error('Usage: dw-lifecycle customize templates <name>');
  }
  if (category !== 'templates') {
    throw new Error('Only "templates" is supported today. Usage: dw-lifecycle customize templates <name>');
  }

  const root = repoRoot();
  const destination = copyTemplateOverride(root, name);
  console.log(JSON.stringify({ category, name, destination, customized: true }, null, 2));
}

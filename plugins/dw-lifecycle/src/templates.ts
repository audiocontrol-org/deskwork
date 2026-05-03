import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BUILTIN_TEMPLATES_DIR = join(__dirname, '..', 'templates');
const PROJECT_TEMPLATES_DIR = '.dw-lifecycle/templates';

export const CUSTOMIZABLE_TEMPLATES = ['journal-entry'] as const;
export type CustomizableTemplate = (typeof CUSTOMIZABLE_TEMPLATES)[number];

function isCustomizableTemplate(name: string): name is CustomizableTemplate {
  return (CUSTOMIZABLE_TEMPLATES as readonly string[]).includes(name);
}

export function listCustomizableTemplates(): string[] {
  return [...CUSTOMIZABLE_TEMPLATES];
}

export function builtinTemplatePath(name: CustomizableTemplate): string {
  return join(BUILTIN_TEMPLATES_DIR, `${name}.md`);
}

export function projectTemplatePath(projectRoot: string, name: CustomizableTemplate): string {
  return join(projectRoot, PROJECT_TEMPLATES_DIR, `${name}.md`);
}

export function resolveTemplatePath(projectRoot: string, name: CustomizableTemplate): string {
  const overridePath = projectTemplatePath(projectRoot, name);
  return existsSync(overridePath) ? overridePath : builtinTemplatePath(name);
}

export function copyTemplateOverride(projectRoot: string, name: string): string {
  if (!isCustomizableTemplate(name)) {
    throw new Error(
      `Unknown template "${name}". Customizable templates: ${listCustomizableTemplates().join(', ')}`
    );
  }

  const source = builtinTemplatePath(name);
  if (!existsSync(source)) {
    const builtins = readdirSync(BUILTIN_TEMPLATES_DIR)
      .filter((entry) => entry.endsWith('.md'))
      .sort()
      .join(', ');
    throw new Error(`Built-in template missing for "${name}". Available markdown templates: ${builtins}`);
  }

  const destination = projectTemplatePath(projectRoot, name);
  if (existsSync(destination)) {
    throw new Error(`Template override already exists: ${destination}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return destination;
}

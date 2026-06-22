#!/usr/bin/env tsx

import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const pluginPath = join(__dirname, 'opencode-plugin.ts');
const opencodePluginsDir = join(process.env.HOME || '', '.opencode', 'plugins');
const opencodePluginFile = join(opencodePluginsDir, 'stack-control.ts');

console.log('Verifying stack-control opencode plugin installation...\n');

let allChecksPass = true;

// Check 1: Plugin file exists
if (existsSync(pluginPath)) {
  console.log('✓ Plugin file exists at:', pluginPath);
} else {
  console.log('✗ Plugin file NOT found at:', pluginPath);
  allChecksPass = false;
}

// Check 2: opencode plugins directory exists
if (existsSync(opencodePluginsDir)) {
  console.log('✓ opencode plugins directory exists at:', opencodePluginsDir);
} else {
  console.log('✗ opencode plugins directory NOT found at:', opencodePluginsDir);
  console.log('  Create it with: mkdir -p ~/.opencode/plugins');
  allChecksPass = false;
}

// Check 3: Plugin installed in opencode
if (existsSync(opencodePluginFile)) {
  console.log('✓ Plugin installed at:', opencodePluginFile);
} else {
  console.log('✗ Plugin NOT installed at:', opencodePluginFile);
  console.log('  Install with: cp plugins/stack-control/opencode-plugin.ts ~/.opencode/plugins/stack-control.ts');
  allChecksPass = false;
}

// Check 4: Plugin exports function
try {
  const pluginModule = await import(pluginPath);
  if (typeof pluginModule.default === 'function') {
    console.log('✓ Plugin exports default function');
  } else {
    console.log('✗ Plugin does NOT export default function');
    allChecksPass = false;
  }
} catch (error) {
  console.log('✗ Error importing plugin:', error);
  allChecksPass = false;
}

console.log('\n' + (allChecksPass ? '✓ All checks passed!' : '✗ Some checks failed'));

process.exit(allChecksPass ? 0 : 1);

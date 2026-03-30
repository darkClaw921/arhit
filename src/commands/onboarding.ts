import readline from 'node:readline';
import { configPath, readJson, writeJson, ensureArhitDir, isInitialized } from '../storage.js';
import type { ArhitConfig } from '../types.js';

function ask(rl: readline.Interface, question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

export async function onboardingCommand(options: { human?: boolean }) {
  if (!isInitialized()) {
    ensureArhitDir();
  }

  const existing = readJson<ArhitConfig>(configPath()) || {
    name: '',
    sourcePaths: ['src'],
    ignore: ['node_modules', 'dist', '.arhit', '.git'],
    language: 'typescript',
  };

  if (!options.human) {
    // Agent mode: output current config for agent to modify
    console.log(JSON.stringify({
      status: 'onboarding',
      message: 'Update config via `arhit config set <key> <value>` or provide full config JSON',
      currentConfig: existing,
    }));
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n=== Arhit Onboarding ===\n');

  const name = await ask(rl, 'Project name', existing.name);
  const srcInput = await ask(rl, 'Source paths (comma-separated)', existing.sourcePaths.join(','));
  const sourcePaths = srcInput.split(',').map(s => s.trim()).filter(Boolean);
  const ignoreInput = await ask(rl, 'Ignore patterns (comma-separated)', existing.ignore.join(','));
  const ignore = ignoreInput.split(',').map(s => s.trim()).filter(Boolean);
  const language = await ask(rl, 'Language', existing.language);
  const framework = await ask(rl, 'Framework (optional)', existing.framework);

  rl.close();

  const config: ArhitConfig = { name, sourcePaths, ignore, language, framework: framework || undefined };
  writeJson(configPath(), config);

  console.log('\nConfiguration saved to .arhit/config.json');
  console.log('Next steps:');
  console.log('  arhit arch build    — Build architecture map');
  console.log('  arhit analyze       — Analyze dependencies');
}

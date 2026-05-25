#!/usr/bin/env node
declare const PKG_VERSION: string;
import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { onboardingCommand } from './commands/onboarding.js';
import { archBuildCommand, archShowCommand } from './commands/arch.js';
import { analyzeCommand, depsCommand, callsCommand, mapCommand } from './commands/analyze.js';
import { docAddCommand, docShowCommand, docListCommand, docCreateCommand, docSearchCommand, docAliasCommand, docCoverageCommand, docStaleCommand } from './commands/doc.js';
import { uiStartCommand, uiStopCommand, uiStatusCommand } from './commands/ui.js';
import { contextCommand } from './commands/context.js';
import { explainCommand } from './commands/explain.js';
import { searchCommand } from './commands/search.js';

const program = new Command();

program
  .name('arhit')
  .description('CLI for code architecture and documentation — for AI agents and humans')
  .version(PKG_VERSION)
  .option('-H, --human', 'Human-readable output mode');

// Init
program
  .command('init')
  .description('Initialize .arhit/ in the current project')
  .action(() => {
    startCommand({ human: program.opts().human });
  });

// Onboarding
program
  .command('onboarding')
  .description('Interactive setup wizard')
  .action(async () => {
    await onboardingCommand({ human: program.opts().human });
  });

// Architecture
const arch = program
  .command('arch')
  .description('Architecture commands');

arch
  .command('build')
  .description('Scan source code and build architecture graph')
  .option('--seed-docs', 'Seed documentation from JSDoc/docstring comments in source')
  .action((opts: { seedDocs?: boolean }) => {
    archBuildCommand({ human: program.opts().human, seedDocs: opts.seedDocs });
  });

arch
  .command('show [target]')
  .description('Display architecture')
  .option('-f, --format <format>', 'Output format: json, tree, mermaid')
  .action((target: string | undefined, opts: { format?: string }) => {
    archShowCommand(target, { format: opts.format, human: program.opts().human });
  });

// Analyze
program
  .command('analyze')
  .description('Full codebase dependency analysis')
  .action(() => {
    analyzeCommand({ human: program.opts().human });
  });

// Deps
program
  .command('deps <element>')
  .description('Show what depends on an element')
  .action((element: string) => {
    depsCommand(element, { human: program.opts().human });
  });

// Calls
program
  .command('calls <element>')
  .description('Show what an element calls/uses')
  .action((element: string) => {
    callsCommand(element, { human: program.opts().human });
  });

// Map
program
  .command('map')
  .description('Full interaction map')
  .option('-f, --format <format>', 'Output format: json, mermaid, dot')
  .action((opts: { format?: string }) => {
    mapCommand({ format: opts.format, human: program.opts().human });
  });

// Context (LLM session briefing)
program
  .command('context')
  .description('Generate project context briefing for LLM session start')
  .action(() => {
    contextCommand({ human: program.opts().human });
  });

// Explain (aggregated element card: location, signature, calls, dependents, docs)
program
  .command('explain <element>')
  .description('Aggregated card for an element: location, signature, calls, dependents, docs')
  .action((element: string) => {
    explainCommand(element, { human: program.opts().human });
  });

// Search (fuzzy search across code architecture and documentation)
program
  .command('search <query>')
  .description('Fuzzy search across code and documentation')
  .action((query: string) => {
    searchCommand(query, { human: program.opts().human });
  });

// Documentation
const doc = program
  .command('doc')
  .description('Documentation commands');

doc
  .command('add <element>')
  .description('Add documentation to a function/class/file')
  .option('-c, --content <content>', 'Documentation content')
  .action((element: string, opts: { content?: string }) => {
    docAddCommand(element, { content: opts.content, human: program.opts().human });
  });

doc
  .command('show <element>')
  .description('Show documentation for an element')
  .action((element: string) => {
    docShowCommand(element, { human: program.opts().human });
  });

doc
  .command('list')
  .description('List all documented elements')
  .action(() => {
    docListCommand({ human: program.opts().human });
  });

doc
  .command('create <name>')
  .description('Create a free-form documentation page')
  .option('-c, --content <content>', 'Initial content')
  .action((name: string, opts: { content?: string }) => {
    docCreateCommand(name, { content: opts.content, human: program.opts().human });
  });

doc
  .command('search <query>')
  .description('Search documentation')
  .action((query: string) => {
    docSearchCommand(query, { human: program.opts().human });
  });

doc
  .command('alias <element> <alias>')
  .description('Add a search alias to an existing documentation entry')
  .action((element: string, alias: string) => {
    docAliasCommand(element, alias, { human: program.opts().human });
  });

doc
  .command('coverage')
  .description('Show documentation coverage of the public API')
  .action(() => {
    docCoverageCommand({ human: program.opts().human });
  });

doc
  .command('stale')
  .description('Find orphaned or outdated documentation entries')
  .action(() => {
    docStaleCommand({ human: program.opts().human });
  });

// UI
const ui = program
  .command('ui')
  .description('Web UI server commands');

ui
  .command('start')
  .description('Start web UI server in background')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('--daemon', 'Run as daemon (internal)')
  .action((opts: { port?: string; daemon?: boolean }) => {
    uiStartCommand({ port: opts.port, human: program.opts().human, daemon: opts.daemon });
  });

ui
  .command('stop')
  .description('Stop web UI server')
  .action(() => {
    uiStopCommand({ human: program.opts().human });
  });

ui
  .command('status')
  .description('Check if web UI server is running')
  .action(() => {
    uiStatusCommand({ human: program.opts().human });
  });

program.parse();

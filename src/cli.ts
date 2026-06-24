#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { detectPlatform, detectArchitecture } from './pipeline/detector';
import { parseCrash } from './pipeline/parse';
import { orchestrate } from './pipeline/orchestrator';
import { formatText } from './output/text';
import { formatHTML } from './output/html';
import { formatJSON } from './output/json';
import { Platform, SymbolicateOptions } from './types';

export async function runSymbolicate(
  crashlogPath: string,
  options: SymbolicateOptions
): Promise<void> {
  if (!fs.existsSync(crashlogPath)) {
    console.error(chalk.red(`✗ Crash log not found: ${crashlogPath}`));
    process.exit(1);
  }

  const content = fs.readFileSync(crashlogPath, 'utf8');

  const platform: Platform = options.platform
    ? options.platform
    : detectPlatform(content);

  if (platform === 'unknown') {
    console.error(chalk.red('✗ Could not detect platform. Use --platform to specify.'));
    process.exit(1);
  }

  const arch = options.arch || detectArchitecture(content);

  if (options.verbose) {
    console.log(chalk.blue(`→ Detected platform: ${platform.toUpperCase()}`));
    console.log(chalk.blue(`→ Architecture: ${arch}`));
  }

  const report = parseCrash(content, platform);

  const totalFrames = report.threads.reduce((acc, t) => acc + t.frames.length, 0);
  if (options.verbose) {
    console.log(chalk.blue(`→ Parsed ${report.threads.length} threads, ${totalFrames} frames`));
    if (report.binaryImages?.length) {
      console.log(chalk.blue(`→ Found ${report.binaryImages.length} binary images`));
    }
  }

  const symbolicated = await orchestrate(report, {
    dsym: options.dsym,
    mapping: options.mapping,
    sourcemap: options.sourcemap,
    arch,
    verbose: options.verbose,
  });

  const resolved = symbolicated.threads.reduce(
    (acc, t) => acc + t.frames.filter((f) => f.symbolicated).length,
    0
  );

  const fmt = options.format || 'text';
  let output: string;

  if (fmt === 'html') {
    output = formatHTML(symbolicated);
  } else if (fmt === 'json') {
    output = formatJSON(symbolicated);
  } else {
    output = formatText(symbolicated);
  }

  if (options.output) {
    const outPath = path.resolve(options.output);
    fs.writeFileSync(outPath, output, 'utf8');
    console.log(chalk.green(`✓ Report written to: ${outPath}`));
    console.log(chalk.green(`✓ ${resolved}/${totalFrames} frames symbolicated`));
  } else {
    console.log(output);
  }
}

const SHARED_OPTIONS = [
  ['--output <path>', 'Output file path (default: stdout)'],
  ['--format <format>', 'Output format: text | html | json', 'text'],
  ['--verbose', 'Verbose logging', false],
] as const;

function addSharedOptions(cmd: Command): Command {
  for (const [flags, desc, defaultValue] of SHARED_OPTIONS) {
    if (defaultValue !== undefined) {
      cmd.option(flags, desc, defaultValue);
    } else {
      cmd.option(flags, desc);
    }
  }
  return cmd;
}

const program = new Command();

program
  .name('crash-sym')
  .description('Offline crash symbolication for iOS, Android, and React Native')
  .version('1.0.0');

const symbolicateCmd = program
  .command('symbolicate <crashlog>')
  .alias('sym')
  .description('Symbolicate a crash log file')
  .option('--dsym <path>', 'Path to .dSYM bundle (iOS)')
  .option('--mapping <path>', 'Path to ProGuard mapping.txt (Android)')
  .option('--sourcemap <path>', 'Path to JS source map (React Native)')
  .option('--arch <arch>', 'CPU architecture (arm64, x86_64, armv7)', 'arm64')
  .option('--platform <platform>', 'Force platform detection (ios, android, rn, anr)');

addSharedOptions(symbolicateCmd);
symbolicateCmd.action(async (crashlogPath: string, options) => {
  await runSymbolicate(crashlogPath, options);
});

const iosCmd = program
  .command('ios <crashlog>')
  .description('Symbolicate an iOS crash log')
  .option('--dsym <path>', 'Path to .dSYM bundle')
  .option('--sourcemap <path>', 'Path to JS source map (hybrid RN+iOS)')
  .option('--arch <arch>', 'Architecture', 'arm64');

addSharedOptions(iosCmd);
iosCmd.action(async (crashlogPath: string, options) => {
  await runSymbolicate(crashlogPath, { ...options, platform: 'ios' });
});

const androidCmd = program
  .command('android <crashlog>')
  .description('Symbolicate an Android crash log')
  .option('--mapping <path>', 'Path to mapping.txt')
  .option('--sourcemap <path>', 'Path to JS source map (hybrid RN+Android)');

addSharedOptions(androidCmd);
androidCmd.action(async (crashlogPath: string, options) => {
  await runSymbolicate(crashlogPath, { ...options, platform: 'android' });
});

const rnCmd = program
  .command('rn <crashlog>')
  .description('Symbolicate a React Native JS crash')
  .option('--sourcemap <path>', 'Path to source map')
  .option('--dsym <path>', 'Path to .dSYM bundle (hybrid RN+iOS)')
  .option('--mapping <path>', 'Path to mapping.txt (hybrid RN+Android)');

addSharedOptions(rnCmd);
rnCmd.action(async (crashlogPath: string, options) => {
  await runSymbolicate(crashlogPath, { ...options, platform: 'rn' });
});

program.parse(process.argv);

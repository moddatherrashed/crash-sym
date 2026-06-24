import { SymbolicatedReport, SymbolicatedFrame } from '../types';

function formatFrame(frame: SymbolicatedFrame): string {
  const idx = String(frame.index).padStart(2, ' ');

  if (frame.symbolicated) {
    const location = frame.file
      ? `${frame.file}:${frame.line ?? '?'}`
      : '';
    const name = frame.symbol || frame.methodName || '??';
    return `  ${idx}  ${name}\n       ${location}`;
  }

  return `  ${idx}  ${frame.raw} [not symbolicated]`;
}

export function formatText(report: SymbolicatedReport): string {
  const lines: string[] = [];

  lines.push('═'.repeat(60));
  lines.push('  crash-sym — Symbolication Report');
  lines.push('═'.repeat(60));
  lines.push('');

  if (report.appName)    lines.push(`  App:       ${report.appName} ${report.appVersion ?? ''}`);
  if (report.osVersion)  lines.push(`  OS:        ${report.osVersion}`);
  if (report.device)     lines.push(`  Device:    ${report.device}`);
  if (report.timestamp)  lines.push(`  Time:      ${report.timestamp}`);
  if (report.crashType)  lines.push(`  Exception: ${report.crashType}`);
  if (report.crashReason) lines.push(`  Reason:    ${report.crashReason}`);
  lines.push(`  Platform:  ${report.platform.toUpperCase()}`);
  lines.push(`  Processed: ${report.symbolicatedAt}`);
  lines.push('');

  for (const thread of report.threads) {
    const crashedLabel = thread.crashed ? ' *** CRASHED ***' : '';
    lines.push('─'.repeat(60));
    lines.push(`  Thread ${thread.id}${thread.name ? ` (${thread.name})` : ''}${crashedLabel}`);
    lines.push('─'.repeat(60));

    const total = thread.frames.length;
    const resolved = thread.frames.filter((f) => f.symbolicated).length;
    lines.push(`  ${resolved}/${total} frames symbolicated`);
    lines.push('');

    for (const frame of thread.frames) {
      lines.push(formatFrame(frame));
    }
    lines.push('');
  }

  lines.push('═'.repeat(60));
  return lines.join('\n');
}

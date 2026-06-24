import { CrashReport, CrashThread, RawFrame } from '../types';

// Matches Metro/Expo bundles, Hermes, and generic .jsbundle paths
const BUNDLE_IN_PARENS =
  /(?:[\w./_-]+\.(?:bundle|jsbundle|hbc)|index(?:\.[\w-]+)?\.(?:android|ios)\.bundle|_expo\/static\/js\/[\w.-]+)/;

const JS_FRAME_PATTERNS: RegExp[] = [
  // at fn (index.android.bundle:1:203847)
  /^\s*at\s+(\S+)\s+\(([^)]+):(\d+):(\d+)\)/,
  // at index.android.bundle:1:203847
  /^\s*at\s+([^(\s]+):(\d+):(\d+)/,
  // Hermes: at fn (native) or at fn (address at file:line:col)
  /^\s*at\s+(\S+)\s+\((?:address at\s+)?([^)]+):(\d+):(\d+)\)/,
];

export function hasJSStack(content: string): boolean {
  return (
    BUNDLE_IN_PARENS.test(content) ||
    /^\s*at\s+\S+\s+\(/m.test(content) ||
    /JavascriptException|Unhandled JS Exception|RCTFatalException/i.test(content)
  );
}

export function extractJSFrames(content: string): RawFrame[] {
  const frames: RawFrame[] = [];
  const seen = new Set<string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('at ')) continue;

    for (const pattern of JS_FRAME_PATTERNS) {
      const match = trimmed.match(pattern);
      if (!match) continue;

      let methodName: string | undefined;
      let lineNumber: number;
      let column: number;

      if (match.length === 5) {
        methodName = match[1];
        lineNumber = parseInt(match[3], 10);
        column = parseInt(match[4], 10);
      } else if (match.length === 4) {
        lineNumber = parseInt(match[2], 10);
        column = parseInt(match[3], 10);
      } else {
        continue;
      }

      const key = `${methodName ?? ''}:${lineNumber}:${column}`;
      if (seen.has(key)) break;
      seen.add(key);

      frames.push({
        index: frames.length,
        raw: trimmed,
        methodName,
        lineNumber,
        column,
        layer: 'js',
      });
      break;
    }
  }

  return frames;
}

export function parseRN(content: string): CrashReport {
  const report: CrashReport = {
    platform: 'rn',
    threads: [],
    rawContent: content,
  };

  const errorMatch = content.match(/^([\w.]+(?:Error|Exception)[^\n]*)/m);
  if (errorMatch) report.crashType = errorMatch[1].trim();

  const jsErrorMatch = content.match(/^(TypeError|ReferenceError|SyntaxError|Error):\s+(.+)/m);
  if (jsErrorMatch) {
    report.crashType = jsErrorMatch[1];
    report.crashReason = jsErrorMatch[2].trim();
  }

  const frames = extractJSFrames(content);
  if (frames.length > 0) {
    report.threads.push({ id: 0, crashed: true, name: 'JavaScript', frames });
  }

  return report;
}

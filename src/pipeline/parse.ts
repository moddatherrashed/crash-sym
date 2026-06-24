import { Platform, CrashReport } from '../types';
import { parseIOS } from '../parsers/ios-parser';
import { parseAndroid } from '../parsers/android-parser';
import { parseRN, hasJSStack, extractJSFrames } from '../parsers/rn-parser';

function appendJSThread(report: CrashReport): CrashReport {
  if (!hasJSStack(report.rawContent)) return report;

  const jsFrames = extractJSFrames(report.rawContent);
  if (jsFrames.length === 0) return report;

  const hasJSThread = report.threads.some((t) =>
    t.frames.length > 0 && t.frames.every((f) => f.layer === 'js' || f.lineNumber !== undefined)
  );
  if (hasJSThread) return report;

  const maxId = report.threads.reduce((max, t) => Math.max(max, t.id), -1);
  report.threads.push({
    id: maxId + 1,
    name: 'JavaScript',
    crashed: report.platform === 'rn',
    frames: jsFrames,
  });

  return report;
}

export function parseCrash(content: string, platform: Platform): CrashReport {
  let report: CrashReport;

  if (platform === 'ios') {
    report = parseIOS(content);
  } else if (platform === 'android' || platform === 'anr') {
    report = parseAndroid(content);
  } else {
    report = parseRN(content);
  }

  return appendJSThread(report);
}

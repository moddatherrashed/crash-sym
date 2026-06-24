import { CrashReport, CrashThread, RawFrame } from '../types';

export function parseAndroid(content: string): CrashReport {
  const report: CrashReport = {
    platform: 'android',
    threads: [],
    rawContent: content,
  };

  // --- Header metadata ---
  const processMatch = content.match(/Process:\s+(.+)/);
  if (processMatch) report.appName = processMatch[1].trim();

  const pidMatch = content.match(/PID:\s+(\d+)/);
  const versionMatch = content.match(/versionName=([^\s,]+)/);
  if (versionMatch) report.appVersion = versionMatch[1].trim();

  const deviceMatch = content.match(/Build\.MODEL[=:]\s*(.+)/i);
  if (deviceMatch) report.device = deviceMatch[1].trim();

  const androidVersionMatch = content.match(/Build\.VERSION\.RELEASE[=:]\s*(.+)/i);
  if (androidVersionMatch) report.osVersion = `Android ${androidVersionMatch[1].trim()}`;

  // --- Parse exception type + message ---
  // "java.lang.NullPointerException: ..."
  const exceptionLineMatch = content.match(/^([a-zA-Z][\w.$]+(?:Exception|Error|Throwable)[^\n]*)/m);
  if (exceptionLineMatch) {
    report.crashType = exceptionLineMatch[1].trim();
  }

  // --- Parse caused-by chain ---
  const causedBy = content.match(/Caused by:\s+(.+)/);
  if (causedBy) report.crashReason = causedBy[1].trim();

  // --- Parse threads ---
  // Android dumps can have multiple thread sections
  const blocks = content.split(/^-{3,}/m);

  let threadId = 0;
  for (const block of blocks) {
    const thread: CrashThread = {
      id: threadId++,
      crashed: threadId === 1, // first block is the crashing thread
      frames: [],
    };

    const threadNameMatch = block.match(/"([^"]+)"\s+(?:prio|tid)/);
    if (threadNameMatch) thread.name = threadNameMatch[1];

    // Parse Java frames: "at com.example.Class.method(File.java:123)"
    const javaFrameRegex = /^\s+at\s+([\w.$]+)\.([\w$<>]+)\(([^:)]+)(?::(\d+))?\)/gm;
    let match;
    while ((match = javaFrameRegex.exec(block)) !== null) {
      const frame: RawFrame = {
        index: thread.frames.length,
        raw: match[0].trim(),
        className: match[1],
        methodName: match[2],
        fileName: match[3],
        lineNumber: match[4] ? parseInt(match[4], 10) : undefined,
        layer: 'native-android',
      };
      thread.frames.push(frame);
    }

    if (thread.frames.length > 0) {
      report.threads.push(thread);
    }
  }

  // Fallback: single thread from full content
  if (report.threads.length === 0) {
    const thread: CrashThread = { id: 0, crashed: true, frames: [] };
    const javaFrameRegex = /^\s+at\s+([\w.$]+)\.([\w$<>]+)\(([^:)]+)(?::(\d+))?\)/gm;
    let match;
    while ((match = javaFrameRegex.exec(content)) !== null) {
      thread.frames.push({
        index: thread.frames.length,
        raw: match[0].trim(),
        className: match[1],
        methodName: match[2],
        fileName: match[3],
        lineNumber: match[4] ? parseInt(match[4], 10) : undefined,
        layer: 'native-android',
      });
    }
    if (thread.frames.length > 0) report.threads.push(thread);
  }

  return report;
}

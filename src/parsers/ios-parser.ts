import { BinaryImage, CrashReport, CrashThread } from '../types';

export function parseBinaryImages(content: string): BinaryImage[] {
  const images: BinaryImage[] = [];
  const sectionMatch = content.match(/Binary Images:\s*\n([\s\S]*?)(?:\n\n|\nEOF|$)/);
  if (!sectionMatch) return images;

  const lineRegex =
    /^(0x[0-9a-fA-F]+)\s+-\s+(0x[0-9a-fA-F]+)\s+\+?(\S+)\s+(\S+)\s+<([0-9a-fA-F-]+)>\s+(.*)$/gm;

  let match;
  while ((match = lineRegex.exec(sectionMatch[1])) !== null) {
    images.push({
      loadAddress: match[1],
      endAddress: match[2],
      name: match[3],
      arch: match[4],
      uuid: normalizeUUID(match[5]),
      path: match[6].trim(),
    });
  }

  return images;
}

export function normalizeUUID(uuid: string): string {
  return uuid.replace(/-/g, '').toUpperCase();
}

export function parseIOS(content: string): CrashReport {
  const report: CrashReport = {
    platform: 'ios',
    threads: [],
    binaryImages: parseBinaryImages(content),
    rawContent: content,
  };

  const appVersionMatch = content.match(/Version:\s+(.+)/);
  if (appVersionMatch) report.appVersion = appVersionMatch[1].trim();

  const osVersionMatch = content.match(/OS Version:\s+(.+)/);
  if (osVersionMatch) report.osVersion = osVersionMatch[1].trim();

  const deviceMatch = content.match(/Hardware Model:\s+(.+)/);
  if (deviceMatch) report.device = deviceMatch[1].trim();

  const appNameMatch = content.match(/Process:\s+(\S+)/);
  if (appNameMatch) report.appName = appNameMatch[1].trim();

  const timestampMatch = content.match(/Date\/Time:\s+(.+)/);
  if (timestampMatch) report.timestamp = timestampMatch[1].trim();

  const exceptionMatch = content.match(/Exception Type:\s+(.+)/);
  if (exceptionMatch) report.crashType = exceptionMatch[1].trim();

  const reasonMatch = content.match(/Exception Subtype:\s+(.+)/m);
  if (reasonMatch) report.crashReason = reasonMatch[1].trim();

  const threadHeaderPatterns: { regex: RegExp; type: 'name' | 'crashed' | 'plain' }[] = [
    { regex: /^Thread (\d+)\s+name:\s+(.+)/, type: 'name' },
    { regex: /^Thread (\d+)\s+Crashed:/, type: 'crashed' },
    { regex: /^Thread (\d+):/, type: 'plain' },
  ];

  let current: {
    id: number;
    name?: string;
    crashed: boolean;
    frameStart: number;
  } | null = null;

  const finalizeThread = (end: number) => {
    if (!current) return;

    const block = content.slice(current.frameStart, end);
    const thread: CrashThread = {
      id: current.id,
      name: current.name,
      crashed: current.crashed,
      frames: [],
    };

    const frameRegex = /^(\d+)\s+(\S+)\s+(0x[0-9a-fA-F]+)\s+(.*)/gm;
    let match;
    while ((match = frameRegex.exec(block)) !== null) {
      thread.frames.push({
        index: parseInt(match[1], 10),
        raw: match[0].trim(),
        library: match[2],
        address: match[3],
        offset: match[4].trim(),
        layer: 'native-ios',
      });
    }

    if (thread.frames.length > 0) {
      report.threads.push(thread);
    }
    current = null;
  };

  const lines = content.split('\n');
  let offset = 0;

  for (const line of lines) {
    let matched = false;

    for (const { regex, type } of threadHeaderPatterns) {
      const headerMatch = line.match(regex);
      if (!headerMatch) continue;

      matched = true;
      const id = parseInt(headerMatch[1], 10);

      if (current && current.id !== id) {
        finalizeThread(offset);
      }

      if (!current || current.id !== id) {
        current = { id, crashed: false, frameStart: offset + line.length + 1 };
      }

      if (type === 'name') current.name = headerMatch[2].trim();
      if (type === 'crashed') current.crashed = true;
      current.frameStart = offset + line.length + 1;
      break;
    }

    offset += line.length + 1;
  }

  finalizeThread(content.length);

  return report;
}

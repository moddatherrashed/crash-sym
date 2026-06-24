import { Platform } from '../types';
import crashTypes from '../config/crash-types';

type CrashTypeSpec = {
  patterns: readonly string[];
  stackFramePattern: string;
};

export function detectPlatform(content: string): Platform {
  const scores: Record<Platform, number> = {
    ios: 0,
    android: 0,
    rn: 0,
    anr: 0,
    unknown: 0,
  };

  for (const [platform, spec] of Object.entries(crashTypes.crashTypes)) {
    const { patterns } = spec as CrashTypeSpec;
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'mi');
      if (regex.test(content)) {
        scores[platform as Platform] += 1;
      }
    }
  }

  // RN crashes often appear inside iOS/Android reports — boost if bundle detected
  if (scores.rn > 0) {
    const hasBundleFrame = /index\.(android|ios)\.bundle:\d+:\d+/m.test(content);
    if (hasBundleFrame) scores.rn += 2;
  }

  // ANR takes priority if clearly present
  if (scores.anr >= 2) return 'anr';

  const sorted = (Object.entries(scores) as [Platform, number][])
    .filter(([p]) => p !== 'unknown')
    .sort(([, a], [, b]) => b - a);

  const [topPlatform, topScore] = sorted[0];
  return topScore > 0 ? topPlatform : 'unknown';
}

export function detectArchitecture(content: string): string {
  if (/arm64/i.test(content)) return 'arm64';
  if (/armv7/i.test(content)) return 'armv7';
  if (/x86_64/i.test(content)) return 'x86_64';
  return 'arm64'; // safe default for modern iOS
}

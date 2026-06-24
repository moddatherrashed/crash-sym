import {
  CrashReport,
  RawFrame,
  SymbolicatedFrame,
  SymbolicatedReport,
  SymbolicatedThread,
  SymbolicatorOptions,
} from '../types';
import { symbolicateIOS, verifyDSYMUUID, findAppBinaryImage } from '../symbolicators/dsym';
import { symbolicateAndroid } from '../symbolicators/proguard';
import { symbolicateSourceMap } from '../symbolicators/sourcemap';

function isJSFrame(frame: RawFrame): boolean {
  return frame.layer === 'js' || (frame.lineNumber !== undefined && frame.column !== undefined && !frame.address);
}

function isAndroidFrame(frame: RawFrame): boolean {
  return !!frame.className;
}

function isIOSFrame(frame: RawFrame): boolean {
  return !!frame.address && !!frame.library;
}

async function symbolicateFrame(
  frame: RawFrame,
  options: SymbolicatorOptions,
  report: CrashReport
): Promise<SymbolicatedFrame> {
  const { dsym, mapping, sourcemap, arch = 'arm64', verbose = false } = options;

  if (isJSFrame(frame) && sourcemap) {
    const [result] = await symbolicateSourceMap([frame], sourcemap, verbose);
    return result;
  }

  if (isAndroidFrame(frame) && mapping) {
    const [result] = symbolicateAndroid([frame], mapping, verbose);
    return result;
  }

  if (isIOSFrame(frame) && dsym) {
    const appImage = findAppBinaryImage(report);
    if (appImage && !verifyDSYMUUID(dsym, appImage.uuid)) {
      if (verbose) {
        console.warn(`[orchestrator] dSYM UUID does not match app binary (${appImage.uuid})`);
      }
    }
    const [result] = symbolicateIOS(
      [frame],
      dsym,
      arch,
      verbose,
      report.binaryImages ?? []
    );
    return result;
  }

  const layer = isJSFrame(frame)
    ? 'js'
    : isAndroidFrame(frame)
      ? 'native-android'
      : isIOSFrame(frame)
        ? 'native-ios'
        : 'unknown';

  return { ...frame, layer, symbolicated: false };
}

export async function orchestrate(
  report: CrashReport,
  options: SymbolicatorOptions
): Promise<SymbolicatedReport> {
  const { dsym, mapping, sourcemap, verbose = false } = options;
  const hybrid = [dsym, mapping, sourcemap].filter(Boolean).length > 1;

  const symbolicatedThreads: SymbolicatedThread[] = await Promise.all(
    report.threads.map(async (thread) => {
      let symbolicatedFrames: SymbolicatedFrame[];

      if (hybrid) {
        symbolicatedFrames = await Promise.all(
          thread.frames.map((frame) => symbolicateFrame(frame, options, report))
        );
      } else if (report.platform === 'ios') {
        if (dsym) {
          symbolicatedFrames = symbolicateIOS(
            thread.frames,
            dsym,
            options.arch ?? 'arm64',
            verbose,
            report.binaryImages ?? []
          );
        } else {
          symbolicatedFrames = thread.frames.map((f) => ({
            ...f,
            layer: (f.layer ?? 'native-ios') as SymbolicatedFrame['layer'],
            symbolicated: false,
          }));
          if (verbose) console.warn('[orchestrator] No dSYM provided for iOS crash');
        }
      } else if (report.platform === 'android' || report.platform === 'anr') {
        if (mapping) {
          symbolicatedFrames = symbolicateAndroid(thread.frames, mapping, verbose);
        } else {
          symbolicatedFrames = thread.frames.map((f) => ({
            ...f,
            layer: 'native-android' as const,
            symbolicated: false,
          }));
          if (verbose) console.warn('[orchestrator] No mapping.txt provided for Android crash');
        }
      } else if (sourcemap) {
        symbolicatedFrames = await symbolicateSourceMap(thread.frames, sourcemap, verbose);
      } else {
        symbolicatedFrames = thread.frames.map((f) => ({
          ...f,
          layer: 'js' as const,
          symbolicated: false,
        }));
        if (verbose) console.warn('[orchestrator] No source map provided for RN crash');
      }

      return {
        id: thread.id,
        name: thread.name,
        crashed: thread.crashed,
        frames: symbolicatedFrames,
      };
    })
  );

  return {
    platform: report.platform,
    appName: report.appName,
    appVersion: report.appVersion,
    osVersion: report.osVersion,
    device: report.device,
    crashReason: report.crashReason,
    crashType: report.crashType,
    timestamp: report.timestamp,
    threads: symbolicatedThreads,
    rawContent: report.rawContent,
    symbolicatedAt: new Date().toISOString(),
  };
}

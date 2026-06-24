import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { BinaryImage, CrashReport, RawFrame, SymbolicatedFrame } from '../types';
import { normalizeUUID } from '../parsers/ios-parser';

function findDWARFBinary(dsymPath: string): string | null {
  const dsymContents = path.join(dsymPath, 'Contents', 'Resources', 'DWARF');
  if (!fs.existsSync(dsymContents)) return null;

  const files = fs.readdirSync(dsymContents);
  if (files.length === 0) return null;

  return path.join(dsymContents, files[0]);
}

export function getDSYMUUID(dsymPath: string): string | null {
  const binaryPath = findDWARFBinary(dsymPath);
  if (!binaryPath) return null;

  for (const cmd of [
    `dwarfdump --uuid "${binaryPath}"`,
    `llvm-dwarfdump --uuid "${binaryPath}"`,
  ]) {
    try {
      const result = execSync(cmd, { stdio: 'pipe' }).toString();
      const match = result.match(/UUID:\s+([0-9A-F-]+)/i);
      if (match) return normalizeUUID(match[1]);
    } catch {
      // try next tool
    }
  }

  return null;
}

export function verifyDSYMUUID(dsymPath: string, expectedUUID: string): boolean {
  const dsymUUID = getDSYMUUID(dsymPath);
  if (!dsymUUID) return true; // can't verify — proceed with warning
  return dsymUUID === normalizeUUID(expectedUUID);
}

function hasAtos(): boolean {
  try {
    execSync('which atos', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function hasLLVMSymbolizer(): boolean {
  try {
    execSync('which llvm-symbolizer', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function symbolicateWithAtos(
  addresses: string[],
  binaryPath: string,
  loadAddress: string,
  arch: string
): string[] {
  const addrList = addresses.join(' ');
  const cmd = `atos -arch ${arch} -o "${binaryPath}" -l ${loadAddress} ${addrList}`;
  try {
    const result = execSync(cmd, { stdio: 'pipe' }).toString().trim();
    return result.split('\n');
  } catch {
    return addresses.map(() => '??');
  }
}

function symbolicateWithLLVM(
  addresses: string[],
  binaryPath: string,
  arch: string
): string[] {
  return addresses.map((addr) => {
    try {
      const cmd = `llvm-symbolizer --obj="${binaryPath}" ${addr}`;
      const result = execSync(cmd, { stdio: 'pipe' }).toString().trim();
      return result.split('\n')[0] || '??';
    } catch {
      return '??';
    }
  });
}

function findBinaryImage(library: string, images: BinaryImage[]): BinaryImage | undefined {
  return images.find(
    (img) =>
      img.name === library ||
      img.path.endsWith(`/${library}`) ||
      path.basename(img.path) === library
  );
}

function loadAddressForFrame(frame: RawFrame, image?: BinaryImage): string {
  if (image) return image.loadAddress;
  const fromOffset = frame.offset?.match(/^(0x[0-9a-fA-F]+)/)?.[1];
  return fromOffset || '0x0';
}

function parseAtosResult(frame: RawFrame, result: string): SymbolicatedFrame {
  const atosMatch = result.match(/^(.+?)\s+\(in .+?\)\s+\((.+):(\d+)\)$/);

  if (atosMatch && atosMatch[1] !== '??') {
    return {
      ...frame,
      symbol: atosMatch[1].trim(),
      file: atosMatch[2].trim(),
      line: parseInt(atosMatch[3], 10),
      layer: 'native-ios',
      symbolicated: true,
    };
  }

  return {
    ...frame,
    symbol: result !== '??' ? result : undefined,
    layer: 'native-ios',
    symbolicated: result !== '??' && result !== 'Unknown',
  };
}

function isSystemLibrary(library: string): boolean {
  return /^(UIKit|Foundation|CoreFoundation|libswift|libsystem|dyld|Metal|QuartzCore|JavaScriptCore|hermes)/i.test(
    library
  );
}

interface IOSGroup {
  loadAddress: string;
  binaryPath: string;
  frames: RawFrame[];
  indices: number[];
}

export function symbolicateIOS(
  frames: RawFrame[],
  dsymPath: string,
  arch = 'arm64',
  verbose = false,
  binaryImages: BinaryImage[] = []
): SymbolicatedFrame[] {
  const dsymBinaryPath = findDWARFBinary(dsymPath);
  const dsymUUID = dsymBinaryPath ? getDSYMUUID(dsymPath) : null;

  if (!dsymBinaryPath) {
    if (verbose) console.warn(`[dsym] Could not find DWARF binary in ${dsymPath}`);
    return frames.map((f) => ({
      ...f,
      layer: 'native-ios' as const,
      symbolicated: false,
    }));
  }

  const useAtos = hasAtos();
  const useLLVM = !useAtos && hasLLVMSymbolizer();

  if (!useAtos && !useLLVM) {
    if (verbose) console.warn('[dsym] Neither atos nor llvm-symbolizer found. Install Xcode or LLVM.');
    return frames.map((f) => ({ ...f, layer: 'native-ios' as const, symbolicated: false }));
  }

  const results: SymbolicatedFrame[] = frames.map((f) => ({
    ...f,
    layer: 'native-ios' as const,
    symbolicated: false,
  }));

  const groups = new Map<string, IOSGroup>();

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame.library || !frame.address) continue;

    const image = findBinaryImage(frame.library, binaryImages);
    const loadAddress = loadAddressForFrame(frame, image);

    if (image && dsymUUID && image.uuid !== dsymUUID) {
      if (verbose && !isSystemLibrary(frame.library)) {
        console.warn(
          `[dsym] UUID mismatch for ${frame.library}: crash=${image.uuid} dsym=${dsymUUID}`
        );
      }
      continue;
    }

    if (isSystemLibrary(frame.library)) continue;

    const groupKey = `${loadAddress}:${dsymBinaryPath}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { loadAddress, binaryPath: dsymBinaryPath, frames: [], indices: [] };
      groups.set(groupKey, group);
    }
    group.frames.push(frame);
    group.indices.push(i);
  }

  for (const group of groups.values()) {
    const addresses = group.frames.map((f) => f.address || '0x0');
    const symbolResults = useAtos
      ? symbolicateWithAtos(addresses, group.binaryPath, group.loadAddress, arch)
      : symbolicateWithLLVM(addresses, group.binaryPath, arch);

    for (let j = 0; j < group.frames.length; j++) {
      results[group.indices[j]] = parseAtosResult(group.frames[j], symbolResults[j] || '??');
    }
  }

  return results;
}

export function findAppBinaryImage(report: CrashReport): BinaryImage | undefined {
  if (!report.binaryImages?.length) return undefined;

  const appName = report.appName?.replace(/\s+\[\d+\]$/, '');
  if (appName) {
    const match = report.binaryImages.find((img) => img.name === appName);
    if (match) return match;
  }

  return report.binaryImages.find((img) => !isSystemLibrary(img.name));
}

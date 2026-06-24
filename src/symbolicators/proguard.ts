import * as fs from 'fs';
import { RawFrame, SymbolicatedFrame } from '../types';

interface MappingEntry {
  originalClass: string;
  methods: Map<string, string>; // obfuscated -> original
}

export function buildMappingTable(mappingPath: string): Map<string, MappingEntry> {
  const table = new Map<string, MappingEntry>();

  if (!fs.existsSync(mappingPath)) {
    throw new Error(`Mapping file not found: ${mappingPath}`);
  }

  const lines = fs.readFileSync(mappingPath, 'utf8').split('\n');
  let currentEntry: MappingEntry | null = null;
  let currentObfuscatedClass = '';

  for (const line of lines) {
    // Class mapping: "com.example.RealClass -> com.a.b:"
    const classMatch = line.match(/^([\w.$]+)\s+->\s+([\w.$]+):$/);
    if (classMatch) {
      currentObfuscatedClass = classMatch[2];
      currentEntry = {
        originalClass: classMatch[1],
        methods: new Map(),
      };
      table.set(currentObfuscatedClass, currentEntry);
      continue;
    }

    // Method mapping: "    int originalMethod() -> a"
    if (currentEntry && line.startsWith('    ')) {
      const methodMatch = line.match(/^\s+(?:\d+:\d+:)?[\w.$[\]<>]+\s+([\w$<>]+)\(.*\)\s+->\s+(\w+)/);
      if (methodMatch) {
        currentEntry.methods.set(methodMatch[2], methodMatch[1]);
      }
    }
  }

  return table;
}

export function symbolicateAndroid(
  frames: RawFrame[],
  mappingPath: string,
  verbose = false
): SymbolicatedFrame[] {
  let table: Map<string, MappingEntry>;

  try {
    table = buildMappingTable(mappingPath);
  } catch (err) {
    if (verbose) console.warn(`[proguard] ${(err as Error).message}`);
    return frames.map((f) => ({ ...f, layer: 'native-android' as const, symbolicated: false }));
  }

  return frames.map((frame) => {
    const { className, methodName } = frame;

    if (!className) {
      return { ...frame, layer: 'native-android' as const, symbolicated: false };
    }

    const entry = table.get(className);

    if (!entry) {
      // Class not obfuscated — already readable
      return {
        ...frame,
        symbol: methodName ? `${className}.${methodName}()` : className,
        layer: 'native-android' as const,
        symbolicated: true,
      };
    }

    const originalClass = entry.originalClass;
    const originalMethod = methodName ? (entry.methods.get(methodName) || methodName) : undefined;

    return {
      ...frame,
      symbol: originalMethod
        ? `${originalClass}.${originalMethod}()`
        : originalClass,
      file: frame.fileName,
      line: frame.lineNumber,
      layer: 'native-android' as const,
      symbolicated: true,
    };
  });
}

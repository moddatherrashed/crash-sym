import * as fs from 'fs';
import { SourceMapConsumer } from 'source-map';
import { RawFrame, SymbolicatedFrame } from '../types';

export async function symbolicateSourceMap(
  frames: RawFrame[],
  sourceMapPath: string,
  verbose = false
): Promise<SymbolicatedFrame[]> {
  if (!fs.existsSync(sourceMapPath)) {
    if (verbose) console.warn(`[sourcemap] File not found: ${sourceMapPath}`);
    return frames.map((f) => ({ ...f, layer: 'js' as const, symbolicated: false }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawMap: any;
  try {
    rawMap = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));
  } catch {
    if (verbose) console.warn(`[sourcemap] Failed to parse source map: ${sourceMapPath}`);
    return frames.map((f) => ({ ...f, layer: 'js' as const, symbolicated: false }));
  }

  return await SourceMapConsumer.with(rawMap, null, (consumer) => {
    return frames.map((frame) => {
      const { lineNumber, column } = frame;

      if (lineNumber === undefined || column === undefined) {
        return { ...frame, layer: 'js' as const, symbolicated: false };
      }

      try {
        const pos = consumer.originalPositionFor({
          line: lineNumber,
          column: column,
        });

        if (pos.source && pos.line) {
          return {
            ...frame,
            originalFile: pos.source,
            originalLine: pos.line,
            originalColumn: pos.column ?? undefined,
            originalName: pos.name ?? undefined,
            symbol: pos.name || frame.methodName,
            file: pos.source,
            line: pos.line,
            column: pos.column ?? undefined,
            layer: 'js' as const,
            symbolicated: true,
          };
        }
      } catch (err) {
        if (verbose) {
          console.warn(`[sourcemap] Could not map frame at ${lineNumber}:${column}`);
        }
      }

      return { ...frame, layer: 'js' as const, symbolicated: false };
    });
  });
}

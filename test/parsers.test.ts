import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { parseIOS, parseBinaryImages, normalizeUUID } from '../src/parsers/ios-parser';
import { parseAndroid } from '../src/parsers/android-parser';
import { parseRN, extractJSFrames, hasJSStack } from '../src/parsers/rn-parser';
import { parseCrash } from '../src/pipeline/parse';
import { detectPlatform } from '../src/pipeline/detector';
import { buildMappingTable, symbolicateAndroid } from '../src/symbolicators/proguard';

const fixtures = path.join(__dirname, 'fixtures');

describe('ios-parser', () => {
  it('parses thread IDs from headers, not sequential indices', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-ios.crash'), 'utf8');
    const report = parseIOS(content);

    assert.equal(report.threads.length, 2);
    assert.equal(report.threads[0].id, 0);
    assert.equal(report.threads[1].id, 1);
    assert.equal(report.threads[0].crashed, true);
    assert.equal(report.threads[0].name, 'Dispatch queue: com.apple.main-thread');
  });

  it('parses binary images with UUIDs', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-ios.crash'), 'utf8');
    const images = parseBinaryImages(content);

    assert.equal(images.length, 2);
    assert.equal(images[0].name, 'MyApp');
    assert.equal(images[0].loadAddress, '0x100a00000');
    assert.equal(images[0].uuid, normalizeUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890'));
  });

  it('extracts app metadata', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-ios.crash'), 'utf8');
    const report = parseIOS(content);

    assert.equal(report.appName, 'MyApp');
    assert.match(report.appVersion ?? '', /2\.3\.1/);
    assert.match(report.crashType ?? '', /EXC_BAD_ACCESS/);
  });
});

describe('android-parser', () => {
  it('parses Java stack frames', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-android.crash'), 'utf8');
    const report = parseAndroid(content);

    assert.ok(report.threads.length >= 1);
    const frames = report.threads[0].frames;
    assert.ok(frames.length >= 4);
    assert.equal(frames[0].className, 'com.a.b.c');
    assert.equal(frames[0].methodName, 'doWork');
    assert.equal(frames[0].layer, 'native-android');
  });
});

describe('proguard symbolicator', () => {
  it('deobfuscates class and method names', () => {
    const mappingPath = path.join(fixtures, 'mapping.txt');
    const table = buildMappingTable(mappingPath);

    assert.ok(table.has('com.a.b.c'));
    assert.equal(table.get('com.a.b.c')!.originalClass, 'com.example.network.Worker');

    const content = fs.readFileSync(path.join(fixtures, 'sample-android.crash'), 'utf8');
    const report = parseAndroid(content);
    const symbolicated = symbolicateAndroid(report.threads[0].frames, mappingPath);

    assert.equal(symbolicated[0].symbol, 'com.example.network.Worker.doWork()');
    assert.equal(symbolicated[0].symbolicated, true);
  });
});

describe('rn-parser', () => {
  it('parses Metro bundle stack frames', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-rn.crash'), 'utf8');
    const report = parseRN(content);

    assert.equal(report.threads.length, 1);
    assert.ok(report.threads[0].frames.length >= 5);
    assert.equal(report.threads[0].frames[2].methodName, 'handleSubmit');
    assert.equal(report.threads[0].frames[2].lineNumber, 1);
    assert.equal(report.threads[0].frames[2].column, 445621);
  });

  it('parses Expo bundle paths', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-rn-expo.crash'), 'utf8');
    const frames = extractJSFrames(content);

    assert.equal(frames.length, 3);
    assert.equal(frames[0].methodName, 'handleSubmit');
    assert.equal(frames[0].lineNumber, 1);
    assert.equal(frames[0].column, 120);
  });

  it('detects JS stacks in mixed content', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-rn.crash'), 'utf8');
    assert.equal(hasJSStack(content), true);
  });
});

describe('platform detector', () => {
  it('detects iOS crashes', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-ios.crash'), 'utf8');
    assert.equal(detectPlatform(content), 'ios');
  });

  it('detects Android crashes', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-android.crash'), 'utf8');
    assert.equal(detectPlatform(content), 'android');
  });

  it('detects RN crashes', () => {
    const content = fs.readFileSync(path.join(fixtures, 'sample-rn.crash'), 'utf8');
    assert.equal(detectPlatform(content), 'rn');
  });
});

describe('hybrid parse', () => {
  it('appends JavaScript thread to iOS crash when JS frames present', () => {
    const ios = fs.readFileSync(path.join(fixtures, 'sample-ios.crash'), 'utf8');
    const js = fs.readFileSync(path.join(fixtures, 'sample-rn.crash'), 'utf8');
    const hybrid = `${ios}\n\n--- JavaScript Exception ---\n${js}`;

    const report = parseCrash(hybrid, 'ios');

    const jsThread = report.threads.find((t) => t.name === 'JavaScript');
    assert.ok(jsThread);
    assert.ok(jsThread!.frames.length >= 5);
    assert.ok(report.threads.some((t) => t.id === 0 && t.frames[0].library === 'MyApp'));
  });
});

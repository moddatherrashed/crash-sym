const crashTypes = {
  version: '1.0.0',
  platforms: ['ios', 'android', 'rn'],
  crashTypes: {
    ios: {
      patterns: [
        'Thread \\d+ Crashed',
        'Exception Type:\\s+EXC_',
        'OS Version:\\s+iPhone OS',
        'Hardware Model:\\s+iPhone',
      ],
      stackFramePattern: '^\\d+\\s+\\S+\\s+0x[0-9a-fA-F]+',
    },
    android: {
      patterns: [
        'java\\.lang\\.',
        'android\\.app\\.',
        'FATAL EXCEPTION',
        'Process:.*PID:',
      ],
      stackFramePattern: 'at\\s+[\\w\\.\\$]+\\([^)]+\\)',
    },
    rn: {
      patterns: [
        'index\\.android\\.bundle',
        'index\\.ios\\.bundle',
        '\\.bundle:\\d+:\\d+',
        'JavascriptException',
      ],
      stackFramePattern: 'at\\s+\\w+\\s+\\([^)]+\\.bundle:\\d+:\\d+\\)',
    },
    anr: {
      patterns: [
        'ANR in',
        'Reason: Input dispatching timed out',
        '"main" prio=\\d+',
      ],
      stackFramePattern: 'at\\s+[\\w\\.\\$]+\\([^)]+\\)',
    },
  },
} as const;

export default crashTypes;

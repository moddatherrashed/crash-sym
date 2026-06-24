import { SymbolicatedReport, SymbolicatedFrame } from '../types';

function layerBadge(layer: SymbolicatedFrame['layer']): string {
  const map: Record<string, string> = {
    'native-ios': '#4d9fff',
    'native-android': '#3ddc84',
    'js': '#ffc947',
    'system': '#888',
    'unknown': '#555',
  };
  const labels: Record<string, string> = {
    'native-ios': 'iOS',
    'native-android': 'Android',
    'js': 'JS',
    'system': 'sys',
    'unknown': '?',
  };
  const color = map[layer] || '#555';
  const label = labels[layer] || layer;
  return `<span style="background:${color};color:#0f1117;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;">${label}</span>`;
}

function frameRow(frame: SymbolicatedFrame, highlight: boolean): string {
  const bg = highlight ? '#1e1520' : (frame.symbolicated ? '#0f1f18' : '#1a1d27');
  const border = highlight ? '#ff4d4d' : (frame.symbolicated ? '#3ddc84' : '#2a2d3e');

  const symbolHtml = frame.symbolicated
    ? `<span style="color:#e8eaf0;font-weight:500;">${frame.symbol || frame.methodName || '??'}</span>`
    : `<span style="color:#555c78;">${frame.raw}</span>`;

  const locationHtml = frame.file
    ? `<span style="color:#4d9fff;">${frame.file}</span><span style="color:#ffc947;">:${frame.line ?? '?'}</span>`
    : '';

  return `
    <tr style="border-left: 3px solid ${border}; background: ${bg};">
      <td style="padding:8px 12px; color:#555c78; font-size:12px; width:32px;">${frame.index}</td>
      <td style="padding:8px 12px;">${layerBadge(frame.layer)}</td>
      <td style="padding:8px 12px;">
        ${symbolHtml}
        ${locationHtml ? `<br><span style="font-size:11px;">${locationHtml}</span>` : ''}
      </td>
      <td style="padding:8px 12px; color:${frame.symbolicated ? '#3ddc84' : '#ff4d4d'}; font-size:12px;">
        ${frame.symbolicated ? '✓' : '—'}
      </td>
    </tr>`;
}

export function formatHTML(report: SymbolicatedReport): string {
  const totalFrames = report.threads.reduce((acc, t) => acc + t.frames.length, 0);
  const resolvedFrames = report.threads.reduce(
    (acc, t) => acc + t.frames.filter((f) => f.symbolicated).length, 0
  );
  const pct = totalFrames > 0 ? Math.round((resolvedFrames / totalFrames) * 100) : 0;

  const threadsHTML = report.threads.map((thread) => {
    const crashedLabel = thread.crashed
      ? `<span style="color:#ff4d4d;margin-left:8px;font-size:12px;">★ CRASHED</span>` : '';

    const framesHTML = thread.frames.map((frame, i) => {
      // Highlight the most likely culprit — first non-system symbolicated frame in crashed thread
      const isHighlight = thread.crashed && frame.symbolicated && i === 0;
      return frameRow(frame, isHighlight);
    }).join('');

    return `
      <div style="margin-bottom:24px;">
        <div style="padding:12px 16px;background:#1a1d27;border-radius:8px 8px 0 0;border:1px solid #2a2d3e;">
          <span style="color:#e8eaf0;font-weight:500;">Thread ${thread.id}</span>
          ${thread.name ? `<span style="color:#555c78;font-size:12px;margin-left:8px;">${thread.name}</span>` : ''}
          ${crashedLabel}
        </div>
        <table style="width:100%;border-collapse:collapse;font-family:monospace;font-size:13px;border:1px solid #2a2d3e;border-top:none;">
          ${framesHTML}
        </table>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>crash-sym report — ${report.appName ?? 'Unknown App'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f1117; color: #e8eaf0; font-family: 'JetBrains Mono', 'Fira Mono', monospace; padding: 32px; }
    .header { background: #1a1d27; border: 1px solid #2a2d3e; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; }
    .meta-item label { color: #555c78; font-size: 11px; display: block; margin-bottom: 2px; }
    .meta-item span { color: #e8eaf0; font-size: 13px; }
    .progress { background: #2a2d3e; border-radius: 4px; height: 6px; margin-top: 16px; }
    .progress-bar { background: #3ddc84; border-radius: 4px; height: 6px; }
    tr:hover { background: #1e2130 !important; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="font-size:20px;font-weight:700;color:#e8eaf0;">💥 crash-sym</span>
      <span style="background:#1a1d27;border:1px solid #2a2d3e;padding:2px 10px;border-radius:12px;font-size:12px;color:#555c78;">
        ${report.platform.toUpperCase()}
      </span>
    </div>
    <div class="meta">
      ${report.appName ? `<div class="meta-item"><label>App</label><span>${report.appName} ${report.appVersion ?? ''}</span></div>` : ''}
      ${report.osVersion ? `<div class="meta-item"><label>OS</label><span>${report.osVersion}</span></div>` : ''}
      ${report.device ? `<div class="meta-item"><label>Device</label><span>${report.device}</span></div>` : ''}
      ${report.crashType ? `<div class="meta-item"><label>Exception</label><span style="color:#ff4d4d;">${report.crashType}</span></div>` : ''}
      ${report.crashReason ? `<div class="meta-item"><label>Reason</label><span>${report.crashReason}</span></div>` : ''}
      <div class="meta-item"><label>Symbolicated</label><span style="color:#3ddc84;">${resolvedFrames}/${totalFrames} frames (${pct}%)</span></div>
    </div>
    <div class="progress" title="${pct}% symbolicated">
      <div class="progress-bar" style="width:${pct}%;"></div>
    </div>
  </div>

  ${threadsHTML}

  <div style="margin-top:24px;color:#555c78;font-size:11px;text-align:center;">
    Generated by crash-sym · ${report.symbolicatedAt}
  </div>
</body>
</html>`;
}

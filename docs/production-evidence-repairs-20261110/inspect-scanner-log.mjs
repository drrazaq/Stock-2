// Read-only retained-log inspection. No network, filesystem, dispatch or record writes.
export function inspectScannerLog(log) {
  if (typeof log !== 'string') throw new TypeError('log must be retained text');
  const modes = [...log.matchAll(/\bMODE: (daily|intraday)\s*$/gm)].map(x=>x[1]);
  const shas = [...log.matchAll(/\[command\][^\n]*git log -1 --format=%H\r?\n\S+ ([a-f0-9]{40})\s*$/gm)].map(x=>x[1]);
  const mode = [...new Set(modes)];
  const source = [...new Set(shas)];
  const closed = /Market closed\. Nothing to do\./.test(log);
  const daily = /daily scan done: \d+ stocks/.test(log);
  const intraday = /intraday check done:/.test(log);
  const conflict = mode.length !== 1 || source.length !== 1 ||
    (daily && (closed || intraday || mode[0] !== 'daily')) ||
    ((closed || intraday) && mode[0] !== 'intraday');
  return {
    loadedSource: source.length === 1 ? source[0] : null,
    mode: mode.length === 1 ? mode[0] : null,
    execution: conflict ? 'UNRESOLVED' : closed ? 'INTRADAY_CLOSED_NOOP' :
      daily ? 'DAILY_ASSESSMENT_REPORTED' : intraday ? 'INTRADAY_ASSESSMENT_REPORTED' : 'UNRESOLVED',
    save: 'REQUIRES_SEPARATE_COMMIT_EVIDENCE',
    delivery: 'REQUIRES_SEPARATE_COMPLETE_ACK_EVIDENCE',
    schedulerCause: 'UNRESOLVED',
    scope: 'Markers alone do not certify complete hosted receipt, data publication, delivery or invocation-slot identity.'
  };
}

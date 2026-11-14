'use strict';

// Host-side acceptance only. No app commands, metadata output or native hooks.
function verifyReadyMediaRouting(dump, expectedPackage, expectedPid, userId = 0) {
  if (typeof dump !== 'string' || dump.length > 4 * 1024 * 1024 ||
      !/^[A-Za-z]\w*(?:\.[A-Za-z]\w*)+$/.test(expectedPackage) ||
      !Number.isSafeInteger(expectedPid) || expectedPid <= 0 ||
      !Number.isSafeInteger(userId) || userId < 0) throw new Error('INVALID_OBSERVATION');
  const selected = dump.match(/^\s*Media button session is (.+) \(userId=(\d+)\)\s*$/m);
  if (!selected) throw new Error('NO_MEDIA_BUTTON_OWNER');
  const lines = dump.split(/\r?\n/);
  const headers = [];
  for (let index = 0; index < lines.length - 1; index++) {
    const header = lines[index].match(/^\s*(\S.*?) \(userId=(\d+)\)\s*$/);
    const owner = lines[index + 1].match(/^\s*ownerPid=(\d+), ownerUid=\d+, userId=(\d+)\s*$/);
    if (header && owner) headers.push({ index, identity: header[1], userId: Number(header[2]), pid: Number(owner[1]) });
  }
  const sessions = headers.map((header, index) => {
    const body = lines.slice(header.index + 1, headers[index + 1]?.index ?? lines.length).join('\n');
    const state = body.match(/^\s*state=PlaybackState \{state=([A-Z_]+)\(\d+\), position=(-?\d+),[^}]*?\bspeed=([-\d.]+),[^}]*?\bactions=(\d+)/m);
    const packageName = body.match(/^\s*package=([^\r\n]+)\s*$/m)?.[1]?.trim();
    // AOSP prefixes record headings with the session tag, while the selected
    // owner uses its package/tag/id identity without that display prefix.
    const identityStart = packageName ? header.identity.lastIndexOf(packageName + '/') : -1;
    return { ...header, package: packageName, routingIdentity: identityStart < 0 ? null : header.identity.slice(identityStart),
      active: /^\s*active=true\s*$/m.test(body), phase: state?.[1],
      positionMs: state ? Number(state[2]) : null, speed: state ? Number(state[3]) : null,
      actions: state ? Number(state[4]) : 0 };
  });
  const current = sessions.filter((session) => session.package === expectedPackage && session.userId === userId && session.active && session.pid === expectedPid);
  if (current.length !== 1) throw new Error(current.length ? 'AMBIGUOUS_ACTIVE_SESSION' : 'NO_CURRENT_ACTIVE_SESSION');
  const session = current[0];
  if (Number(selected[2]) !== userId || selected[1] !== session.routingIdentity) throw new Error('WRONG_MEDIA_BUTTON_OWNER');
  if (session.phase !== 'PAUSED' || session.positionMs !== 0 || session.speed !== 0) throw new Error('NOT_SILENT_READY');
  if ((session.actions & 32) === 0) throw new Error('GO_UNAVAILABLE');
  return { package: expectedPackage, pid: expectedPid, userId, selectedSession: session.routingIdentity,
    phase: session.phase, positionMs: session.positionMs, speed: session.speed, goAvailable: true };
}

module.exports = { verifyReadyMediaRouting };

if (require.main === module) {
  const fs = require('node:fs');
  const [file, expectedPackage, pid] = process.argv.slice(2);
  if (!file || !expectedPackage || !pid) throw new Error('Usage: ready-media-routing.cjs DUMP PACKAGE PID');
  if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('INVALID_OBSERVATION');
  const input = fs.readFileSync(file);
  if (input.length > 4 * 1024 * 1024) throw new Error('INVALID_OBSERVATION');
  process.stdout.write(JSON.stringify(verifyReadyMediaRouting(input.toString('utf8').replace(/^\uFEFF/, ''), expectedPackage, Number(pid))) + '\n');
}

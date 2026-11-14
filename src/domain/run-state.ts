export type RunMode =
  | 'editing'
  | 'rehearsal'
  | 'preflight'
  | 'armed'
  | 'running'
  | 'paused'
  | 'fading'
  | 'complete'
  | 'interrupted'
  | 'fault'
  | 'recovery';

export type RunAction =
  | 'REHEARSE'
  | 'PREFLIGHT'
  | 'ARM'
  | 'GO'
  | 'PAUSE'
  | 'RESUME'
  | 'PANIC'
  | 'FINISH'
  | 'INTERRUPT'
  | 'FAULT'
  | 'RECOVER'
  | 'EXIT';

const transitions: Record<RunMode, Partial<Record<RunAction, RunMode>>> = {
  editing: { REHEARSE: 'rehearsal', PREFLIGHT: 'preflight' },
  rehearsal: { PREFLIGHT: 'preflight', EXIT: 'editing' },
  preflight: { ARM: 'armed', EXIT: 'editing' },
  armed: { GO: 'running', PANIC: 'fading', INTERRUPT: 'interrupted', FAULT: 'fault', EXIT: 'editing' },
  running: { PAUSE: 'paused', PANIC: 'fading', FINISH: 'complete', INTERRUPT: 'interrupted', FAULT: 'fault', RECOVER: 'recovery' },
  paused: { RESUME: 'running', PANIC: 'fading', INTERRUPT: 'interrupted', FAULT: 'fault', RECOVER: 'recovery' },
  fading: { FINISH: 'complete', FAULT: 'fault', RECOVER: 'recovery' },
  complete: { EXIT: 'editing' },
  interrupted: { RECOVER: 'recovery', EXIT: 'editing' },
  fault: { RECOVER: 'recovery', EXIT: 'editing' },
  recovery: { RESUME: 'running', PANIC: 'fading', FINISH: 'complete', EXIT: 'editing' },
};

export function transitionRunState(mode: RunMode, action: RunAction): RunMode {
  const next = transitions[mode][action];
  if (!next) throw new Error(`Invalid run transition: ${mode} + ${action}`);
  return next;
}

export function isLiveMode(mode: RunMode): boolean {
  return ['armed', 'running', 'paused', 'fading', 'interrupted', 'fault', 'recovery'].includes(mode);
}

export interface ReadyMediaRouting {
  package: string;
  pid: number;
  userId: number;
  selectedSession: string;
  phase: 'PAUSED';
  positionMs: 0;
  speed: 0;
  goAvailable: true;
}

export function verifyReadyMediaRouting(dump: string, expectedPackage: string, expectedPid: number, userId?: number): ReadyMediaRouting;

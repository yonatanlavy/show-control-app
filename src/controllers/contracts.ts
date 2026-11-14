import type { ControllerCommand, Id } from '../domain';
import type { Subscription } from '../audio';

export interface ControllerInput {
  readonly adapterId: Id;
  readonly deviceId: string;
  readonly inputKey: string;
  readonly phase: 'down' | 'up';
  readonly monotonicMs: number;
  readonly isRepeat: boolean;
  readonly wasQueued?: boolean;
}

export interface ControllerAdapter {
  readonly id: Id;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (input: ControllerInput) => void): Subscription;
  health(): Promise<{ connected: boolean; detail: string }>;
}

export interface NormalizedControllerEvent {
  readonly command: ControllerCommand;
  readonly source: ControllerInput;
}

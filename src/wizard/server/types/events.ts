export interface BuildEvent {
  type:
    | 'stage:start'
    | 'stage:complete'
    | 'stage:error'
    | 'build:complete'
    | 'build:error'
    | 'log';
  stage?: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

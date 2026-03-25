export class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorCodes = {
  PROJECT_NOT_FOUND: 'E1001',
  PROJECT_NO_CONFIG: 'E1002',
  PROJECT_SAVE_FAILED: 'E1003',
  CONFIG_VALIDATION_FAILED: 'E2001',
  BUILD_ALREADY_RUNNING: 'E3001',
  BUILD_STAGE_FAILED: 'E3002',
  COMPONENT_NOT_FOUND: 'E4001',
  FILE_NOT_FOUND: 'E5001',
} as const;

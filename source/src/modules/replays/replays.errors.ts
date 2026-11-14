export class ReplayValidationError extends Error {}

export class ReplayNotFoundError extends Error {}

export class ReplayConflictError extends Error {}

export function logReplayError(
  stage: string,
  fileSha256: string | undefined,
  attemptId: number | undefined,
  error: unknown,
): void {
  const properties = typeof error === 'object' && error !== null ? error : {};
  const code = 'code' in properties && typeof properties.code === 'string'
    ? properties.code : undefined;
  const constraint = 'constraint' in properties && typeof properties.constraint === 'string'
    ? properties.constraint : undefined;
  console.error(JSON.stringify({
    event: 'replay_ingestion',
    fileSha256: fileSha256 ?? null,
    attemptId: attemptId ?? null,
    stage,
    result: 'failed',
    error: {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'Non-Error exception',
      stack: error instanceof Error ? error.stack : undefined,
      sqlState: code,
      constraint,
    },
  }));
}

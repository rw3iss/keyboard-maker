import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../types/errors.js';

export function errorHandler(
  error: FastifyError | AppError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: true,
      code: error.errorCode,
      message: error.message,
      details: error.details ?? null,
    });
    return;
  }

  // Fastify validation errors
  const fastifyErr = error as FastifyError;
  if (fastifyErr.validation) {
    reply.status(400).send({
      error: true,
      code: 'E0000',
      message: 'Validation error',
      details: fastifyErr.validation,
    });
    return;
  }

  // Unknown errors
  console.error('Unhandled error:', error);
  reply.status(500).send({
    error: true,
    code: 'E9999',
    message: 'Internal server error',
    details: null,
  });
}

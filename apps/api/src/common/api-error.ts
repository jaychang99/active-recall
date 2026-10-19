import { HttpException, HttpStatus } from '@nestjs/common';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

/** Structured error with a machine-readable `error` code and optional details. */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    const body: ApiErrorBody = { statusCode: status, error: code, message, details };
    super(body, status);
  }
  static notFound(what: string, id?: string) {
    return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', id ? `${what} "${id}" was not found` : `${what} was not found`);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError(HttpStatus.CONFLICT, 'CONFLICT', message, details);
  }
  static badRequest(message: string, details?: unknown) {
    return new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', message, details);
  }
  static unprocessable(message: string, details?: unknown) {
    return new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_FAILED', message, details);
  }
}

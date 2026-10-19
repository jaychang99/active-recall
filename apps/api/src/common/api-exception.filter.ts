import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'error' in body && 'statusCode' in body) {
        res.status(status).json(body);
        return;
      }
      const msg = typeof body === 'string' ? body : ((body as { message?: unknown }).message ?? exception.message);
      res.status(status).json({
        statusCode: status,
        error: status === 400 ? 'BAD_REQUEST' : exception.name.replace(/Exception$/, '').toUpperCase(),
        message: Array.isArray(msg) ? msg.join('; ') : String(msg),
        details: Array.isArray(msg) ? msg : undefined,
      });
      return;
    }
    const err = exception as { type?: string; message?: string; code?: string };
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ statusCode: 413, error: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 6 MB limit' });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ statusCode: 400, error: 'INVALID_JSON', message: `Request body is not valid JSON: ${err.message ?? ''}` });
      return;
    }
    const prismaMeta = exception && typeof exception === 'object' && 'code' in exception ? ` [${String((exception as { code?: unknown }).code)}] ${JSON.stringify((exception as { meta?: unknown }).meta ?? null)}` : '';
    this.logger.error(`${err?.message ?? String(exception)}${prismaMeta}`, (exception as Error)?.stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Unexpected server error. Check the API log for details.',
    });
  }
}

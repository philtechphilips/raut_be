import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // If it's a standard HttpException (like 404, 401, 403, 400 validation issues), preserve it!
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resPayload = exception.getResponse();
      return response.status(status).json(
        typeof resPayload === 'object' && resPayload !== null
          ? resPayload
          : { statusCode: status, message: resPayload }
      );
    }

    // Log the actual crash error to the server console for diagnostics
    console.error('AllExceptionsFilter Intercepted Crash:', exception);

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong!',
    });
  }
}

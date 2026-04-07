import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { AppModule } from './app.module';

function buildCorsOptions(): CorsOptions {
  const allowedList =
    process.env.CORS_ORIGINS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const origin: CorsOptions['origin'] =
    allowedList.length === 0
      ? true
      : (reqOrigin, callback) => {
          if (!reqOrigin) {
            callback(null, true);
            return;
          }
          if (allowedList.includes(reqOrigin)) {
            callback(null, reqOrigin);
            return;
          }
          callback(null, false);
        };

  return {
    origin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-auth-token',
      'Accept',
      'Origin',
      'X-Requested-With',
      'Content-Length',
    ],
    exposedHeaders: [
      'X-Export-Row-Count',
      'X-Export-Total-Matching',
      'X-Export-Truncated',
      'Content-Disposition',
    ],
    maxAge: 86_400,
    optionsSuccessStatus: 204,
  };
}

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is required. Add it to your .env file. Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
    );
  }
  const app = await NestFactory.create(AppModule);

  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', 1);
  }

  app.enableCors(buildCorsOptions());
  
  // Prefijo global de API
  app.setGlobalPrefix('api');

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  // Aumentar el timeout del servidor a 30 minutos (1800000 ms)
  // para permitir cargas largas de archivos
  const server = app.getHttpServer();
  server.setTimeout(1800000);
  server.keepAliveTimeout = 1800000;
  server.headersTimeout = 1801000;

  console.log(`🚀 Petho API corriendo en http://localhost:${port}/api`);
}
bootstrap();

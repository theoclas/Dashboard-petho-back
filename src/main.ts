import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is required. Add it to your .env file. Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
    );
  }
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS para el frontend futuro
  app.enableCors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'Accept'],
    exposedHeaders: [
      'X-Export-Row-Count',
      'X-Export-Total-Matching',
      'X-Export-Truncated',
      'Content-Disposition',
    ],
  });
  
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

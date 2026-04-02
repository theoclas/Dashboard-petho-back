import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ReportesRentabilidadController } from '../src/reportes-rentabilidad/reportes-rentabilidad.controller';
import { ReportesRentabilidadService } from '../src/reportes-rentabilidad/reportes-rentabilidad.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

describe('ReportesRentabilidadController (e2e, DB mockeada)', () => {
  let app: INestApplication;
  let query: jest.Mock;

  beforeAll(async () => {
    query = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportesRentabilidadController],
      providers: [
        ReportesRentabilidadService,
        { provide: DataSource, useValue: { query } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET por-producto — 400 si sortBy no está en la whitelist', () => {
    return request(app.getHttpServer())
      .get('/api/reportes-rentabilidad/por-producto')
      .query({ sortBy: 'columna_inventada' })
      .expect(400);
  });

  it('GET por-producto — 200 con data y total', async () => {
    query
      .mockResolvedValueOnce([{ c: 1 }])
      .mockResolvedValueOnce([
        {
          producto: 'Test',
          entr: 5,
          tran: 0,
          dev: 0,
          enviados: 5,
          ventas: '100',
          pauta: '0',
          utilidad: '10',
          pct_efectividad: 100,
          pct_transito: 0,
          pct_devolucion: 0,
        },
      ]);

    const res = await request(app.getHttpServer())
      .get('/api/reportes-rentabilidad/por-producto')
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].producto).toBe('Test');
  });
});

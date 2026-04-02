import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Pedido } from '../src/pedidos/entities/pedido.entity';
import { ReportesLogisticaModule } from '../src/reportes-logistica/reportes-logistica.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

function queryBuilderChain(getRawMany: jest.Mock) {
  const c = {} as Record<string, jest.Mock>;
  for (const m of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'orderBy',
    'limit',
    'addGroupBy',
  ]) {
    c[m] = jest.fn().mockReturnValue(c);
  }
  c.getRawMany = getRawMany;
  return c;
}

describe('ReportesLogisticaController (e2e, DB mockeada)', () => {
  let app: INestApplication;
  let createQueryBuilder: jest.Mock;

  beforeAll(async () => {
    createQueryBuilder = jest.fn();
    const moduleRef = await Test.createTestingModule({
      imports: [ReportesLogisticaModule],
    })
      .overrideProvider(getRepositoryToken(Pedido))
      .useValue({ createQueryBuilder })
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

  it('GET comparativa-geografica — 400 si dimension no es válida', () => {
    return request(app.getHttpServer())
      .get('/api/reportes-logistica/comparativa-geografica')
      .query({ dimension: 'provincia' })
      .expect(400);
  });

  it('GET efectividad-transportadoras — 200 y cuerpo array', async () => {
    const getRawMany = jest.fn().mockResolvedValue([
      {
        empresa: 'TCC',
        enviados: '4',
        transito: '0',
        devoluciones: '0',
        cancelados: '0',
        rechazados: '0',
        entregados: '4',
      },
    ]);
    createQueryBuilder.mockReturnValue(queryBuilderChain(getRawMany));

    const res = await request(app.getHttpServer())
      .get('/api/reportes-logistica/efectividad-transportadoras')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ empresa: 'TCC', enviados: 4 });
  });

  it('GET comparativa-geografica — 200 con mocks de top + detalle', async () => {
    const topRaw = jest.fn().mockResolvedValue([{ loc: 'ANTIOQUIA', vol: '10' }]);
    const detRaw = jest.fn().mockResolvedValue([
      {
        loc: 'ANTIOQUIA',
        empresa: 'COORDINADORA',
        enviados: '10',
        entregados: '8',
        devoluciones: '1',
      },
    ]);
    let n = 0;
    createQueryBuilder.mockImplementation(() =>
      queryBuilderChain(n++ === 0 ? topRaw : detRaw),
    );

    const res = await request(app.getHttpServer())
      .get('/api/reportes-logistica/comparativa-geografica')
      .query({ dimension: 'departamento', metrica: 'efectividad', top: 15 })
      .expect(200);

    expect(res.body.ubicaciones).toEqual(['ANTIOQUIA']);
    expect(res.body.puntos.length).toBeGreaterThanOrEqual(1);
    expect(res.body.puntos[0]).toMatchObject({
      ubicacion: 'ANTIOQUIA',
      transportadora: 'COORDINADORA',
    });
  });
});

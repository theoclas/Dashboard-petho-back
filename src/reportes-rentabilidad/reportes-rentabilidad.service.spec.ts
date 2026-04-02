import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ReportesRentabilidadService } from './reportes-rentabilidad.service';

describe('ReportesRentabilidadService', () => {
  let service: ReportesRentabilidadService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesRentabilidadService,
        {
          provide: DataSource,
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(ReportesRentabilidadService);
  });

  it('mapea COUNT y filas SQL a camelCase y total', async () => {
    query
      .mockResolvedValueOnce([{ c: 2 }])
      .mockResolvedValueOnce([
        {
          producto: 'Arena 20kg',
          entr: 10,
          tran: 1,
          dev: 2,
          enviados: 15,
          ventas: '1000.5',
          pauta: '50',
          utilidad: '200.25',
          pct_efectividad: 66.7,
          pct_transito: 6.7,
          pct_devolucion: 13.3,
        },
      ]);

    const res = await service.getPorProducto({
      page: 1,
      limit: 20,
      sortBy: 'utilidad',
      order: 'desc',
    });

    expect(res.total).toBe(2);
    expect(res.page).toBe(1);
    expect(res.limit).toBe(20);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      producto: 'Arena 20kg',
      entr: 10,
      pctEfectividad: 66.7,
      ventas: 1000.5,
      pauta: 50,
      utilidad: 200.25,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { ReportesLogisticaService } from './reportes-logistica.service';

function createQueryBuilderMock(getRawMany: jest.Mock) {
  const chain: Record<string, jest.Mock> = {};
  const self = chain as unknown as {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    groupBy: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    addGroupBy: jest.Mock;
    getRawMany: jest.Mock;
  };
  self.select = jest.fn().mockReturnValue(self);
  self.addSelect = jest.fn().mockReturnValue(self);
  self.where = jest.fn().mockReturnValue(self);
  self.andWhere = jest.fn().mockReturnValue(self);
  self.groupBy = jest.fn().mockReturnValue(self);
  self.orderBy = jest.fn().mockReturnValue(self);
  self.limit = jest.fn().mockReturnValue(self);
  self.addGroupBy = jest.fn().mockReturnValue(self);
  self.getRawMany = getRawMany;
  return self;
}

describe('ReportesLogisticaService', () => {
  let service: ReportesLogisticaService;
  let getRawManyEfectividad: jest.Mock;
  let createQueryBuilder: jest.Mock;

  beforeEach(async () => {
    getRawManyEfectividad = jest.fn();
    createQueryBuilder = jest.fn(() => createQueryBuilderMock(getRawManyEfectividad));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesLogisticaService,
        {
          provide: getRepositoryToken(Pedido),
          useValue: {
            createQueryBuilder,
          },
        },
      ],
    }).compile();

    service = module.get(ReportesLogisticaService);
  });

  describe('getEfectividadTransportadoras', () => {
    it('mapea filas SQL a números y porcentajes con un decimal', async () => {
      getRawManyEfectividad.mockResolvedValue([
        {
          empresa: 'ENVIA',
          enviados: '100',
          transito: '10',
          devoluciones: '5',
          cancelados: '2',
          rechazados: '1',
          entregados: '82',
        },
      ]);

      const rows = await service.getEfectividadTransportadoras({});

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        empresa: 'ENVIA',
        enviados: 100,
        transito: 10,
        pctTransito: 10,
        devoluciones: 5,
        pctDevoluciones: 5,
        cancelados: 2,
        rechazados: 1,
        entregados: 82,
        pctEntregados: 82,
      });
      expect(createQueryBuilder).toHaveBeenCalledWith('pedido');
    });
  });

  describe('getComparativaGeografica', () => {
    it('devuelve vacío si no hay ubicaciones en top', async () => {
      const topRaw = jest.fn().mockResolvedValue([]);
      createQueryBuilder.mockReturnValue(createQueryBuilderMock(topRaw));

      const res = await service.getComparativaGeografica({
        dimension: 'departamento',
        metrica: 'efectividad',
        top: 15,
      });

      expect(res.ubicaciones).toEqual([]);
      expect(res.puntos).toEqual([]);
    });

    it('calcula % efectividad y % devolución por celda', async () => {
      const topRaw = jest.fn().mockResolvedValue([{ loc: 'CUNDINAMARCA', vol: '50' }]);
      const detRaw = jest.fn().mockResolvedValue([
        {
          loc: 'CUNDINAMARCA',
          empresa: 'envia',
          enviados: '20',
          entregados: '15',
          devoluciones: '4',
        },
      ]);
      let call = 0;
      createQueryBuilder.mockImplementation(() =>
        createQueryBuilderMock(call++ === 0 ? topRaw : detRaw),
      );

      const ef = await service.getComparativaGeografica({
        dimension: 'departamento',
        metrica: 'efectividad',
        top: 15,
      });
      expect(ef.puntos).toContainEqual({
        ubicacion: 'CUNDINAMARCA',
        transportadora: 'ENVIA',
        valorPct: 75,
        numerador: 15,
        denominador: 20,
      });

      let call2 = 0;
      createQueryBuilder.mockImplementation(() =>
        createQueryBuilderMock(call2++ === 0 ? topRaw : detRaw),
      );
      const dev = await service.getComparativaGeografica({
        dimension: 'departamento',
        metrica: 'devolucion',
        top: 15,
      });
      expect(dev.puntos[0].valorPct).toBe(20);
      expect(dev.puntos[0].numerador).toBe(4);
      expect(dev.puntos[0].denominador).toBe(20);
    });
  });
});

import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetDefaultJydCompany1777001000000 implements MigrationInterface {
  name = 'SetDefaultJydCompany1777001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE empresas
      SET nombre = 'J&D Tiendas Online',
          slug = 'jyd-tiendas-online',
          is_active = true
      WHERE slug = 'empresa-principal'
    `);

    await queryRunner.query(`
      INSERT INTO empresas (nombre, slug, is_active)
      VALUES ('J&D Tiendas Online', 'jyd-tiendas-online', true)
      ON CONFLICT (slug) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE empresas
      SET nombre = 'Empresa principal',
          slug = 'empresa-principal'
      WHERE slug = 'jyd-tiendas-online'
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiEmpresaBase1777000000000 implements MigrationInterface {
  name = 'MultiEmpresaBase1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "empresas" (
        "id" SERIAL PRIMARY KEY,
        "nombre" varchar(150) NOT NULL UNIQUE,
        "slug" varchar(150) NOT NULL UNIQUE,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "empresas" ("nombre", "slug", "is_active")
      VALUES ('Empresa principal', 'empresa-principal', true)
      ON CONFLICT ("slug") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_empresas" (
        "id" SERIAL PRIMARY KEY,
        "user_id" integer NOT NULL,
        "empresa_id" integer NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "fk_user_empresas_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_empresas_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_user_empresas_user_empresa" UNIQUE ("user_id", "empresa_id")
      )
    `);

    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "empresa_id" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "cpas" ADD COLUMN IF NOT EXISTS "empresa_id" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "productos_detalle" ADD COLUMN IF NOT EXISTS "empresa_id" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "cartera_movimientos" ADD COLUMN IF NOT EXISTS "empresa_id" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "notas_manuales" ADD COLUMN IF NOT EXISTS "empresa_id" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "mapeo_estados" ADD COLUMN IF NOT EXISTS "empresa_id" integer NOT NULL DEFAULT 1`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_pedidos_empresa_id" ON "pedidos" ("empresa_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_cpas_empresa_id" ON "cpas" ("empresa_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_productos_detalle_empresa_id" ON "productos_detalle" ("empresa_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_cartera_empresa_id" ON "cartera_movimientos" ("empresa_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_notas_empresa_id" ON "notas_manuales" ("empresa_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_mapeo_empresa_id" ON "mapeo_estados" ("empresa_id")`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_38f6ac7db0f6f1db873e1fd5a6"`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_pedidos_empresa_dropi" ON "pedidos" ("empresa_id", "id_dropi") WHERE "id_dropi" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_mapeo_empresa_triple" ON "mapeo_estados" ("empresa_id","transportadora","estatus_original","ultimo_movimiento")`);

    await queryRunner.query(`
      INSERT INTO "user_empresas" ("user_id", "empresa_id", "is_active")
      SELECT u.id, e.id, true
      FROM "users" u
      CROSS JOIN "empresas" e
      WHERE e.slug = 'empresa-principal'
      ON CONFLICT ("user_id", "empresa_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mapeo_empresa_triple"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pedidos_empresa_dropi"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mapeo_empresa_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notas_empresa_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cartera_empresa_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_productos_detalle_empresa_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cpas_empresa_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pedidos_empresa_id"`);

    await queryRunner.query(`ALTER TABLE "mapeo_estados" DROP COLUMN IF EXISTS "empresa_id"`);
    await queryRunner.query(`ALTER TABLE "notas_manuales" DROP COLUMN IF EXISTS "empresa_id"`);
    await queryRunner.query(`ALTER TABLE "cartera_movimientos" DROP COLUMN IF EXISTS "empresa_id"`);
    await queryRunner.query(`ALTER TABLE "productos_detalle" DROP COLUMN IF EXISTS "empresa_id"`);
    await queryRunner.query(`ALTER TABLE "cpas" DROP COLUMN IF EXISTS "empresa_id"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN IF EXISTS "empresa_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "user_empresas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "empresas"`);
  }
}

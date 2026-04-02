import request from 'supertest';

/**
 * Pruebas contra una API ya desplegada (local o Hostinger) con datos reales.
 * No se ejecutan salvo que definas ambas variables:
 *
 * PowerShell:
 *   $env:E2E_BASE_URL="http://localhost:3001/api"
 *   $env:E2E_JWT="<token JWT de un usuario válido>"
 *   npm run test:e2e -- --testPathPattern=reportes-api-live
 *
 * Bash:
 *   E2E_BASE_URL=http://localhost:3001/api E2E_JWT=... npm run test:e2e -- --testPathPattern=reportes-api-live
 */
const base = (process.env.E2E_BASE_URL ?? '').replace(/\/$/, '');
const jwt = process.env.E2E_JWT ?? '';

const runLive = Boolean(base && jwt);
const liveDescribe = runLive ? describe : describe.skip;

liveDescribe('Reportes API (instancia real, E2E_BASE_URL + E2E_JWT)', () => {
  const auth = { Authorization: `Bearer ${jwt}` };

  it('efectividad-transportadoras → 200 y array', async () => {
    const res = await request(base)
      .get('/reportes-logistica/efectividad-transportadoras')
      .set(auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('comparativa-geografica → 200 y forma { ubicaciones, puntos }', async () => {
    const res = await request(base)
      .get('/reportes-logistica/comparativa-geografica')
      .query({ dimension: 'departamento', metrica: 'efectividad', top: 5 })
      .set(auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.ubicaciones)).toBe(true);
    expect(Array.isArray(res.body.puntos)).toBe(true);
  });

  it('por-producto → 200 y forma paginada', async () => {
    const res = await request(base)
      .get('/reportes-rentabilidad/por-producto')
      .query({ page: 1, limit: 5 })
      .set(auth);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('sin token → 401 en reportes logística', async () => {
    const res = await request(base).get('/reportes-logistica/efectividad-transportadoras');
    expect(res.status).toBe(401);
  });
});

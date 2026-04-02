-- Sugerencias de índices para reportes de logística y filtros por fecha.
-- Revisar en un entorno de staging con EXPLAIN ANALYZE antes de aplicar en producción.
-- Tabla: pedidos

-- Consultas frecuentes: WHERE fecha BETWEEN ... AND ... y agrupación por transportadora / departamento / ciudad
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pedidos_fecha_transportadora
  ON pedidos (fecha, transportadora)
  WHERE transportadora IS NOT NULL AND TRIM(transportadora) <> '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pedidos_fecha_departamento
  ON pedidos (fecha, departamento)
  WHERE departamento IS NOT NULL AND TRIM(departamento) <> '';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pedidos_fecha_ciudad
  ON pedidos (fecha, ciudad)
  WHERE ciudad IS NOT NULL AND TRIM(ciudad) <> '';

-- productos_detalle: join por pedido y filtro por nombre
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_productos_detalle_pedido_producto
  ON productos_detalle (pedido_id_dropi, producto_nombre);

-- cpas: agregación de pauta por producto y fecha (ajustar si el volumen lo exige)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cpas_fecha
  ON cpas (fecha);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cpas_producto
  ON cpas (producto);

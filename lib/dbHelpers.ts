/**
 * Helper functions for Turso/libSQL database operations
 */

import { Client } from '@libsql/client';

export async function selectAll<T = any>(
  db: Client,
  table: string,
  columns: string = '*',
  orderBy?: { column: string; ascending?: boolean }
): Promise<T[]> {
  let query = `SELECT ${columns} FROM ${table}`;
  if (orderBy) {
    query += ` ORDER BY ${orderBy.column} ${orderBy.ascending !== false ? 'ASC' : 'DESC'}`;
  }
  const result = await db.execute(query);
  return result.rows as T[];
}

export async function selectOne<T = any>(
  db: Client,
  table: string,
  where: { column: string; value: any }
): Promise<T | null> {
  const query = `SELECT * FROM ${table} WHERE ${where.column} = ? LIMIT 1`;
  const result = await db.execute({ sql: query, args: [where.value] });
  return (result.rows[0] as T) || null;
}

export async function selectWhere<T = any>(
  db: Client,
  table: string,
  where: { column: string; value: any },
  columns: string = '*',
  orderBy?: { column: string; ascending?: boolean }
): Promise<T[]> {
  let query = `SELECT ${columns} FROM ${table} WHERE ${where.column} = ?`;
  if (orderBy) {
    query += ` ORDER BY ${orderBy.column} ${orderBy.ascending !== false ? 'ASC' : 'DESC'}`;
  }
  const result = await db.execute({ sql: query, args: [where.value] });
  return result.rows as T[];
}

export async function insert<T = any>(
  db: Client,
  table: string,
  data: Record<string, any>
): Promise<T> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map(() => '?').join(', ');
  const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const result = await db.execute({ sql: query, args: values });
  return result.rows[0] as T;
}

export async function update<T = any>(
  db: Client,
  table: string,
  data: Record<string, any>,
  where: { column: string; value: any }
): Promise<T | null> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const setClause = columns.map(col => `${col} = ?`).join(', ');
  const query = `UPDATE ${table} SET ${setClause} WHERE ${where.column} = ? RETURNING *`;
  const result = await db.execute({ sql: query, args: [...values, where.value] });
  return (result.rows[0] as T) || null;
}

export async function deleteWhere(
  db: Client,
  table: string,
  where: { column: string; value: any }
): Promise<void> {
  const query = `DELETE FROM ${table} WHERE ${where.column} = ?`;
  await db.execute({ sql: query, args: [where.value] });
}

export async function deleteAll(
  db: Client,
  table: string
): Promise<void> {
  const query = `DELETE FROM ${table}`;
  await db.execute(query);
}

export async function count(
  db: Client,
  table: string,
  where?: { column: string; value: any }
): Promise<number> {
  let query = `SELECT COUNT(*) as count FROM ${table}`;
  if (where) {
    query += ` WHERE ${where.column} = ?`;
    const result = await db.execute({ sql: query, args: [where.value] });
    return (result.rows[0] as any)?.count || 0;
  }
  const result = await db.execute(query);
  return (result.rows[0] as any)?.count || 0;
}

export async function selectWhereOr(
  db: Client,
  table: string,
  where: { column: string; value: any },
  orConditions: Array<{ column: string; value: any }>,
  columns: string = '*',
  orderBy?: { column: string; ascending?: boolean }
): Promise<any[]> {
  let query = `SELECT ${columns} FROM ${table} WHERE ${where.column} = ? AND (`;
  const args: any[] = [where.value];
  const orClauses: string[] = [];
  orConditions.forEach((cond, idx) => {
    if (cond.value === null) {
      orClauses.push(`${cond.column} IS NULL`);
    } else {
      orClauses.push(`${cond.column} = ?`);
      args.push(cond.value);
    }
  });
  query += orClauses.join(' OR ') + ')';
  if (orderBy) {
    query += ` ORDER BY ${orderBy.column} ${orderBy.ascending !== false ? 'ASC' : 'DESC'}`;
  }
  const result = await db.execute({ sql: query, args });
  return result.rows;
}

export async function selectWhereIn<T = any>(
  db: Client,
  table: string,
  where: { column: string; values: any[] },
  columns: string = '*'
): Promise<T[]> {
  if (where.values.length === 0) return [];
  const placeholders = where.values.map(() => '?').join(', ');
  const query = `SELECT ${columns} FROM ${table} WHERE ${where.column} IN (${placeholders})`;
  const result = await db.execute({ sql: query, args: where.values });
  return result.rows as T[];
}


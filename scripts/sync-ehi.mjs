#!/usr/bin/env node
/**
 * EHI SQL Server → Neon PostgreSQL Sync Script (v2 — Bulk optimized)
 *
 * Uses PostgreSQL unnest() for bulk inserts instead of row-by-row.
 * Full sync now takes ~1 min instead of ~35 min.
 *
 * Prerequisites:
 *   npm install mssql pg dotenv   (these are NOT in package.json — sync-only deps)
 *
 * Usage:
 *   node scripts/sync-ehi.mjs               # Full sync
 *   node scripts/sync-ehi.mjs --init        # Create tables (first run)
 *   node scripts/sync-ehi.mjs --discover    # Discovery queries only
 *
 * Environment:
 *   EHI_SQL_HOST=10.63.100.46
 *   EHI_SQL_PORT=1433
 *   EHI_SQL_USER=sa
 *   EHI_SQL_PASSWORD=eit@2019
 *   EHI_SQL_DATABASE=EMBH
 *   EHI_DATABASE_URL=postgresql://...@neon.tech/ehi_wip
 */

import sql from 'mssql';
import pg from 'pg';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '..', '.env.local') });
dotenvConfig({ path: join(__dirname, '..', '.env') });
dotenvConfig({ path: join(__dirname, '.env') });

// ============================================================================
// Config
// ============================================================================

const EHI_SQL_CONFIG = {
  server: process.env.EHI_SQL_HOST || '10.63.100.46',
  port: parseInt(process.env.EHI_SQL_PORT || '1433'),
  database: process.env.EHI_SQL_DATABASE || 'EMBH',
  user: process.env.EHI_SQL_USER || 'sa',
  password: process.env.EHI_SQL_PASSWORD || 'eit@2019',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000, // 5 min for large queries
    connectionTimeout: 30000,
  },
};

const EHI_PG_URL = process.env.EHI_DATABASE_URL;

// ============================================================================
// Process Stage Mapping — Maps EHI process numbers to WIP stages
// ============================================================================

const WIP_STAGE = {
  ON_LOOM: 'on_loom',
  FINISHING: 'finishing',
  FG_GODOWN: 'fg_godown',
  PACKED: 'packed',
};

function getWipStage(processId) {
  if (processId === 1) return WIP_STAGE.ON_LOOM;
  if ([7, 25, 27].includes(processId)) return WIP_STAGE.PACKED;
  if ([21, 22].includes(processId)) return WIP_STAGE.FG_GODOWN;
  if (processId >= 2 && processId <= 37) return WIP_STAGE.FINISHING;
  return WIP_STAGE.ON_LOOM;
}

// ============================================================================
// Logging
// ============================================================================

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] ${msg}`);
}

function logError(msg, err) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.error(`[${ts}] ERROR: ${msg}`, err?.message || err);
}

// ============================================================================
// Schema
// ============================================================================

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS ehi_orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(100),
  order_id_src INT,
  buyer_code VARCHAR(50),
  order_date DATE,
  dispatch_date DATE,
  status VARCHAR(20),
  local_order VARCHAR(200),
  total_pcs INT DEFAULT 0,
  total_items INT DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ehi_order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES ehi_orders(id) ON DELETE CASCADE,
  order_detail_id_src INT,
  order_id_src INT,
  item_finished_id INT,
  design_name VARCHAR(200),
  size VARCHAR(100),
  color VARCHAR(200),
  quality VARCHAR(200),
  ordered_qty INT DEFAULT 0,
  article_no VARCHAR(100),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ehi_carpets (
  id SERIAL PRIMARY KEY,
  stock_no INT,
  t_stock_no VARCHAR(100),
  order_item_id INT REFERENCES ehi_order_items(id) ON DELETE CASCADE,
  current_process INT,
  current_process_name VARCHAR(200),
  wip_stage VARCHAR(30),
  is_packed BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ehi_process_names (
  id INT PRIMARY KEY,
  name VARCHAR(200),
  short_name VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS ehi_sync_log (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(50),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  orders_synced INT DEFAULT 0,
  items_synced INT DEFAULT 0,
  carpets_synced INT DEFAULT 0,
  errors TEXT,
  status VARCHAR(20) DEFAULT 'running'
);

CREATE INDEX IF NOT EXISTS idx_ehi_carpets_order_item ON ehi_carpets(order_item_id);
CREATE INDEX IF NOT EXISTS idx_ehi_carpets_process ON ehi_carpets(current_process);
CREATE INDEX IF NOT EXISTS idx_ehi_carpets_wip_stage ON ehi_carpets(wip_stage);
CREATE INDEX IF NOT EXISTS idx_ehi_orders_status ON ehi_orders(status);
CREATE INDEX IF NOT EXISTS idx_ehi_orders_order_no ON ehi_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_ehi_carpets_stock_no ON ehi_carpets(stock_no);
`;

// ============================================================================
// Discovery Queries
// ============================================================================

async function runDiscovery(sqlPool) {
  log('=== Running Discovery Queries ===');

  log('\n--- Process Names (PROCESS_NAME_MASTER) ---');
  const procs = await sqlPool.query(
    'SELECT PROCESS_NAME_ID, PROCESS_NAME, ShortName FROM PROCESS_NAME_MASTER ORDER BY PROCESS_NAME_ID'
  );
  procs.recordset.forEach(p => {
    log(`  ${p.PROCESS_NAME_ID}: ${p.PROCESS_NAME} (${p.ShortName || ''})`);
  });

  log('\n--- Order Status Distribution ---');
  const statuses = await sqlPool.query(
    "SELECT Status, COUNT(*) as cnt FROM OrderMaster GROUP BY Status"
  );
  statuses.recordset.forEach(s => {
    log(`  Status '${s.Status}': ${s.cnt} orders`);
  });

  log('\n--- Sample Open Orders (top 5) ---');
  const orders = await sqlPool.query(`
    SELECT TOP 5 om.OrderId, om.CustomerOrderNo, ci.CustomerCode,
           om.OrderDate, om.DispatchDate, om.LocalOrder
    FROM OrderMaster om
    LEFT JOIN customerinfo ci ON ci.CustomerId = om.CustomerId
    WHERE om.Status = '0'
    ORDER BY om.OrderDate DESC
  `);
  orders.recordset.forEach(o => {
    log(`  ${o.CustomerOrderNo} | ${o.CustomerCode} | ${o.LocalOrder}`);
  });

  log('\n--- Carpet Process Distribution (Open Orders) ---');
  const dist = await sqlPool.query(`
    SELECT cn.CurrentProStatus, pnm.PROCESS_NAME, COUNT(*) as cnt
    FROM CarpetNumber cn
    JOIN OrderMaster om ON om.OrderId = cn.OrderId
    LEFT JOIN PROCESS_NAME_MASTER pnm ON pnm.PROCESS_NAME_ID = cn.CurrentProStatus
    WHERE om.Status = '0'
    GROUP BY cn.CurrentProStatus, pnm.PROCESS_NAME
    ORDER BY cn.CurrentProStatus
  `);
  dist.recordset.forEach(d => {
    log(`  Process ${d.CurrentProStatus} (${d.PROCESS_NAME || 'NONE'}): ${d.cnt} carpets → ${getWipStage(d.CurrentProStatus)}`);
  });

  log('\n=== Discovery Complete ===');
}

// ============================================================================
// Bulk Insert Helpers
// ============================================================================

/**
 * Bulk insert using unnest arrays. Fast: 10K+ rows per query.
 * @param {pg.Client} pgClient
 * @param {string} table - Table name
 * @param {string[]} columns - Column names
 * @param {string[]} types - PostgreSQL types for unnest casting (e.g. 'int[]', 'text[]')
 * @param {Array[]} arrays - Array of column arrays (each column's values as an array)
 * @param {number} batchSize - Rows per INSERT (default 10000)
 */
async function bulkInsert(pgClient, table, columns, types, arrays, batchSize = 10000) {
  const totalRows = arrays[0].length;
  if (totalRows === 0) return;

  for (let offset = 0; offset < totalRows; offset += batchSize) {
    const end = Math.min(offset + batchSize, totalRows);
    const batchArrays = arrays.map(arr => arr.slice(offset, end));

    const unnestParams = types.map((type, i) => `$${i + 1}::${type}`).join(', ');
    const colAliases = columns.join(', ');

    await pgClient.query(
      `INSERT INTO ${table} (${colAliases}, synced_at)
       SELECT ${columns.map((_, i) => `u.c${i}`).join(', ')}, NOW()
       FROM unnest(${unnestParams}) AS u(${columns.map((_, i) => `c${i}`).join(', ')})`,
      batchArrays
    );
  }
}

// ============================================================================
// Sync Logic (v2 — Bulk)
// ============================================================================

async function syncOrders(sqlPool, pgClient) {
  log('Syncing orders...');

  const result = await sqlPool.query(`
    SELECT
      om.OrderId,
      om.CustomerOrderNo,
      ci.CustomerCode,
      om.OrderDate,
      om.DispatchDate,
      om.Status,
      om.LocalOrder,
      (SELECT COUNT(*) FROM OrderDetail od WHERE od.OrderId = om.OrderId) as ItemCount,
      (SELECT ISNULL(SUM(od.QtyRequired), 0) FROM OrderDetail od WHERE od.OrderId = om.OrderId) as TotalPcs
    FROM OrderMaster om
    LEFT JOIN customerinfo ci ON ci.CustomerId = om.CustomerId
    WHERE om.Status = '0'
    ORDER BY om.CustomerOrderNo
  `);

  log(`  Found ${result.recordset.length} open orders in EHI`);

  // Clear existing
  await pgClient.query('TRUNCATE ehi_carpets, ehi_order_items, ehi_orders RESTART IDENTITY CASCADE');

  // Build column arrays
  const orderNos = [];
  const orderIdSrcs = [];
  const buyerCodes = [];
  const orderDates = [];
  const dispatchDates = [];
  const statuses = [];
  const localOrders = [];
  const totalPcs = [];
  const totalItems = [];

  for (const o of result.recordset) {
    orderNos.push(o.CustomerOrderNo || '');
    orderIdSrcs.push(o.OrderId);
    buyerCodes.push(o.CustomerCode || '');
    orderDates.push(o.OrderDate || null);
    dispatchDates.push(o.DispatchDate || null);
    statuses.push(o.Status || '0');
    localOrders.push(o.LocalOrder || '');
    totalPcs.push(o.TotalPcs || 0);
    totalItems.push(o.ItemCount || 0);
  }

  await bulkInsert(pgClient, 'ehi_orders',
    ['order_no', 'order_id_src', 'buyer_code', 'order_date', 'dispatch_date', 'status', 'local_order', 'total_pcs', 'total_items'],
    ['text[]', 'int[]', 'text[]', 'date[]', 'date[]', 'text[]', 'text[]', 'int[]', 'int[]'],
    [orderNos, orderIdSrcs, buyerCodes, orderDates, dispatchDates, statuses, localOrders, totalPcs, totalItems],
    5000
  );

  // Build orderIdMap: EHI OrderId → PG id
  const mapResult = await pgClient.query('SELECT id, order_id_src FROM ehi_orders');
  const orderIdMap = new Map();
  for (const row of mapResult.rows) {
    orderIdMap.set(row.order_id_src, row.id);
  }

  log(`  Synced ${orderIdMap.size} orders`);
  return orderIdMap;
}

async function syncOrderItems(sqlPool, pgClient, orderIdMap) {
  log('Syncing order items...');

  const ehiOrderIds = Array.from(orderIdMap.keys());
  if (ehiOrderIds.length === 0) return new Map();

  // Fetch all items from SQL Server (batched)
  const SQL_BATCH = 200;
  let allItems = [];

  for (let i = 0; i < ehiOrderIds.length; i += SQL_BATCH) {
    const batch = ehiOrderIds.slice(i, i + SQL_BATCH);
    const idList = batch.join(',');

    const result = await sqlPool.query(`
      SELECT
        od.OrderDetailId,
        od.OrderId,
        od.Item_Finished_Id,
        od.QtyRequired,
        od.ArticalNo,
        COALESCE(d.designName, '') as DesignName,
        COALESCE(sz.SizeFt, '') as SizeName,
        COALESCE(col.ColorName, '') as ColorName,
        COALESCE(q.QualityName, '') as QualityName
      FROM OrderDetail od
      LEFT JOIN ITEM_PARAMETER_MASTER ipm ON ipm.ITEM_FINISHED_ID = od.Item_Finished_Id
      LEFT JOIN Design d ON d.designId = ipm.DESIGN_ID
      LEFT JOIN Size sz ON sz.SizeId = ipm.SIZE_ID
      LEFT JOIN Color col ON col.ColorId = ipm.COLOR_ID
      LEFT JOIN Quality q ON q.QualityId = ipm.QUALITY_ID
      WHERE od.OrderId IN (${idList})
      ORDER BY od.OrderId, od.OrderDetailId
    `);

    allItems = allItems.concat(result.recordset);
  }

  log(`  Found ${allItems.length} order items`);

  // Build column arrays
  const orderIds = [];
  const orderDetailIdSrcs = [];
  const orderIdSrcs = [];
  const itemFinishedIds = [];
  const designNames = [];
  const sizes = [];
  const colors = [];
  const qualities = [];
  const orderedQtys = [];
  const articleNos = [];

  for (const item of allItems) {
    const pgOrderId = orderIdMap.get(item.OrderId);
    if (!pgOrderId) continue;

    orderIds.push(pgOrderId);
    orderDetailIdSrcs.push(item.OrderDetailId);
    orderIdSrcs.push(item.OrderId);
    itemFinishedIds.push(item.Item_Finished_Id);
    designNames.push(item.DesignName || '');
    sizes.push(item.SizeName || '');
    colors.push(item.ColorName || '');
    qualities.push(item.QualityName || '');
    orderedQtys.push(item.QtyRequired || 0);
    articleNos.push(item.ArticalNo || '');
  }

  await bulkInsert(pgClient, 'ehi_order_items',
    ['order_id', 'order_detail_id_src', 'order_id_src', 'item_finished_id', 'design_name', 'size', 'color', 'quality', 'ordered_qty', 'article_no'],
    ['int[]', 'int[]', 'int[]', 'int[]', 'text[]', 'text[]', 'text[]', 'text[]', 'int[]', 'text[]'],
    [orderIds, orderDetailIdSrcs, orderIdSrcs, itemFinishedIds, designNames, sizes, colors, qualities, orderedQtys, articleNos],
    5000
  );

  // Build itemIdMap: "ehiOrderId-itemFinishedId" → PG id
  const mapResult = await pgClient.query('SELECT id, order_id_src, item_finished_id FROM ehi_order_items');
  const itemIdMap = new Map();
  for (const row of mapResult.rows) {
    const key = `${row.order_id_src}-${row.item_finished_id}`;
    itemIdMap.set(key, row.id);
  }

  log(`  Synced ${itemIdMap.size} order items`);
  return itemIdMap;
}

async function syncCarpets(sqlPool, pgClient, orderIdMap, itemIdMap) {
  log('Syncing carpets (bulk mode)...');

  const ehiOrderIds = Array.from(orderIdMap.keys());
  if (ehiOrderIds.length === 0) return 0;

  let carpetCount = 0;
  const SQL_BATCH = 200;
  const PG_BATCH = 10000;

  // Accumulate carpets across SQL batches, flush to PG in PG_BATCH chunks
  let stockNos = [];
  let tStockNos = [];
  let orderItemIds = [];
  let currentProcesses = [];
  let processNames = [];
  let wipStages = [];
  let isPackedArr = [];

  async function flushCarpets() {
    if (stockNos.length === 0) return;

    await bulkInsert(pgClient, 'ehi_carpets',
      ['stock_no', 't_stock_no', 'order_item_id', 'current_process', 'current_process_name', 'wip_stage', 'is_packed'],
      ['int[]', 'text[]', 'int[]', 'int[]', 'text[]', 'text[]', 'boolean[]'],
      [stockNos, tStockNos, orderItemIds, currentProcesses, processNames, wipStages, isPackedArr],
      PG_BATCH
    );

    carpetCount += stockNos.length;

    // Reset buffers
    stockNos = [];
    tStockNos = [];
    orderItemIds = [];
    currentProcesses = [];
    processNames = [];
    wipStages = [];
    isPackedArr = [];
  }

  for (let i = 0; i < ehiOrderIds.length; i += SQL_BATCH) {
    const orderBatch = ehiOrderIds.slice(i, i + SQL_BATCH);
    const idList = orderBatch.join(',');

    const result = await sqlPool.query(`
      SELECT
        cn.StockNo,
        cn.TStockNo,
        cn.OrderId,
        cn.Item_Finished_Id,
        cn.CurrentProStatus,
        COALESCE(pnm.PROCESS_NAME, '') as ProcessName,
        CASE WHEN cn.PackingID IS NOT NULL THEN 1 ELSE 0 END as IsPacked
      FROM CarpetNumber cn
      LEFT JOIN PROCESS_NAME_MASTER pnm ON pnm.PROCESS_NAME_ID = cn.CurrentProStatus
      WHERE cn.OrderId IN (${idList})
    `);

    for (const carpet of result.recordset) {
      const key = `${carpet.OrderId}-${carpet.Item_Finished_Id}`;
      const pgItemId = itemIdMap.get(key) || null;
      const wipStage = getWipStage(carpet.CurrentProStatus);

      stockNos.push(carpet.StockNo);
      tStockNos.push(carpet.TStockNo || '');
      orderItemIds.push(pgItemId);
      currentProcesses.push(carpet.CurrentProStatus || null);
      processNames.push(carpet.ProcessName || '');
      wipStages.push(wipStage);
      isPackedArr.push(carpet.IsPacked === 1);
    }

    // Flush when buffer is large enough
    if (stockNos.length >= PG_BATCH) {
      await flushCarpets();
      log(`  ... ${carpetCount} carpets synced (orders batch ${Math.min(i + SQL_BATCH, ehiOrderIds.length)}/${ehiOrderIds.length})`);
    }
  }

  // Flush remaining
  await flushCarpets();

  log(`  Synced ${carpetCount} carpets total`);
  return carpetCount;
}

async function syncProcessNames(sqlPool, pgClient) {
  log('Syncing process names...');

  const result = await sqlPool.query(
    'SELECT PROCESS_NAME_ID, PROCESS_NAME, ShortName FROM PROCESS_NAME_MASTER ORDER BY PROCESS_NAME_ID'
  );

  await pgClient.query('DELETE FROM ehi_process_names');

  // Small table (37 rows), simple multi-value INSERT
  const values = [];
  const params = [];
  let idx = 1;

  for (const proc of result.recordset) {
    values.push(`($${idx++}, $${idx++}, $${idx++})`);
    params.push(proc.PROCESS_NAME_ID, proc.PROCESS_NAME, proc.ShortName || '');
  }

  if (values.length > 0) {
    await pgClient.query(
      `INSERT INTO ehi_process_names (id, name, short_name) VALUES ${values.join(', ')}
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, short_name = EXCLUDED.short_name`,
      params
    );
  }

  log(`  Synced ${result.recordset.length} process names`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const isInit = args.includes('--init');
  const isDiscover = args.includes('--discover');

  log('=== EHI WIP Sync Starting ===');

  let sqlPool = null;
  let pgClient = null;

  try {
    log('Connecting to EHI SQL Server...');
    sqlPool = await sql.connect(EHI_SQL_CONFIG);
    log('  Connected to SQL Server');

    if (isDiscover) {
      await runDiscovery(sqlPool);
      return;
    }

    if (!EHI_PG_URL) {
      throw new Error('EHI_DATABASE_URL not set! Set it in .env or scripts/.env');
    }

    log('Connecting to EHI Neon PostgreSQL...');
    pgClient = new pg.Client({ connectionString: EHI_PG_URL, ssl: { rejectUnauthorized: false } });
    await pgClient.connect();
    log('  Connected to Neon PostgreSQL');

    if (isInit) {
      log('Creating tables...');
      await pgClient.query(CREATE_TABLES_SQL);
      log('  Tables created successfully');
      log('=== Init Complete — Run without --init for full sync ===');
      return;
    }

    // Add order_id_src column to ehi_order_items if missing (migration from v1)
    try {
      await pgClient.query(`
        ALTER TABLE ehi_order_items ADD COLUMN IF NOT EXISTS order_id_src INT
      `);
    } catch {}

    // Log sync start
    const syncLogRes = await pgClient.query(`
      INSERT INTO ehi_sync_log (sync_type, started_at, status)
      VALUES ('full', NOW(), 'running')
      RETURNING id
    `);
    const syncLogId = syncLogRes.rows[0].id;

    const startTime = Date.now();

    try {
      await syncProcessNames(sqlPool, pgClient);

      // Transaction: if anything fails, old data preserved via ROLLBACK
      await pgClient.query('BEGIN');

      try {
        const orderIdMap = await syncOrders(sqlPool, pgClient);
        const itemIdMap = await syncOrderItems(sqlPool, pgClient, orderIdMap);
        const carpetCount = await syncCarpets(sqlPool, pgClient, orderIdMap, itemIdMap);

        await pgClient.query('COMMIT');

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        await pgClient.query(`
          UPDATE ehi_sync_log SET
            finished_at = NOW(),
            orders_synced = $2,
            items_synced = $3,
            carpets_synced = $4,
            status = 'success'
          WHERE id = $1
        `, [syncLogId, orderIdMap.size, itemIdMap.size, carpetCount]);

        log(`\n=== Sync Complete (${elapsed}s) ===`);
        log(`  Orders: ${orderIdMap.size}`);
        log(`  Items: ${itemIdMap.size}`);
        log(`  Carpets: ${carpetCount}`);

      } catch (txErr) {
        await pgClient.query('ROLLBACK');
        log('Transaction rolled back — old data preserved');
        throw txErr;
      }

    } catch (syncErr) {
      await pgClient.query(`
        UPDATE ehi_sync_log SET
          finished_at = NOW(),
          errors = $2,
          status = 'error'
        WHERE id = $1
      `, [syncLogId, syncErr.message]);

      throw syncErr;
    }

  } catch (err) {
    logError('Sync failed', err);
    process.exit(1);
  } finally {
    if (sqlPool) {
      try { await sqlPool.close(); } catch {}
    }
    if (pgClient) {
      try { await pgClient.end(); } catch {}
    }
  }
}

main();

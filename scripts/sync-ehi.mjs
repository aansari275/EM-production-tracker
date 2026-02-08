#!/usr/bin/env node
/**
 * EHI SQL Server → Neon PostgreSQL Sync Script
 *
 * Syncs WIP-relevant data from EHI's SQL Server (EMBH database)
 * to a Neon PostgreSQL database for the Production Tracker WIP view.
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

// Process stages from PROCESS_NAME_MASTER:
// 1=WEAVING, 2=WASHING, 3=FINISHING, 4=KNOTTING, 5=DYEING, 6=STRETCHING,
// 7=PACKING, 8=BINDING, 9=PURCHASE, 10=STORE, 11=YARN OPENING, 12=WARPING WOOL,
// 13=WARPING COTTON, 14=CLIPPING, 15=LATX & THI PCK, 16=MENDING, 17=FOLDING,
// 18=TABLE TUFT, 19=REPAIRING, 20=FINISHING-1, 21=AQL, 22=MOVE TO WAREHOUSE,
// 23=TUMPLING, 24=EDGE BINDING, 25=SAMPLING PACKED, 26=FARGSTARK RED,
// 27=PACKING-RT, 28=CUTTING, 29=OVERLOCKING, 30=FRINGING, 31=DUBBLE NIDDLE,
// 32=SPINNING, 33=STITCHING, 34=TUSCEL, 35=PRE PILE CUTTING,
// 36=MOVE TO FINISHING, 37=MOVE TO EMPL
//
// BAZAR NOTE: "Bazar" is NOT a process in EHI. It's the event of receiving the rug
// from the weaver (off-loom). In the ERP, it's tracked via PROCESS_RECEIVE_MASTER_1 /
// PROCESS_RECEIVE_DETAIL_1. Once CurrentProStatus moves past 1 (WEAVING), the rug
// has gone through bazar. For WIP, we track "bazar_done" as CurrentProStatus > 1.
// The wip_stage field tracks the CURRENT location, not whether bazar happened.

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
  // Everything past weaving and not packed/FG = finishing pipeline
  if (processId >= 2 && processId <= 37) return WIP_STAGE.FINISHING;
  return WIP_STAGE.ON_LOOM; // Default
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
// Schema — Create EHI tables in Neon PostgreSQL
// ============================================================================

const CREATE_TABLES_SQL = `
-- EHI WIP Schema (simplified for Production Tracker)

CREATE TABLE IF NOT EXISTS ehi_orders (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(100),              -- CustomerOrderNo (e.g., "EM-25-1148")
  order_id_src INT,                   -- Original OrderMaster.OrderId
  buyer_code VARCHAR(50),             -- customerinfo.CustomerCode (e.g., "J-01")
  order_date DATE,
  dispatch_date DATE,                 -- Ex-factory date
  status VARCHAR(20),                 -- '0'=Open, '1'=Closed
  local_order VARCHAR(200),           -- LocalOrder field (orderNo, buyerCode, ref)
  total_pcs INT DEFAULT 0,
  total_items INT DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ehi_order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES ehi_orders(id) ON DELETE CASCADE,
  order_detail_id_src INT,            -- Original OrderDetail.OrderDetailId
  item_finished_id INT,               -- ITEM_PARAMETER_MASTER key
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
  stock_no INT,                       -- CarpetNumber.StockNo
  t_stock_no VARCHAR(100),            -- CarpetNumber.TStockNo (text stock no)
  order_item_id INT REFERENCES ehi_order_items(id) ON DELETE CASCADE,
  current_process INT,                -- CarpetNumber.CurrentProStatus (process ID)
  current_process_name VARCHAR(200),
  wip_stage VARCHAR(30),              -- Mapped: on_loom, bazar, finishing, fg_godown, packed
  is_packed BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ehi_process_names (
  id INT PRIMARY KEY,                 -- PROCESS_NAME_ID
  name VARCHAR(200),                  -- PROCESS_NAME
  short_name VARCHAR(50)              -- ShortName
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

-- Indexes
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

  // Process names
  log('\n--- Process Names (PROCESS_NAME_MASTER) ---');
  const procs = await sqlPool.query(
    'SELECT PROCESS_NAME_ID, PROCESS_NAME, ShortName FROM PROCESS_NAME_MASTER ORDER BY PROCESS_NAME_ID'
  );
  procs.recordset.forEach(p => {
    log(`  ${p.PROCESS_NAME_ID}: ${p.PROCESS_NAME} (${p.ShortName || ''})`);
  });

  // Open orders count
  log('\n--- Order Status Distribution ---');
  const statuses = await sqlPool.query(
    "SELECT Status, COUNT(*) as cnt FROM OrderMaster GROUP BY Status"
  );
  statuses.recordset.forEach(s => {
    log(`  Status '${s.Status}': ${s.cnt} orders`);
  });

  // Sample open order with detail
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

  // Carpet process distribution
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
// Sync Logic
// ============================================================================

async function syncOrders(sqlPool, pgClient) {
  log('Syncing orders...');

  // Fetch open orders from EHI (Status = '0')
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

  // Clear existing and insert fresh
  await pgClient.query('DELETE FROM ehi_carpets');
  await pgClient.query('DELETE FROM ehi_order_items');
  await pgClient.query('DELETE FROM ehi_orders');

  let orderCount = 0;
  const orderIdMap = new Map(); // EHI OrderId → PG id

  for (const order of result.recordset) {
    const res = await pgClient.query(`
      INSERT INTO ehi_orders (order_no, order_id_src, buyer_code, order_date, dispatch_date, status, local_order, total_pcs, total_items, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id
    `, [
      order.CustomerOrderNo || '',
      order.OrderId,
      order.CustomerCode || '',
      order.OrderDate || null,
      order.DispatchDate || null,
      order.Status || '0',
      order.LocalOrder || '',
      order.TotalPcs || 0,
      order.ItemCount || 0,
    ]);

    orderIdMap.set(order.OrderId, res.rows[0].id);
    orderCount++;
  }

  log(`  Synced ${orderCount} orders`);
  return orderIdMap;
}

async function syncOrderItems(sqlPool, pgClient, orderIdMap) {
  log('Syncing order items...');

  const ehiOrderIds = Array.from(orderIdMap.keys());
  if (ehiOrderIds.length === 0) return new Map();

  // Batch in groups to avoid SQL query length limits
  const BATCH = 200;
  let allItems = [];

  for (let i = 0; i < ehiOrderIds.length; i += BATCH) {
    const batch = ehiOrderIds.slice(i, i + BATCH);
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

  let itemCount = 0;
  const itemIdMap = new Map(); // Key: "OrderId-Item_Finished_Id" → PG id

  for (const item of allItems) {
    const pgOrderId = orderIdMap.get(item.OrderId);
    if (!pgOrderId) continue;

    const res = await pgClient.query(`
      INSERT INTO ehi_order_items (order_id, order_detail_id_src, item_finished_id, design_name, size, color, quality, ordered_qty, article_no, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id
    `, [
      pgOrderId,
      item.OrderDetailId,
      item.Item_Finished_Id,
      item.DesignName || '',
      item.SizeName || '',
      item.ColorName || '',
      item.QualityName || '',
      item.QtyRequired || 0,
      item.ArticalNo || '',
    ]);

    // Key by OrderId + Item_Finished_Id (how CarpetNumber links to OrderDetail)
    const key = `${item.OrderId}-${item.Item_Finished_Id}`;
    itemIdMap.set(key, res.rows[0].id);
    itemCount++;
  }

  log(`  Synced ${itemCount} order items`);
  return itemIdMap;
}

async function syncCarpets(sqlPool, pgClient, orderIdMap, itemIdMap) {
  log('Syncing carpets (this may take a while for 300K+ records)...');

  const ehiOrderIds = Array.from(orderIdMap.keys());
  if (ehiOrderIds.length === 0) return 0;

  let carpetCount = 0;
  const PG_BATCH = 100;
  const SQL_BATCH = 200;

  // Process SQL Server orders in batches to avoid query timeouts
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

    // Batch insert into PostgreSQL
    for (let j = 0; j < result.recordset.length; j += PG_BATCH) {
      const batch = result.recordset.slice(j, j + PG_BATCH);

      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const carpet of batch) {
        const key = `${carpet.OrderId}-${carpet.Item_Finished_Id}`;
        const pgItemId = itemIdMap.get(key) || null;
        const wipStage = getWipStage(carpet.CurrentProStatus);

        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW())`);
        params.push(
          carpet.StockNo,
          carpet.TStockNo || '',
          pgItemId,
          carpet.CurrentProStatus || null,
          carpet.ProcessName || '',
          wipStage,
          carpet.IsPacked === 1,
        );
      }

      if (values.length > 0) {
        await pgClient.query(`
          INSERT INTO ehi_carpets (stock_no, t_stock_no, order_item_id, current_process, current_process_name, wip_stage, is_packed, synced_at)
          VALUES ${values.join(', ')}
        `, params);

        carpetCount += values.length;
      }
    }

    // Log progress every batch
    log(`  ... ${carpetCount} carpets synced (orders batch ${Math.min(i + SQL_BATCH, ehiOrderIds.length)}/${ehiOrderIds.length})`);
  }

  log(`  Synced ${carpetCount} carpets total`);
  return carpetCount;
}

async function syncProcessNames(sqlPool, pgClient) {
  log('Syncing process names...');

  const result = await sqlPool.query(
    'SELECT PROCESS_NAME_ID, PROCESS_NAME, ShortName FROM PROCESS_NAME_MASTER ORDER BY PROCESS_NAME_ID'
  );

  await pgClient.query('DELETE FROM ehi_process_names');

  for (const proc of result.recordset) {
    await pgClient.query(
      'INSERT INTO ehi_process_names (id, name, short_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, short_name = $3',
      [proc.PROCESS_NAME_ID, proc.PROCESS_NAME, proc.ShortName || '']
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
    // Connect to SQL Server
    log('Connecting to EHI SQL Server...');
    sqlPool = await sql.connect(EHI_SQL_CONFIG);
    log('  Connected to SQL Server');

    // Discovery mode — only queries SQL Server
    if (isDiscover) {
      await runDiscovery(sqlPool);
      return;
    }

    // Connect to Neon PostgreSQL
    if (!EHI_PG_URL) {
      throw new Error('EHI_DATABASE_URL not set! Set it in .env or scripts/.env');
    }

    log('Connecting to EHI Neon PostgreSQL...');
    pgClient = new pg.Client({ connectionString: EHI_PG_URL, ssl: { rejectUnauthorized: false } });
    await pgClient.connect();
    log('  Connected to Neon PostgreSQL');

    // Init mode — create tables
    if (isInit) {
      log('Creating tables...');
      await pgClient.query(CREATE_TABLES_SQL);
      log('  Tables created successfully');
      log('=== Init Complete — Run without --init for full sync ===');
      return;
    }

    // Log sync start
    const syncLogRes = await pgClient.query(`
      INSERT INTO ehi_sync_log (sync_type, started_at, status)
      VALUES ('full', NOW(), 'running')
      RETURNING id
    `);
    const syncLogId = syncLogRes.rows[0].id;

    const startTime = Date.now();

    try {
      // Sync process names first (small, reference data)
      await syncProcessNames(sqlPool, pgClient);

      // Use a transaction so if sync fails, old data is preserved
      await pgClient.query('BEGIN');

      try {
        // Sync orders → items → carpets (cascading)
        const orderIdMap = await syncOrders(sqlPool, pgClient);
        const itemIdMap = await syncOrderItems(sqlPool, pgClient, orderIdMap);
        const carpetCount = await syncCarpets(sqlPool, pgClient, orderIdMap, itemIdMap);

        // Commit the transaction — only now does data become visible
        await pgClient.query('COMMIT');

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // Update sync log
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
        // Rollback — old data preserved
        await pgClient.query('ROLLBACK');
        log('Transaction rolled back — old data preserved');
        throw txErr;
      }

    } catch (syncErr) {
      // Update sync log with error
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

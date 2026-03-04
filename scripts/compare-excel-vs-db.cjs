/**
 * Compare Excel "Order Status" data vs EMPL PostgreSQL WIP data
 * 
 * Excel: Manual PPC entries (RCVD PCS, TO RCVD PCS, U/FINISHING, ORDER PCS, Status)
 * PostgreSQL: Live ERP carpet tracking (on_loom, bazar_pcs, finishing_pcs)
 */

const XLSX = require('xlsx');
const { neon } = require('@neondatabase/serverless');
const path = require('path');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const EXCEL_PATH = '/Users/abdul/Downloads/Order Status 04 Feb.xlsx';
const DB_URL = process.env.EMPL_DATABASE_URL;

async function main() {
  if (!DB_URL) {
    console.error('ERROR: EMPL_DATABASE_URL not found in .env');
    process.exit(1);
  }

  // =========================================================================
  // 1. Parse Excel
  // =========================================================================
  console.log('='.repeat(80));
  console.log('STEP 1: Parsing Excel file...');
  console.log('='.repeat(80));
  
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Header is on row index 1
  const headerRow = data[1];
  console.log('\nHeader row:');
  headerRow.forEach((h, i) => {
    if (h) console.log(`  Col ${i}: ${h}`);
  });

  // Column mapping (from detected headers)
  const COL = {
    company: 0,    // Handled
    buyerCode: 1,  // Buyer Code
    merchant: 2,   // Merchant
    opsNo: 5,      // OPS #
    article: 6,    // Article
    size: 7,       // SIZE
    color: 8,      // COLOR
    quality: 9,    // Quality
    orderPcs: 10,  // ORDER PCS
    status: 16,    // Status
    rcvdPcs: 17,   // RCVD PCS
    toRcvdPcs: 18, // TO RCVD PCS
    oldStock: 19,  // OLD STOCK
    uFinishing: 20 // U/FINISHING
  };

  // Parse all data rows (skip header rows 0 and 1, start from 2)
  const excelRows = [];
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[COL.opsNo]) continue;
    const opsNo = String(row[COL.opsNo]).trim();
    if (!opsNo.startsWith('EM-')) continue;
    
    const company = String(row[COL.company] || '').trim().toUpperCase();
    // Only take EMPL rows since we are querying the EMPL database
    if (company !== 'EMPL' && company !== '-' && company !== '') continue;

    const rcvdPcs = Number(row[COL.rcvdPcs]) || 0;
    const toRcvdPcs = Number(row[COL.toRcvdPcs]) || 0;
    const uFinishing = Number(row[COL.uFinishing]) || 0;
    const orderPcs = Number(row[COL.orderPcs]) || 0;

    excelRows.push({
      company,
      opsNo,
      buyerCode: String(row[COL.buyerCode] || '').trim(),
      article: String(row[COL.article] || '').trim(),
      size: String(row[COL.size] || '').trim(),
      color: String(row[COL.color] || '').trim(),
      quality: String(row[COL.quality] || '').trim(),
      orderPcs,
      status: String(row[COL.status] || '').trim(),
      rcvdPcs,
      toRcvdPcs,
      uFinishing,
    });
  }

  console.log(`\nTotal EMPL Excel rows parsed: ${excelRows.length}`);

  // Filter rows with non-zero production data
  const rowsWithData = excelRows.filter(r => 
    r.rcvdPcs > 0 || r.toRcvdPcs > 0 || r.uFinishing > 0
  );

  console.log(`Rows with non-zero RCVD/TO RCVD/U-FINISHING: ${rowsWithData.length}`);

  // Group by OPS number
  const opsMap = new Map();
  for (const row of rowsWithData) {
    if (!opsMap.has(row.opsNo)) {
      opsMap.set(row.opsNo, []);
    }
    opsMap.get(row.opsNo).push(row);
  }

  // Pick 5 OPS numbers with good data variety
  const allOps = [...opsMap.keys()];
  // Sort by total production activity to get interesting ones
  allOps.sort((a, b) => {
    const itemsA = opsMap.get(a);
    const itemsB = opsMap.get(b);
    const actA = itemsA.reduce((s, r) => s + r.rcvdPcs + r.toRcvdPcs + r.uFinishing, 0);
    const actB = itemsB.reduce((s, r) => s + r.rcvdPcs + r.toRcvdPcs + r.uFinishing, 0);
    return actB - actA; // highest activity first
  });

  const selectedOps = allOps.slice(0, 5);

  console.log(`\nSelected 5 OPS numbers for comparison (highest activity):`);
  selectedOps.forEach(ops => {
    const items = opsMap.get(ops);
    const totalRcvd = items.reduce((s, r) => s + r.rcvdPcs, 0);
    const totalToRcvd = items.reduce((s, r) => s + r.toRcvdPcs, 0);
    const totalFinish = items.reduce((s, r) => s + r.uFinishing, 0);
    const totalOrder = items.reduce((s, r) => s + r.orderPcs, 0);
    console.log(`  ${ops} (${items[0].buyerCode}): ${items.length} items, OrderPcs=${totalOrder}, RCVD=${totalRcvd}, ToRcvd=${totalToRcvd}, U/FINISH=${totalFinish}`);
  });

  // =========================================================================
  // 2. Query PostgreSQL for the same OPS numbers
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2: Querying EMPL PostgreSQL...');
  console.log('='.repeat(80));

  const sql = neon(DB_URL);

  // Use tagged template literal with ANY() for array filtering
  const dbRows = await sql`
    SELECT
      o.order_number as ops_no,
      COALESCE(b.code, '') as buyer_code,
      COALESCE(d.name, '') as design,
      COALESCE(s.label, '') as size,
      COALESCE(col.name, '') as color,
      COALESCE(q.name, '') as quality,
      COALESCE(oi.ordered_qty, 0) as total_pcs,
      COUNT(CASE WHEN c.current_stage = 'weaving' THEN 1 END)::int as on_loom,
      COUNT(CASE WHEN c.current_stage = 'bazar' THEN 1 END)::int as bazar_pcs,
      COUNT(CASE WHEN c.current_stage IN ('finishing', 'finishing_issued') THEN 1 END)::int as finishing_pcs,
      COUNT(CASE WHEN c.current_stage IN ('fg_godown', 'stock', 'inspection') THEN 1 END)::int as fg_godown_pcs,
      COUNT(CASE WHEN c.packing_transferred = true AND c.current_stage NOT IN ('dispatched', 'invoiced') THEN 1 END)::int as packed_pcs,
      COUNT(CASE WHEN c.current_stage IN ('dispatched', 'invoiced') THEN 1 END)::int as dispatched_pcs,
      COUNT(c.id)::int as total_carpets
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN buyers b ON b.id = o.buyer_id
    LEFT JOIN designs d ON d.id = oi.design_id
    LEFT JOIN colours col ON col.id = oi.colour_id
    LEFT JOIN sizes s ON s.id = oi.size_id
    LEFT JOIN qualities q ON q.id = oi.quality_id
    LEFT JOIN carpets c ON c.order_item_id = oi.id
    WHERE o.order_number = ANY(${selectedOps})
    GROUP BY o.order_number, b.code, d.name, s.label, col.name, q.name, oi.ordered_qty, oi.id
    ORDER BY o.order_number, oi.id
  `;

  console.log(`DB rows returned: ${dbRows.length}`);

  // =========================================================================
  // 3. Compare side by side
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3: COMPARISON RESULTS');
  console.log('='.repeat(80));

  for (const opsNo of selectedOps) {
    const excelItems = opsMap.get(opsNo);
    const dbItems = dbRows.filter(r => r.ops_no === opsNo);

    console.log('\n' + '-'.repeat(80));
    console.log(`OPS: ${opsNo}  |  Buyer: ${excelItems[0]?.buyerCode}`);
    console.log('-'.repeat(80));

    // Excel aggregates for this OPS
    const exTotalOrder = excelItems.reduce((s, r) => s + r.orderPcs, 0);
    const exTotalRcvd = excelItems.reduce((s, r) => s + r.rcvdPcs, 0);
    const exTotalToRcvd = excelItems.reduce((s, r) => s + r.toRcvdPcs, 0);
    const exTotalFinish = excelItems.reduce((s, r) => s + r.uFinishing, 0);

    // DB aggregates for this OPS
    const dbTotalOrder = dbItems.reduce((s, r) => s + Number(r.total_pcs), 0);
    const dbOnLoom = dbItems.reduce((s, r) => s + Number(r.on_loom), 0);
    const dbBazar = dbItems.reduce((s, r) => s + Number(r.bazar_pcs), 0);
    const dbFinishing = dbItems.reduce((s, r) => s + Number(r.finishing_pcs), 0);
    const dbFgGodown = dbItems.reduce((s, r) => s + Number(r.fg_godown_pcs), 0);
    const dbPacked = dbItems.reduce((s, r) => s + Number(r.packed_pcs), 0);
    const dbDispatched = dbItems.reduce((s, r) => s + Number(r.dispatched_pcs), 0);
    const dbTotalCarpets = dbItems.reduce((s, r) => s + Number(r.total_carpets), 0);
    const dbPostBazar = dbBazar + dbFinishing + dbFgGodown + dbPacked + dbDispatched;

    // Side-by-side table
    const pad = (s, n) => String(s).padEnd(n);
    const padN = (s, n) => String(s).padStart(n);

    console.log(`\n  ${'METRIC'.padEnd(25)} ${'EXCEL (PPC)'.padStart(12)} ${'DATABASE'.padStart(12)}  ${'NOTES'.padEnd(30)}`);
    console.log(`  ${''.padEnd(25, '-')} ${''.padStart(12, '-')} ${''.padStart(12, '-')}  ${''.padEnd(30, '-')}`);
    console.log(`  ${pad('Items (line items)', 25)} ${padN(excelItems.length, 12)} ${padN(dbItems.length, 12)}  ${excelItems.length === dbItems.length ? 'MATCH' : 'Different grouping'}`);
    console.log(`  ${pad('Order Pcs', 25)} ${padN(exTotalOrder, 12)} ${padN(dbTotalOrder, 12)}  ${exTotalOrder === dbTotalOrder ? 'MATCH' : 'DIFF'}`);
    console.log(`  ${pad('Total Carpets in System', 25)} ${padN('-', 12)} ${padN(dbTotalCarpets, 12)}  Carpet numbers assigned`);
    console.log(`  ${pad('RCVD PCS / Post-Bazar', 25)} ${padN(exTotalRcvd, 12)} ${padN(dbPostBazar, 12)}  Excel=cumulative rcvd, DB=bazar+finish+fg+pack+disp`);
    console.log(`  ${pad('TO RCVD PCS / On Loom', 25)} ${padN(exTotalToRcvd, 12)} ${padN(dbOnLoom, 12)}  Excel=pending from loom, DB=weaving stage`);
    console.log(`  ${pad('U/FINISHING / Finishing', 25)} ${padN(exTotalFinish, 12)} ${padN(dbFinishing, 12)}  Excel=under finishing, DB=finishing stage`);
    console.log(`  ${pad('  -> DB Bazar Stage', 25)} ${padN('-', 12)} ${padN(dbBazar, 12)}  At bazar, not yet moved`);
    console.log(`  ${pad('  -> DB FG Godown', 25)} ${padN('-', 12)} ${padN(dbFgGodown, 12)}  Finished goods warehouse`);
    console.log(`  ${pad('  -> DB Packed', 25)} ${padN('-', 12)} ${padN(dbPacked, 12)}  Packed for shipment`);
    console.log(`  ${pad('  -> DB Dispatched', 25)} ${padN('-', 12)} ${padN(dbDispatched, 12)}  Shipped out`);
    console.log(`  ${pad('Status', 25)} ${pad(excelItems[0]?.status?.substring(0, 40) || '-', 42)}`);

    // Item-level detail (up to 4 items)
    const showItems = excelItems.slice(0, 4);
    if (showItems.length > 0) {
      console.log(`\n  Item-level breakdown:`);
      for (const exItem of showItems) {
        // Find matching DB item by design/size/color
        const matchingDb = dbItems.find(d => {
          const sizeMatch = d.size && exItem.size && 
            d.size.toUpperCase().replace(/\s/g, '') === exItem.size.toUpperCase().replace(/\s/g, '');
          return sizeMatch;
        }) || dbItems.find(d => d.design && exItem.article && 
          d.design.toLowerCase().includes(exItem.article.substring(0, 10).toLowerCase()));

        console.log(`    [${exItem.article}] ${exItem.size} ${exItem.color}`);
        console.log(`      Excel:  Order=${exItem.orderPcs}, RCVD=${exItem.rcvdPcs}, ToRcvd=${exItem.toRcvdPcs}, Finish=${exItem.uFinishing}`);
        if (matchingDb) {
          const dbItemPostBazar = Number(matchingDb.bazar_pcs) + Number(matchingDb.finishing_pcs) + 
                                  Number(matchingDb.fg_godown_pcs) + Number(matchingDb.packed_pcs) + Number(matchingDb.dispatched_pcs);
          console.log(`      DB:     Order=${matchingDb.total_pcs}, Loom=${matchingDb.on_loom}, PostBazar=${dbItemPostBazar}, Finish=${matchingDb.finishing_pcs}, FG=${matchingDb.fg_godown_pcs}`);
        } else {
          console.log(`      DB:     (no matching item found in DB for this article/size)`);
        }
      }
    }
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('INTERPRETATION GUIDE');
  console.log('='.repeat(80));
  console.log(`
  The Excel and Database track different things:

  EXCEL (PPC Manual Entry - updated by production team):
    RCVD PCS    = Cumulative count of carpets received from loom (bazar done)
    TO RCVD PCS = Carpets still on loom, pending bazar receipt
    U/FINISHING = Carpets currently under finishing process
    Status      = Free-text production notes

  DATABASE (Live ERP - real-time carpet tracking):
    on_loom     = Carpets with current_stage = 'weaving'
    bazar_pcs   = Carpets with current_stage = 'bazar' (at bazar, not moved yet)
    finishing   = Carpets with current_stage IN ('finishing', 'finishing_issued')
    fg_godown   = Carpets in finished goods godown
    packed      = Carpets packed for shipment
    dispatched  = Carpets shipped

  EXPECTED MAPPINGS:
    Excel "RCVD PCS"    ~  DB (bazar + finishing + fg + packed + dispatched)
    Excel "TO RCVD PCS" ~  DB (on_loom)
    Excel "U/FINISHING"  ~  DB (finishing_pcs)

  Differences indicate:
    - Data entry lag in PPC Excel (updated periodically vs live DB)
    - Different counting methods (Excel is cumulative, DB is current snapshot)
    - Timing: Excel is from 04 Feb, DB is queried now (${new Date().toISOString().split('T')[0]})
`);

  console.log('Script completed successfully.');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});

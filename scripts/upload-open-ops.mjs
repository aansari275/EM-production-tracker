#!/usr/bin/env node
/**
 * Parse "Order Status" Excel and upload open OPS numbers to Firestore.
 *
 * Usage:
 *   node scripts/upload-open-ops.mjs "/path/to/Order Status.xlsx"
 *
 * Stores in: settings/production_status_file
 * Fields: opsNumbers[], uploadedAt, fileName
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import XLSX from 'xlsx'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Firebase init
const serviceAccount = JSON.parse(
  readFileSync('/Users/abdul/Documents/Eastern Mills/FORMS/easternmillscom-0907945d2d73.json', 'utf8')
)

initializeApp({
  credential: cert(serviceAccount),
})

const db = getFirestore()

// Parse args
const excelPath = process.argv[2]
if (!excelPath) {
  console.error('Usage: node scripts/upload-open-ops.mjs <excel-file>')
  process.exit(1)
}

const fullPath = resolve(excelPath)
console.log(`Parsing: ${fullPath}`)

// Read Excel (raw arrays to handle merged headers)
const workbook = XLSX.readFile(fullPath)
const sheetName = workbook.SheetNames[0]
const sheet = workbook.Sheets[sheetName]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

console.log(`Sheet: "${sheetName}", Rows: ${rows.length}`)

// Find OPS column by scanning for EM-25/EM-26 pattern
let opsColIdx = -1
for (let i = 0; i < rows.length && opsColIdx === -1; i++) {
  for (let j = 0; j < rows[i].length; j++) {
    if (String(rows[i][j] || '').match(/EM-2[56]-\d+/)) {
      opsColIdx = j
      console.log(`Found OPS column at index ${j} (row ${i}): "${rows[i][j]}"`)
      break
    }
  }
}

if (opsColIdx === -1) {
  console.error('Could not find OPS column with EM-25/EM-26 pattern!')
  process.exit(1)
}

// Extract unique OPS numbers from that column
const opsSet = new Set()
for (const row of rows) {
  const val = String(row[opsColIdx] || '').trim()
  if (val.match(/EM-2[56]/)) {
    opsSet.add(val)
  }
}

const opsNumbers = Array.from(opsSet).sort()
console.log(`\nFound ${opsNumbers.length} unique OPS numbers`)

if (opsNumbers.length > 0) {
  console.log(`Range: ${opsNumbers[0]} to ${opsNumbers[opsNumbers.length - 1]}`)

  // Extract max sequence number
  let maxSeq = 0
  for (const ops of opsNumbers) {
    const match = ops.match(/EM-\d+-(\d+)/)
    if (match) {
      const seq = parseInt(match[1], 10)
      if (seq > maxSeq) maxSeq = seq
    }
  }
  console.log(`Max sequence: ${maxSeq}`)

  // Show sample
  console.log(`\nSample: ${opsNumbers.slice(0, 5).join(', ')} ... ${opsNumbers.slice(-3).join(', ')}`)
}

if (opsNumbers.length === 0) {
  console.error('\nNo OPS numbers found! Check column names in Excel.')
  console.log('Available columns:', Object.keys(rows[0] || {}))
  process.exit(1)
}

// Store in Firestore
console.log(`\nUploading ${opsNumbers.length} OPS numbers to Firestore...`)

const docRef = db.collection('settings').doc('production_status_file')
await docRef.set({
  opsNumbers,
  uploadedAt: new Date().toISOString(),
  fileName: fullPath.split('/').pop(),
  uploadedBy: 'Script',
}, { merge: true })

console.log('Done! OPS numbers stored in settings/production_status_file')
process.exit(0)

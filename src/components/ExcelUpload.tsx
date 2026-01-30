import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'

interface ExcelUploadProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ParsedRow {
  opsNo: string
  article: string
  size: string
  color: string
  status: string
  bazarDone: number      // From "RCVD PCS" column - bazar done qty
  toRcvdPcs: number      // From "TO RCVD PCS" column - bazar pending
  oldStock: number
  uFinishing: number
}

interface UploadResult {
  matched: number
  updated: number
  notFound: number
  errors: string[]
}

export function ExcelUpload({ open, onOpenChange }: ExcelUploadProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const parseExcelFile = async (fileToParse: File) => {
    try {
      const data = await fileToParse.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

      // Find header row (look for "OPS #" column)
      let headerRowIndex = -1
      for (let i = 0; i < Math.min(5, jsonData.length); i++) {
        const row = jsonData[i]
        if (row && row.some((cell: any) => String(cell).includes('OPS #'))) {
          headerRowIndex = i
          break
        }
      }

      if (headerRowIndex === -1) {
        setParseError('Could not find header row with "OPS #" column')
        return
      }

      const headers = jsonData[headerRowIndex].map((h: any) => String(h || '').trim())

      // Find column indices - mapped to actual Excel headers
      const colIndices = {
        opsNo: headers.findIndex((h: string) => h.includes('OPS')),
        article: headers.findIndex((h: string) => h === 'Article'),
        size: headers.findIndex((h: string) => h === 'SIZE'),
        color: headers.findIndex((h: string) => h === 'COLOR'),
        status: headers.findIndex((h: string) => h === 'Status'),
        // RCVD PCS = Bazar Done (received from production)
        bazarDone: headers.findIndex((h: string) => h === 'RCVD PCS' || h.includes('RCVD PCS')),
        // TO RCVD PCS = Bazar Pending
        toRcvdPcs: headers.findIndex((h: string) => h === 'TO RCVD PCS' || h.includes('TO RCVD')),
        oldStock: headers.findIndex((h: string) => h.includes('OLD STOCK')),
        uFinishing: headers.findIndex((h: string) => h.includes('U/FINISHING')),
      }

      // Validate required columns
      if (colIndices.opsNo === -1) {
        setParseError('Missing required column: OPS #')
        return
      }

      // Parse data rows
      const rows: ParsedRow[] = []
      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!row || !row[colIndices.opsNo]) continue

        const opsNo = String(row[colIndices.opsNo] || '').trim()
        if (!opsNo || opsNo === '-') continue

        rows.push({
          opsNo,
          article: colIndices.article >= 0 ? String(row[colIndices.article] || '').trim() : '',
          size: colIndices.size >= 0 ? String(row[colIndices.size] || '').trim() : '',
          color: colIndices.color >= 0 ? String(row[colIndices.color] || '').trim() : '',
          status: colIndices.status >= 0 ? String(row[colIndices.status] || '').trim() : '',
          bazarDone: colIndices.bazarDone >= 0 ? parseInt(row[colIndices.bazarDone]) || 0 : 0,
          toRcvdPcs: colIndices.toRcvdPcs >= 0 ? parseInt(row[colIndices.toRcvdPcs]) || 0 : 0,
          oldStock: colIndices.oldStock >= 0 ? parseInt(row[colIndices.oldStock]) || 0 : 0,
          uFinishing: colIndices.uFinishing >= 0 ? parseInt(row[colIndices.uFinishing]) || 0 : 0,
        })
      }

      if (rows.length === 0) {
        setParseError('No valid data rows found in the Excel file')
        return
      }

      setParsedData(rows)
    } catch (error) {
      console.error('Parse error:', error)
      setParseError('Failed to parse Excel file. Please check the format.')
    }
  }

  const handleUpload = async () => {
    if (parsedData.length === 0) return

    setIsUploading(true)
    setUploadResult(null)

    try {
      const response = await fetch('/api/production-tracker/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedData }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      setUploadResult(result.data)

      // Extract unique OPS numbers from uploaded data
      const opsNumbers = [...new Set(parsedData.map(row => row.opsNo.trim()).filter(Boolean))]

      // Save file metadata with OPS numbers to track new orders
      await fetch('/api/production-status/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file?.name || 'Excel Upload',
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'PPC Team',
          opsNumbers, // Store OPS numbers from Excel to compare against system
        }),
      })

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['production-rows'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['new-orders'] })
    } catch (error) {
      console.error('Upload error:', error)
      setUploadResult({
        matched: 0,
        updated: 0,
        notFound: parsedData.length,
        errors: [error instanceof Error ? error.message : 'Upload failed'],
      })
    } finally {
      setIsUploading(false)
    }
  }

  // Listen for dropped files from the dashboard
  useEffect(() => {
    const handleDroppedFile = (e: CustomEvent<File>) => {
      const droppedFile = e.detail
      if (droppedFile) {
        setFile(droppedFile)
        setParseError(null)
        setUploadResult(null)
        parseExcelFile(droppedFile)
      }
    }

    window.addEventListener('excel-file-dropped', handleDroppedFile as EventListener)
    return () => {
      window.removeEventListener('excel-file-dropped', handleDroppedFile as EventListener)
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setParseError(null)
    setUploadResult(null)
    parseExcelFile(selectedFile)
  }

  const resetState = () => {
    setFile(null)
    setParsedData([])
    setUploadResult(null)
    setParseError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClose = () => {
    resetState()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Bulk Update from Excel
          </DialogTitle>
          <DialogDescription>
            Upload the "Running Order Status" Excel file to update status fields.
            Only existing items will be updated (no new items will be added).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input */}
          {!file && (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Click to select Excel file or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                Supports .xlsx, .xls files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          )}

          {/* File Selected */}
          {file && !uploadResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={resetState}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {parseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{parseError}</p>
                </div>
              )}

              {parsedData.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium">
                      Found {parsedData.length} rows to update
                    </span>
                  </div>

                  {/* Preview */}
                  <div className="border rounded-lg">
                    <div className="p-2 bg-muted border-b">
                      <p className="text-xs font-medium">Preview (first 5 rows)</p>
                    </div>
                    <ScrollArea className="h-48">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-2 text-left">OPS #</th>
                            <th className="p-2 text-left">Article</th>
                            <th className="p-2 text-left">Size</th>
                            <th className="p-2 text-left">Status</th>
                            <th className="p-2 text-right">Rcvd</th>
                            <th className="p-2 text-right">To Rcvd</th>
                            <th className="p-2 text-right">Finish</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedData.slice(0, 5).map((row, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="p-2 font-mono">{row.opsNo}</td>
                              <td className="p-2 truncate max-w-[120px]">{row.article}</td>
                              <td className="p-2">{row.size}</td>
                              <td className="p-2 truncate max-w-[150px]">{row.status}</td>
                              <td className="p-2 text-right">{row.bazarDone}</td>
                              <td className="p-2 text-right">{row.toRcvdPcs}</td>
                              <td className="p-2 text-right">{row.uFinishing}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <strong>Fields to update:</strong> Status, Rcvd (Bazar Done), To Rcvd (Bazar Pending), Finish (U/Finishing)
                  </div>
                </>
              )}
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-50">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">Upload Complete</span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Matched</p>
                    <p className="text-lg font-bold">{uploadResult.matched}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Updated</p>
                    <p className="text-lg font-bold text-green-600">{uploadResult.updated}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Skipped</p>
                    <p className="text-lg font-bold text-gray-500">{uploadResult.notFound}</p>
                  </div>
                </div>

                {uploadResult.notFound > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Skipped items are old/completed orders not in the system
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {!uploadResult ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={parsedData.length === 0 || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Update {parsedData.length} Items
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

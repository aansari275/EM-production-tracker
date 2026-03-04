import { useState, useEffect, useRef } from 'react'
import { useTeds, useTed } from '@/hooks/useTeds'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { TedFormSummary } from '@/types'
import {
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Image as ImageIcon,
  X,
} from 'lucide-react'

export function TedListView() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const { data: teds = [], isLoading } = useTeds(debouncedSearch)
  const { data: tedDetail, isLoading: isLoadingDetail } = useTed(expandedId)

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="bg-white rounded-lg border p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-green-600" />
          <span className="font-semibold text-gray-800">Technical Execution Documents</span>
        </div>
        <Badge variant="secondary" className="text-sm">
          {isLoading ? '...' : teds.length} TEDs
        </Badge>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search design no, buyer, construction, quality..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 bg-gray-50 border-gray-200"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
          <span className="ml-2 text-gray-500">Loading TEDs...</span>
        </div>
      )}

      {/* Results grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teds.map((ted) => (
            <TedCard
              key={ted.id}
              ted={ted}
              isExpanded={expandedId === ted.id}
              tedDetail={expandedId === ted.id ? tedDetail : undefined}
              isLoadingDetail={expandedId === ted.id && isLoadingDetail}
              onToggle={() => toggleExpand(ted.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && teds.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No TEDs found</p>
          {search && <p className="text-sm mt-1">Try a different search term</p>}
        </div>
      )}
    </div>
  )
}

function TedCard({
  ted,
  isExpanded,
  tedDetail,
  isLoadingDetail,
  onToggle,
}: {
  ted: TedFormSummary
  isExpanded: boolean
  tedDetail: any
  isLoadingDetail: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`bg-white rounded-lg border transition-all ${
        isExpanded ? 'sm:col-span-2 lg:col-span-3 ring-2 ring-green-200' : 'hover:border-green-300 cursor-pointer'
      }`}
    >
      {/* Card header - always visible */}
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Design number */}
            <p className="font-mono font-bold text-green-700 text-sm truncate">
              {ted.emDesignNo || 'No Design No'}
            </p>
            {/* Buyer */}
            <p className="text-sm text-gray-600 mt-0.5">
              <span className="font-medium">{ted.buyerCode}</span>
              {ted.buyerName && <span className="text-gray-400"> · {ted.buyerName}</span>}
            </p>
          </div>
          {/* Thumbnail */}
          {ted.thumbnailUrl ? (
            <img
              src={ted.thumbnailUrl}
              alt={ted.emDesignNo}
              className="w-12 h-12 rounded object-cover flex-shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
              <ImageIcon className="h-5 w-5 text-gray-300" />
            </div>
          )}
        </div>

        {/* Details row */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {ted.construction && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {ted.construction}
            </Badge>
          )}
          {ted.productQuality && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {ted.productQuality}
            </Badge>
          )}
          {ted.size && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {ted.size}
            </Badge>
          )}
        </div>

        {/* Date + expand toggle */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-gray-400">
            {ted.ppMeetingDate ? formatDate(ted.ppMeetingDate) : 'No date'}
          </span>
          <span className="text-gray-400">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t px-4 py-4">
          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-green-600" />
              <span className="ml-2 text-sm text-gray-500">Loading details...</span>
            </div>
          ) : tedDetail ? (
            <TedDetailContent ted={tedDetail} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function TedDetailContent({ ted }: { ted: any }) {
  const imageCategories = [
    { key: 'product_photo', label: 'Product Photos' },
    { key: 'productPhoto', label: 'Product Photos' },
    { key: 'shade_card_photo', label: 'Shade Card' },
    { key: 'shadeCardPhoto', label: 'Shade Card' },
    { key: 'master_hank_photo', label: 'Master Hank' },
    { key: 'masterHankPhoto', label: 'Master Hank' },
    { key: 'red_seal_photo', label: 'Red Seal' },
    { key: 'redSealPhoto', label: 'Red Seal' },
    { key: 'approved_cad', label: 'Approved CAD' },
    { key: 'approvedCad', label: 'Approved CAD' },
  ]

  // Collect all images, deduplicating keys
  const allImages: { label: string; urls: string[] }[] = []
  const seenLabels = new Set<string>()
  if (ted.imageUrls) {
    for (const cat of imageCategories) {
      if (ted.imageUrls[cat.key] && Array.isArray(ted.imageUrls[cat.key]) && ted.imageUrls[cat.key].length > 0) {
        if (!seenLabels.has(cat.label)) {
          seenLabels.add(cat.label)
          allImages.push({ label: cat.label, urls: ted.imageUrls[cat.key] })
        }
      }
    }
  }

  return (
    <div className="space-y-5">
      {/* Section 1: Header */}
      <div>
        <SectionTitle>Header</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Field label="EM Design No" value={ted.emDesignNo} />
          <Field label="Buyer Design Name" value={ted.buyerDesignName} />
          <Field label="Buyer Code" value={ted.buyerCode} />
          <Field label="Buyer Name" value={ted.buyerName} />
          <Field label="PP Meeting Date" value={ted.ppMeetingDate ? formatDate(ted.ppMeetingDate) : ''} />
          <Field label="Status" value={ted.status} />
          {ted.meetingAttendees?.length > 0 && (
            <div className="col-span-2 sm:col-span-3">
              <span className="text-gray-400 text-xs">Attendees</span>
              <p className="text-gray-700">{ted.meetingAttendees.join(', ')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Construction */}
      <div>
        <SectionTitle>Construction</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Field label="Product Type" value={ted.productType} />
          <Field label="Construction" value={ted.construction} />
          <Field label="Quality" value={ted.productQuality} />
          <Field label="Size" value={ted.size} />
          <Field label="GSM (Unfinished)" value={ted.unfinishedGsm} />
          <Field label="GSM (Finished)" value={ted.finishedGsm} />
          <Field label="Reed No / Kanghi" value={ted.reedNoKanghi} />
          <Field label="Warp in 6 inches" value={ted.warpIn6Inches} />
          <Field label="Weft in 6 inches" value={ted.weftIn6Inches} />
        </div>
      </div>

      {/* Section 3: Materials */}
      <div>
        <SectionTitle>Materials</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Field label="Warp Material" value={ted.warpMaterial} />
          <Field label="Weft Material" value={ted.weftMaterial} />
          <Field label="Pile Material" value={ted.pileMaterial} />
          <Field label="Pile Height (Unfinished)" value={ted.pileHeightUnfinished} />
          <Field label="Pile Height (Finished)" value={ted.pileHeightFinished} />
          <Field label="Fringes / Hemming" value={ted.fringesDetails} />
          <Field label="Khati Details" value={ted.khatiDetails} />
        </div>
      </div>

      {/* Section 4: Quality & Process */}
      <div>
        <SectionTitle>Quality & Process</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Field label="Size Tolerance" value={ted.sizeTolerance} />
          <Field label="Process Flow" value={ted.processFlow} multiline />
          <Field label="Quality Call Outs (CTQ)" value={ted.qualityCallOutsCtq} multiline />
          <Field label="Buyer's Specific Requirements" value={ted.buyersSpecificRequirements} multiline />
          <Field label="Remarks" value={ted.remarks} multiline />
          <Field label="Shade Card Available" value={ted.shadeCardAvailable} />
          <Field label="Red Seal Available" value={ted.redSealAvailable} />
        </div>
      </div>

      {/* Section 5: Images */}
      {allImages.length > 0 && (
        <div>
          <SectionTitle>Images</SectionTitle>
          <div className="space-y-3">
            {allImages.map(({ label, urls }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <div className="flex flex-wrap gap-2">
                  {urls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={url}
                        alt={`${label} ${i + 1}`}
                        className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded border hover:ring-2 hover:ring-green-300 transition-all"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-green-700 border-b border-green-100 pb-1 mb-3">
      {children}
    </h3>
  )
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string
  value?: string | number | null
  multiline?: boolean
}) {
  if (!value && value !== 0) return null
  return (
    <div className={multiline ? 'col-span-1 sm:col-span-2' : ''}>
      <span className="text-gray-400 text-xs">{label}</span>
      <p className={`text-gray-700 ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value}</p>
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

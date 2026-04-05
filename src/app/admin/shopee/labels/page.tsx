'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'

interface LabelOrder {
  shopee_order_number: string; recipient_name: string | null; recipient_phone: string | null
  shipping_address: string | null; city: string | null; district: string | null; zip_code: string | null
  shipping_method: string | null; pickup_store_id: string | null; buyer_note: string | null
  buyer_total_payment: number | null; order_date: string | null
}
interface LabelItem {
  shopee_product_name: string | null; shopee_variation_name: string | null
  quantity: number; iccid: string[] | null; bc_sku_id: string | null
  matched_copies: string | null
}

export default function ShopeeLabelsPage() {
  return <Suspense fallback={<div>載入中...</div>}><LabelsContent /></Suspense>
}

function LabelsContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order')
  const [order, setOrder] = useState<LabelOrder | null>(null)
  const [items, setItems] = useState<LabelItem[]>([])
  const [labelType, setLabelType] = useState<'detail' | 'product'>('detail')

  useEffect(() => {
    if (!orderId) return
    fetch(`/api/admin/shopee/orders/${orderId}`).then(r => r.json()).then(d => {
      setOrder(d.order); setItems(d.items || [])
    })
  }, [orderId])

  if (!orderId) return <div className="text-gray-500">請從訂單詳情頁進入列印</div>
  if (!order) return <div className="text-gray-500">載入中...</div>

  return (
    <div>
      <div className="flex items-center justify-between print:hidden">
        <div>
          <Link href={`/admin/shopee/orders/${orderId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
            <ArrowLeft className="w-4 h-4" /> 返回訂單
          </Link>
          <h1 className="mt-2 text-2xl font-bold">列印標籤</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setLabelType('detail')}
              className={`px-4 py-2 text-sm ${labelType === 'detail' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>明細標籤</button>
            <button onClick={() => setLabelType('product')}
              className={`px-4 py-2 text-sm ${labelType === 'product' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>商品標籤</button>
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Printer className="w-4 h-4" /> 列印
          </button>
        </div>
      </div>

      {/* 明細標籤 100mm × 150mm */}
      {labelType === 'detail' && (
        <div className="mt-6 print:mt-0">
          <div className="detail-label mx-auto bg-white border border-gray-300 print:border-black"
            style={{ width: '100mm', minHeight: '150mm', padding: '5mm', fontSize: '11px', fontFamily: 'sans-serif' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3mm', marginBottom: '3mm' }}>
              蝦皮訂單：{order.shopee_order_number}
            </div>
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '3mm' }}>日期：{order.order_date}</div>

            <div style={{ borderBottom: '1px dashed #ccc', paddingBottom: '3mm', marginBottom: '3mm' }}>
              <div><strong>收件人：</strong>{order.recipient_name}</div>
              <div><strong>電話：</strong>{order.recipient_phone}</div>
              <div><strong>地址：</strong>{order.zip_code} {order.city}{order.district} {order.shipping_address}</div>
              {order.shipping_method && <div><strong>寄送：</strong>{order.shipping_method}</div>}
              {order.pickup_store_id && <div><strong>門市：</strong>{order.pickup_store_id}</div>}
            </div>

            <div style={{ fontWeight: 'bold', marginBottom: '2mm' }}>商品明細：</div>
            {items.map((item, i) => (
              <div key={i} style={{ border: '1px solid #ddd', borderRadius: '2mm', padding: '2mm', marginBottom: '2mm' }}>
                <div><strong>{i + 1}. {item.shopee_product_name}</strong> × {item.quantity}</div>
                <div style={{ fontSize: '10px', color: '#666' }}>{item.shopee_variation_name}</div>
                {item.iccid && item.iccid.map((ic, j) => (
                  <div key={j} style={{ fontSize: '9px', fontFamily: 'monospace', color: '#333' }}>ICCID: {ic}</div>
                ))}
              </div>
            ))}

            {order.buyer_note && (
              <div style={{ marginTop: '3mm', padding: '2mm', background: '#fff3cd', borderRadius: '2mm', fontSize: '10px' }}>
                <strong>買家備註：</strong>{order.buyer_note}
              </div>
            )}
            <div style={{ marginTop: '3mm', textAlign: 'right', fontWeight: 'bold' }}>金額：NT$ {order.buyer_total_payment}</div>
          </div>
        </div>
      )}

      {/* 商品標籤 30mm × 15mm */}
      {labelType === 'product' && (
        <div className="mt-6 print:mt-0 flex flex-wrap gap-2 print:gap-0">
          {items.flatMap((item) =>
            (item.iccid || ['']).map((ic, j) => (
              <div key={`${item.shopee_product_name}-${j}`}
                className="product-label bg-white border border-gray-300 print:border-black flex flex-col justify-center"
                style={{ width: '30mm', height: '15mm', padding: '1mm', fontSize: '6px', fontFamily: 'sans-serif', overflow: 'hidden', lineHeight: 1.3 }}>
                <div style={{ fontWeight: 'bold', fontSize: '7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.shopee_product_name}
                </div>
                <div style={{ fontSize: '5.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.shopee_variation_name}
                </div>
                {ic && <div style={{ fontFamily: 'monospace', fontSize: '5px', marginTop: '0.5mm' }}>{ic}</div>}
              </div>
            ))
          )}
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .detail-label, .detail-label *, .product-label, .product-label * { visibility: visible; }
          .detail-label { position: absolute; left: 0; top: 0; }
          .product-label { break-inside: avoid; }
          @page { margin: 0; }
        }
      `}</style>
    </div>
  )
}

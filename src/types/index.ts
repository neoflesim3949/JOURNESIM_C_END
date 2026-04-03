// =====================================================
// 訂單相關（前台訂單頁使用）
// =====================================================
export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export interface Order {
  id: string
  member_id: string
  email: string
  order_number: string
  status: OrderStatus
  total_amount: number
  bc_order_id: string | null
  payment_method: string | null
  tappay_trade_id: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_name: string
  plan_type: 'daily' | 'fixed'
  plan_label: string
  days: number | null
  quantity: number
  unit_price: number
  subtotal: number
  bc_sku_id: string
  bc_sub_order_id: string | null
  iccid: string[] | null
  plan_status: string | null
}

export interface EsimProfile {
  id: string
  order_item_id: string
  iccid: string
  qr_code_url: string | null
  qr_code_data: string | null
  sm_dp_address: string | null
  activation_code: string | null
  status: 'pending' | 'ready' | 'installed' | 'active' | 'expired'
  created_at: string
}

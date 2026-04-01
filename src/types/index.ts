// =====================================================
// 商品相關
// =====================================================
export interface Product {
  id: string
  name: string
  description: string | null
  image_url: string | null
  country_code: string
  country_name: string
  product_type: 'esim' | 'sim'
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DailyPlan {
  id: string
  product_id: string
  speed_label: string        // e.g. "500MB/日", "1GB/日"
  daily_capacity_mb: number  // e.g. 500, 1024, 2048
  price_per_day: number      // TWD
  bc_sku_id: string
  is_active: boolean
}

export interface FixedPlan {
  id: string
  product_id: string
  label: string              // e.g. "5GB / 7天"
  capacity_gb: number
  days: number
  price: number              // TWD
  bc_sku_id: string
  is_active: boolean
}

// =====================================================
// 訂單相關
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

// =====================================================
// 會員相關
// =====================================================
export interface Member {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  auth_provider: string
  created_at: string
}

// =====================================================
// 售後相關
// =====================================================
export type AfterSaleStatus =
  | 'pending'
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'refunded'

export interface AfterSale {
  id: string
  order_id: string
  order_item_id: string | null
  member_id: string
  reason: string
  status: AfterSaleStatus
  bc_after_sale_id: string | null
  refund_amount: number | null
  created_at: string
  updated_at: string
}

// =====================================================
// 付款相關
// =====================================================
export interface Payment {
  id: string
  order_id: string
  method: string
  tappay_trade_id: string
  amount: number
  status: 'pending' | 'success' | 'failed'
  raw_response: object | null
  created_at: string
}

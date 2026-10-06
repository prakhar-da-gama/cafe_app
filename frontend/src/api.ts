// API client for the Coffee Trading Co customer app.
// The JWT is kept in localStorage and attached to protected calls.

const TOKEN_KEY = 'ctc.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ---- Types ----

export interface VerifyOtpResponse {
  message: string
  access_token: string
  token_type: string
  name_required: boolean
}

export interface User {
  id: number
  name: string | null
  email_id: string
  user_type: string
  photo_path: string | null
}

// ---- Game ----

export interface LiveCount {
  count: number
  playing: number
}

export interface MyGameStat {
  id: number
  score: number
  datetime_started: string
}

export interface OverallGameStat {
  id: number
  user_id: number
  name: string | null
  photo_path: string | null
  score: number
  datetime_started: string
}

export interface PaginatedOverallStats {
  items: OverallGameStat[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

export interface Tag {
  id: number
  tag: string
}

export interface Topping {
  id: number
  name: string
  price: number | string
  is_available: boolean
}

export interface Variant {
  id: number
  name: string
  description: string | null
  price_delta: number | string
}

export interface MenuItem {
  id: number
  name: string
  description: string | null
  price: number | string
  photos: string[]
  tag_ids: number[]
  is_veg: boolean
  is_available: boolean
  display_order: number
  is_active: boolean
  toppings: Topping[]
  variants: Variant[]
}

export interface PaginatedItems {
  items: MenuItem[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

// ---- Full nested menu (categories -> subcategories -> items) ----

export interface Subcategory {
  id: number
  name: string
  description: string | null
  photos: string[]
  display_order: number
  is_active: boolean
  items: MenuItem[]
}

export interface MenuCategory {
  id: number
  name: string
  description: string | null
  photos: string[]
  display_order: number
  is_active: boolean
  subcategories: Subcategory[]
}

export interface FullMenuResponse {
  categories: MenuCategory[]
  cart_count: number
}

export interface OrderItem {
  id: number
  order_id: number
  item_id: number
  topping_ids: number[]
  variant_ids: number[]
  quantity: number
  price: number | string
}

// ---- Fetch plumbing ----

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ---- Auth ----

export function sendOtp(email: string): Promise<{ message: string }> {
  return fetch('/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then((r) => handle<{ message: string }>(r))
}

export function verifyOtp(email: string, otp: string): Promise<VerifyOtpResponse> {
  return fetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  }).then((r) => handle<VerifyOtpResponse>(r))
}

// ---- User ----

export function updateMyName(name: string): Promise<User> {
  return fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name }),
  }).then((r) => handle<User>(r))
}

export function getMe(): Promise<User> {
  return fetch('/api/users/me', { headers: authHeaders() }).then((r) =>
    handle<User>(r),
  )
}

// Upload an image file and return its public path (e.g. /api/uploads/<name>).
export function uploadImage(file: File): Promise<{ filename: string; path: string }> {
  const form = new FormData()
  form.append('file', file)
  return fetch('/api/upload', {
    method: 'POST',
    headers: { ...authHeaders() },
    body: form,
  }).then((r) => handle<{ filename: string; path: string }>(r))
}

// Save the user's chosen photo path onto their profile.
export function updateMyPhoto(photoPath: string): Promise<User> {
  return fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ photo_path: photoPath }),
  }).then((r) => handle<User>(r))
}

// ---- Game ----

export function getLiveCount(): Promise<LiveCount> {
  return fetch('/api/game/live-count', { headers: authHeaders() }).then((r) =>
    handle<LiveCount>(r),
  )
}

export function getMyStats(): Promise<MyGameStat[]> {
  return fetch('/api/game/my-stats', { headers: authHeaders() }).then((r) =>
    handle<MyGameStat[]>(r),
  )
}

export function getOverallStats(
  page = 1,
  pageSize = 20,
): Promise<PaginatedOverallStats> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return fetch(`/api/game/overall-stats?${params.toString()}`, {
    headers: authHeaders(),
  }).then((r) => handle<PaginatedOverallStats>(r))
}

// Build the game WebSocket URL, carrying the JWT as a query param so the
// backend can authenticate the socket on connect.
export function gameSocketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const token = getToken() ?? ''
  return `${proto}://${window.location.host}/api/game/ws?token=${encodeURIComponent(token)}`
}

// ---- Tags ----

export function listTags(): Promise<Tag[]> {
  return fetch('/api/tags', { headers: authHeaders() }).then((r) =>
    handle<Tag[]>(r),
  )
}

// ---- Menu ----

export function getMenuByTags(
  tagIds: number[],
  page = 1,
  pageSize = 6,
): Promise<PaginatedItems> {
  const params = new URLSearchParams()
  for (const id of tagIds) params.append('tag_ids', String(id))
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  return fetch(`/api/menu/by-tags?${params.toString()}`, {
    headers: authHeaders(),
  }).then((r) => handle<PaginatedItems>(r))
}

// The full nested menu: categories -> subcategories -> items (+toppings/variants),
// plus the current cart line-item count. The per-item `description` is omitted
// here to keep the payload small; fetch it with getItem() when a dish is opened.
export function getFullMenu(): Promise<FullMenuResponse> {
  return fetch('/api/menu/get-full-menu', { headers: authHeaders() }).then((r) =>
    handle<FullMenuResponse>(r),
  )
}

// Full detail for a single dish, including its description. Called when a dish
// is opened, since the menu listing leaves the description out.
export function getItem(itemId: number): Promise<MenuItem> {
  return fetch(`/api/menu/get-item/${itemId}`, { headers: authHeaders() }).then(
    (r) => handle<MenuItem>(r),
  )
}

// ---- Cart ----

export function addItemToCart(
  itemId: number,
  toppingIds: number[] = [],
  variantId: number | null = null,
  quantity = 1,
): Promise<OrderItem> {
  return fetch('/api/cart/add-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      item_id: itemId,
      topping_ids: toppingIds,
      variant_id: variantId,
      quantity,
    }),
  }).then((r) => handle<OrderItem>(r))
}

// ---- Helpers ----

export function money(value: number | string): string {
  const n = Number(value)
  return `₹${Math.round(n)}`
}

export function signedMoney(value: number | string): string {
  const n = Number(value)
  if (n === 0) return 'No charge'
  const sign = n > 0 ? '+' : '−'
  return `${sign}₹${Math.abs(Math.round(n))}`
}

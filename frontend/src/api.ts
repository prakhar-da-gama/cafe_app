// API client for the Seoulmate Cafe customer app.
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
  // Set by the personalised menu for items matching the user's chosen flavours.
  is_recommended: boolean
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
  rating: number | null
  review: string | null
  review_photo_paths: string[]
}

// The lifecycle of an order. `cart` is the open draft; `pending` onwards are
// placed orders moving through the kitchen.
export type OrderStatus =
  | 'cart'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'

// One line of an order, fully expanded: the item plus the specific toppings
// and variants chosen, and the unit price snapshot taken when it was added.
export interface OrderLine {
  id: number
  item_id: number
  quantity: number
  price: number | string
  item: MenuItem
  toppings: Topping[]
  variants: Variant[]
  // Customer review of this line, left once the order is completed.
  rating: number | null
  review: string | null
  review_photo_paths: string[]
}

// One review of a menu item, gathered from an order line (manager view).
export interface ItemReviewEntry {
  order_item_id: number
  order_id: number
  rating: number | null
  review: string | null
  review_photo_paths: string[]
  created_at: string
}

export interface ItemReviewsResponse {
  item_id: number
  average_rating: number | null
  rating_count: number
  reviews: ItemReviewEntry[]
}

// Overall per-order service review.
export interface ServiceReview {
  id: number
  order_id: number
  user_id: number
  rating: number
  review: string | null
  review_images: string[]
  created_at: string
  updated_at: string
}

export interface PaginatedServiceReviews {
  items: ServiceReview[]
  total: number
  page: number
  page_size: number
  has_more: boolean
  average_rating: number | null
}

export interface ServiceRatingSummary {
  average_rating: number | null
  rating_count: number
}

export interface Order {
  id: number
  status: OrderStatus
  total_amount: number | string
  payment_status: boolean
  extra_notes: string | null
  created_at: string
  updated_at: string
  order_items: OrderLine[]
}

export interface PaginatedOrders {
  items: Order[]
  total: number
  page: number
  page_size: number
  has_more: boolean
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

// Public pre-check for the manager login: true if a manager account exists for
// this email. Managers are provisioned (no self sign-up), so the login page
// calls this before sending an OTP and rejects unknown emails.
export function doesManagerExist(email: string): Promise<{ exists: boolean }> {
  const params = new URLSearchParams({ email })
  return fetch(`/api/auth/does-manager-exist?${params.toString()}`).then((r) =>
    handle<{ exists: boolean }>(r),
  )
}

// Public pre-check for the admin login: true if an admin account exists for
// this email. Admins are provisioned (no self sign-up), so the login page
// calls this before sending an OTP and rejects unknown emails.
export function doesAdminExist(email: string): Promise<{ exists: boolean }> {
  const params = new URLSearchParams({ email })
  return fetch(`/api/auth/does-admin-exist?${params.toString()}`).then((r) =>
    handle<{ exists: boolean }>(r),
  )
}

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

// The full nested menu: categories -> subcategories -> items (+toppings/variants),
// plus the current cart line-item count. The per-item `description` is omitted
// here to keep the payload small; fetch it with getItem() when a dish is opened.
export function getFullMenu(): Promise<FullMenuResponse> {
  return fetch('/api/menu/get-full-menu', {
    headers: authHeaders(),
  }).then((r) => handle<FullMenuResponse>(r))
}

// The personalised menu: the same nested shape and the same items as the full
// menu (nothing filtered out), but items matching the given tags come back with
// `is_recommended: true` and floated to the front of each subcategory, followed
// by the rest. Pass the user's chosen flavour tag ids.
export function getPersonalisedMenu(
  tagIds: number[] = [],
): Promise<FullMenuResponse> {
  const params = new URLSearchParams()
  for (const id of tagIds) params.append('tag_ids', String(id))
  const qs = params.toString()
  return fetch(`/api/menu/get-personalised-menu${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  }).then((r) => handle<FullMenuResponse>(r))
}

// Full detail for a single dish, including its description. Called when a dish
// is opened, since the menu listing leaves the description out.
export function getItem(itemId: number): Promise<MenuItem> {
  return fetch(`/api/menu/get-item/${itemId}`, { headers: authHeaders() }).then(
    (r) => handle<MenuItem>(r),
  )
}

// Manager: mark a menu item in/out of stock. Returns the updated item.
export function setItemAvailability(
  itemId: number,
  isAvailable: boolean,
): Promise<MenuItem> {
  return fetch(`/api/menu/${itemId}/availability`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ is_available: isAvailable }),
  }).then((r) => handle<MenuItem>(r))
}

// Manager: mark a topping in/out of stock. Returns the updated topping.
export function setToppingAvailability(
  toppingId: number,
  isAvailable: boolean,
): Promise<Topping> {
  return fetch(`/api/menu/toppings/${toppingId}/availability`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ is_available: isAvailable }),
  }).then((r) => handle<Topping>(r))
}

// A lightweight item reference (no nested toppings/variants).
export interface ItemSummary {
  id: number
  name: string
  price: number | string
  photos: string[]
  is_veg: boolean
  is_available: boolean
}

// Out-of-stock toppings grouped under one item they belong to.
export interface OutOfStockToppingGroup {
  item: ItemSummary
  toppings: Topping[]
}

// Manager: all active items currently out of stock.
export function getOutOfStockItems(): Promise<MenuItem[]> {
  return fetch('/api/menu/out-of-stock-items', { headers: authHeaders() }).then(
    (r) => handle<MenuItem[]>(r),
  )
}

// Manager: out-of-stock toppings grouped under each item they belong to.
export function getOutOfStockToppings(): Promise<OutOfStockToppingGroup[]> {
  return fetch('/api/menu/out-of-stock-toppings', {
    headers: authHeaders(),
  }).then((r) => handle<OutOfStockToppingGroup[]>(r))
}

// ---- Menu authoring (manager) ----

export interface CategoryCreate {
  name: string
  description?: string | null
  photos?: string[]
  is_active?: boolean
}

export interface SubcategoryCreate {
  category_id: number
  name: string
  description?: string | null
  photos?: string[]
  is_active?: boolean
}

export interface ItemCreate {
  subcategory_id: number
  name: string
  description?: string | null
  price: number
  photos?: string[]
  tag_ids?: number[]
  topping_ids?: number[]
  variant_ids?: number[]
  is_veg?: boolean
  is_available?: boolean
}

export interface ToppingCreate {
  name: string
  price?: number
  photos?: string[]
  is_available?: boolean
}

export interface VariantCreate {
  name: string
  description?: string | null
  price_delta?: number
}

// Manager: create a new top-level category. Returns it (with no subcategories
// yet). Requires a manager token.
export function createCategory(input: CategoryCreate): Promise<MenuCategory> {
  return fetch('/api/menu/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<MenuCategory>(r))
}

export interface FormatCategoryRequest {
  name: string
  description?: string | null
}

export interface FormatCategoryResponse {
  original_name: string
  original_description: string | null
  recommended_name_1: string
  recommended_name_2: string
  recommended_description_1: string
  recommended_description_2: string
}

// Manager: ask the AI assistant to polish a category name + description. Returns
// two suggested rewrites of each. Costs 5 AI credits per call; requires a
// manager token.
export function formatCategory(
  input: FormatCategoryRequest,
): Promise<FormatCategoryResponse> {
  return fetch('/api/ai/menu/format-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<FormatCategoryResponse>(r))
}

// Manager: create a subcategory under an existing category. Requires a manager
// token.
export function createSubcategory(
  input: SubcategoryCreate,
): Promise<Subcategory> {
  return fetch('/api/menu/subcategories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<Subcategory>(r))
}

// Manager: add a topping to the shared pool, returning it with its new id so
// it can be linked to a dish. Requires a manager token.
export function createTopping(input: ToppingCreate): Promise<Topping> {
  return fetch('/api/menu/toppings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<Topping>(r))
}

// Manager: add a variant to the shared pool, returning it with its new id so
// it can be linked to a dish. Requires a manager token.
export function createVariant(input: VariantCreate): Promise<Variant> {
  return fetch('/api/menu/variants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<Variant>(r))
}

// Manager: create a dish under an existing subcategory. Requires a manager
// token.
export function createItem(input: ItemCreate): Promise<MenuItem> {
  return fetch('/api/menu/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<MenuItem>(r))
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

// ---- Orders ----

// A page of the user's orders for one status (newest first). `cart` returns the
// single open cart; each line comes with its item, toppings, variants and price.
export function listOrders(
  status: OrderStatus,
  page = 1,
  pageSize = 10,
): Promise<PaginatedOrders> {
  const params = new URLSearchParams({
    status,
    page: String(page),
    page_size: String(pageSize),
  })
  return fetch(`/api/orders?${params.toString()}`, {
    headers: authHeaders(),
  }).then((r) => handle<PaginatedOrders>(r))
}

// Check out the cart: stamp its total and move it from `cart` to `pending`.
export function placeOrder(): Promise<Order> {
  return fetch('/api/orders/place', {
    method: 'POST',
    headers: authHeaders(),
  }).then((r) => handle<Order>(r))
}

// ---- Orders (manager) ----

// Manager view: a page of every user's orders with the given status, newest
// first, paginated on the orders table. Requires a manager token.
export function listAllOrders(
  status: OrderStatus,
  page = 1,
  pageSize = 10,
): Promise<PaginatedOrders> {
  const params = new URLSearchParams({
    status,
    page: String(page),
    page_size: String(pageSize),
  })
  return fetch(`/api/orders/all?${params.toString()}`, {
    headers: authHeaders(),
  }).then((r) => handle<PaginatedOrders>(r))
}

// Manager action: advance an order's status along the kitchen workflow and/or
// mark it paid. Returns the updated order. Requires a manager token.
export function updateOrder(
  orderId: number,
  changes: { status?: OrderStatus; payment_status?: boolean },
): Promise<Order> {
  return fetch(`/api/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(changes),
  }).then((r) => handle<Order>(r))
}

// ---- Reviews ----

// Customer: leave/update the review (rating, note, photos) on one line of a
// completed order. Any subset of fields may be sent.
export function reviewOrderItem(
  orderItemId: number,
  changes: {
    rating?: number | null
    review?: string | null
    review_photo_paths?: string[]
  },
): Promise<OrderItem> {
  return fetch(`/api/orders/items/${orderItemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(changes),
  }).then((r) => handle<OrderItem>(r))
}

// Manager: all reviews left for a menu item (from its order lines) plus the
// average star rating. Requires a manager token.
export function viewItemRatings(itemId: number): Promise<ItemReviewsResponse> {
  return fetch(`/api/orders/items/${itemId}/reviews`, {
    headers: authHeaders(),
  }).then((r) => handle<ItemReviewsResponse>(r))
}

// Customer: the overall service review already left for an order (or null).
export function getServiceReviewForOrder(
  orderId: number,
): Promise<ServiceReview | null> {
  return fetch(`/api/service-reviews/for-order/${orderId}`, {
    headers: authHeaders(),
  }).then((r) => handle<ServiceReview | null>(r))
}

// Customer: create the overall service review for a completed order.
export function createServiceReview(input: {
  order_id: number
  rating: number
  review?: string | null
  review_images?: string[]
}): Promise<ServiceReview> {
  return fetch('/api/service-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<ServiceReview>(r))
}

// Customer: edit an existing service review.
export function updateServiceReview(
  reviewId: number,
  changes: {
    rating?: number | null
    review?: string | null
    review_images?: string[]
  },
): Promise<ServiceReview> {
  return fetch(`/api/service-reviews/${reviewId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(changes),
  }).then((r) => handle<ServiceReview>(r))
}

// Manager: the headline service rating (average + count).
export function getServiceRatingSummary(): Promise<ServiceRatingSummary> {
  return fetch('/api/service-reviews/summary', {
    headers: authHeaders(),
  }).then((r) => handle<ServiceRatingSummary>(r))
}

// Manager: a page of service reviews, newest first, plus the overall average.
export function listServiceReviews(
  page = 1,
  pageSize = 10,
): Promise<PaginatedServiceReviews> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return fetch(`/api/service-reviews?${params.toString()}`, {
    headers: authHeaders(),
  }).then((r) => handle<PaginatedServiceReviews>(r))
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

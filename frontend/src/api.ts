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

// Drop the session and bounce to the login screen of whichever area we're in.
// Which app mounts is decided by the pathname (see main.tsx): /app/admin ->
// admin, /app/manager -> manager, everything else -> customer. Reloading the
// same path therefore re-mounts the right app, and with the token cleared each
// app renders its own login screen. We reset the saved history screen to
// 'login' first because useScreen restores history.state.screen on load — so
// without this a reload would land back on the screen the token died on.
export function redirectToLogin(): void {
  clearToken()
  window.history.replaceState({ screen: 'login' }, '')
  window.location.reload()
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

// The lifecycle of an order. `cart` is the open draft; `preparing` onwards are
// placed orders moving through the kitchen, then delivery and payment.
export type OrderStatus =
  | 'cart'
  | 'preparing'
  | 'ready'
  | 'payment_pending'
  | 'payment_completed'
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

// A lightweight order row for the manager dashboard list — exactly the fields
// the collapsed card shows. The line items are deliberately not included; fetch
// them on expand via getOrder().
export interface OrderSummary {
  id: number
  status: OrderStatus
  total_amount: number | string
  created_at: string
  // Total quantity across the order's lines (the "N drinks" count).
  item_count: number
}

export interface PaginatedOrderSummaries {
  items: OrderSummary[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

// ---- Fetch plumbing ----

async function handle<T>(res: Response): Promise<T> {
  // An expired or invalid token comes back as 401 (require_jwt). Whenever we
  // were actually carrying a token, drop it and send the user to the login
  // screen of their area. The getToken() guard keeps a stray 401 on a pre-auth
  // screen (where there's nothing to expire) from triggering a reload loop; a
  // wrong OTP is a 400, so the login flow itself is unaffected.
  if (res.status === 401 && getToken()) {
    redirectToLogin()
    throw new Error('Session expired')
  }
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
  recommended_names: string[]
  recommended_descriptions: string[]
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

export interface FormatSubcategoryRequest {
  name: string
  description?: string | null
  category_id: number
}

export interface FormatSubcategoryResponse {
  original_name: string
  original_description: string | null
  recommended_names: string[]
  recommended_descriptions: string[]
  // Set if the assistant thinks the subcategory fits an existing category
  // better than the selected one.
  recommended_existing_category_id: number | null
  recommended_existing_category_name: string | null
  // Set if the assistant thinks a brand-new category should be created for it.
  suggested_create_new_category: boolean
  suggested_new_category_name: string | null
  suggested_new_category_description: string | null
}

// Manager: ask the AI assistant to polish a subcategory name + description,
// given the category it is currently filed under. Returns two suggested
// rewrites of each, and may recommend moving it to an existing category or
// creating a new one. Costs 5 AI credits per call; requires a manager token.
export function formatSubcategory(
  input: FormatSubcategoryRequest,
): Promise<FormatSubcategoryResponse> {
  return fetch('/api/ai/menu/format-subcategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  }).then((r) => handle<FormatSubcategoryResponse>(r))
}

export interface GrammarFixResponse {
  original_text: string
  fixed_text: string
}

// Manager: fix the grammar, spelling and capitalisation of an arbitrary piece
// of text. Costs 1 AI credit per call; requires a manager token.
export function fixGrammar(text: string): Promise<GrammarFixResponse> {
  return fetch('/api/ai/menu/fix-grammar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ text }),
  }).then((r) => handle<GrammarFixResponse>(r))
}

// ---- Dish-creation chat assistant ----

export interface DishAssistantVariant {
  name: string
  price_delta: number | string
}

export interface DishAssistantTopping {
  name: string
  price: number | string
}

// The dish form the assistant proposes. Category/subcategory/tag names are
// resolved to real ids server-side (null/empty when they didn't match).
export interface DishAssistantForm {
  category_id: number | null
  category_name: string | null
  subcategory_id: number | null
  subcategory_name: string | null
  name: string | null
  price: number | string | null
  is_veg: boolean | null
  description: string | null
  tag_ids: number[]
  tags: string[]
  variants: DishAssistantVariant[]
  toppings: DishAssistantTopping[]
}

export interface DishAssistantReply {
  message: string
  ready: boolean
  form: DishAssistantForm
}

// Manager: open a dish-creation chat with the AI assistant, sending the first
// message. Costs 5 AI credits. Returns a session id for follow-up turns.
export function startDishAssistant(
  message: string,
): Promise<{ session_id: string; reply: DishAssistantReply }> {
  return fetch('/api/ai/menu/dish-assistant/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message }),
  }).then((r) => handle<{ session_id: string; reply: DishAssistantReply }>(r))
}

// Manager: continue a dish-creation chat (persistent context). Costs 1 AI
// credit. Rejects with a 410 message if the session has expired.
export function sendDishAssistantMessage(
  sessionId: string,
  message: string,
): Promise<{ reply: DishAssistantReply }> {
  return fetch('/api/ai/menu/dish-assistant/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId, message }),
  }).then((r) => handle<{ reply: DishAssistantReply }>(r))
}

// Manager: end a dish-creation chat, freeing its server-side context.
export function endDishAssistant(sessionId: string): Promise<void> {
  return fetch('/api/ai/menu/dish-assistant/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ session_id: sessionId }),
  }).then((r) => handle<void>(r))
}

// ---- Create whole menu from photos / backup / restore ----

export interface MenuImportResponse {
  categories: number
  subcategories: number
  items: number
  tags: number
  toppings: number
  variants: number
  backup_path: string | null
}

export interface MenuBackupInfo {
  path: string
  created_at: string | null
  categories: number
  items: number
}

// Manager: build the entire menu from photos of a physical menu. Pass the
// uploaded photo paths plus optional instructions. Costs 20 AI credits.
//
// When a menu already exists the server replies 409 the first time; this
// resolves to `{ status: 'confirm_required' }` so the caller can show the
// warning and call again with confirmOverwrite=true. Any other failure (e.g.
// existing orders block the wipe) rejects with an error as usual.
export async function createMenuFromPhoto(
  photoPaths: string[],
  instructions: string | null,
  confirmOverwrite: boolean,
): Promise<
  { status: 'created'; result: MenuImportResponse } | { status: 'confirm_required' }
> {
  const res = await fetch('/api/ai/menu/create-menu-from-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      photo_paths: photoPaths,
      instructions,
      confirm_overwrite: confirmOverwrite,
    }),
  })
  if (res.status === 409) return { status: 'confirm_required' }
  const result = await handle<MenuImportResponse>(res)
  return { status: 'created', result }
}

// Manager: the stored menu backups (at most one) for the restore picker.
export function getMenuBackups(): Promise<MenuBackupInfo[]> {
  return fetch('/api/ai/menu/get-menu-backups', { headers: authHeaders() }).then(
    (r) => handle<MenuBackupInfo[]>(r),
  )
}

// Manager: restore a backed-up menu. Backs up and wipes the current menu, then
// rebuilds from the backup. Free (no LLM call).
export function restoreMenuFromBackup(
  backupPath: string,
): Promise<MenuImportResponse> {
  return fetch('/api/ai/menu/restore-menu-from-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ backup_path: backupPath }),
  }).then((r) => handle<MenuImportResponse>(r))
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

// Check out the cart: stamp its total and move it from `cart` to `preparing`.
export function placeOrder(): Promise<Order> {
  return fetch('/api/orders/place', {
    method: 'POST',
    headers: authHeaders(),
  }).then((r) => handle<Order>(r))
}

// ---- Orders (manager) ----

// Manager view: a page of every user's orders with the given status, newest
// first, as lightweight summaries (no line items). Backs the dashboard list;
// call getOrder() to expand one. Requires a manager token.
export function listAllOrders(
  status: OrderStatus,
  page = 1,
  pageSize = 10,
): Promise<PaginatedOrderSummaries> {
  const params = new URLSearchParams({
    status,
    page: String(page),
    page_size: String(pageSize),
  })
  return fetch(`/api/orders/all/summary?${params.toString()}`, {
    headers: authHeaders(),
  }).then((r) => handle<PaginatedOrderSummaries>(r))
}

// Manager view: one order with its line items fully expanded. Fetched when a
// manager expands a row in the dashboard list. Requires a manager token.
export function getOrder(orderId: number): Promise<Order> {
  return fetch(`/api/orders/${orderId}`, {
    headers: authHeaders(),
  }).then((r) => handle<Order>(r))
}

// Manager action: advance an order's status along the kitchen workflow
// (marking paid is the payment_pending → payment_completed step). Returns the
// updated order. Requires a manager token.
export function updateOrder(
  orderId: number,
  changes: { status?: OrderStatus },
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

// ---- Service review analysis (AI aspect scores) ----

// The singleton aggregate of AI-derived 0-10 service-aspect scores. Keys mirror
// the backend ServiceReviewScores columns; any aspect is null when the reviews
// gave nothing to score it on.
export interface ServiceReviewScores {
  number_of_reviews: number
  staff_friendliness: number | null
  speed_of_service: number | null
  order_accuracy: number | null
  atmosphere_ambiance: number | null
  cleanliness: number | null
  value_for_money: number | null
  food_quality: number | null
  menu_variety: number | null
  seating_comfort: number | null
  noise_level: number | null
  payment_billing_experience: number | null
}

// Manager: the AI-derived aggregate service-aspect scores for the analysis
// chart (zeroed/null when none have been computed yet).
export function getServiceReviewScores(): Promise<ServiceReviewScores> {
  return fetch('/api/service-reviews/scores', {
    headers: authHeaders(),
  }).then((r) => handle<ServiceReviewScores>(r))
}

// ---- Notifications ----

export type NotificationFor = 'manager' | 'admin' | 'customer'

export interface AppNotification {
  id: number
  notification_text: string
  resolved: boolean
  notification_for: NotificationFor
  created_at: string
  updated_at: string
}

export interface PaginatedNotifications {
  items: AppNotification[]
  total: number
  page: number
  page_size: number
  has_more: boolean
}

// A page of notifications for one audience, newest first. Optionally filter by
// resolved state; filtering + pagination happen at the DB level.
export function listNotifications(
  notificationFor: NotificationFor,
  resolved?: boolean,
  page = 1,
  pageSize = 20,
): Promise<PaginatedNotifications> {
  const params = new URLSearchParams({
    notification_for: notificationFor,
    page: String(page),
    page_size: String(pageSize),
  })
  if (resolved !== undefined) params.set('resolved', String(resolved))
  return fetch(`/api/notifications?${params.toString()}`, {
    headers: authHeaders(),
  }).then((r) => handle<PaginatedNotifications>(r))
}

// Mark a notification resolved (the tick button).
export function resolveNotification(id: number): Promise<AppNotification> {
  return fetch(`/api/notifications/${id}/resolve`, {
    method: 'PATCH',
    headers: authHeaders(),
  }).then((r) => handle<AppNotification>(r))
}

// ---- Chatbot ----

export interface InitiateChatResponse {
  chat_context_id: number
  // The user's open cart; later /message and /add-item calls are scoped to it.
  cart_id: number
  // True when an existing session was resumed, false when a brand-new one was
  // created. Drives whether the chat shows the generated opener (below) or
  // replays the transcript.
  resumed: boolean
  // The barista's generated opening message and its suggested items, for a
  // brand-new session. Both null when an existing session is resumed (its
  // opener is already in the transcript) or if generating the opener failed.
  first_message: string | null
  first_items: ChatItems | null
  // The opener's quick-action chips: short, first-person utterances the guest
  // can tap, each sent verbatim to /message as their turn. Null when a session
  // is resumed or the opener failed to generate.
  first_options: string[] | null
}

// Customer: start (or resume) a barista chat session. `setupOfPeople` is a
// free-text description of who's at the table (e.g. "2 adults and 1 child") and
// `vegOnly` restricts the barista to vegetarian items. Returns the active chat
// context id and the open cart id that scope the rest of the session. If the
// user already has an active session the same ids are returned.
export function initiateChat(
  setupOfPeople: string,
  vegOnly: boolean,
): Promise<InitiateChatResponse> {
  return fetch('/api/chatbot/initiate-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ setup_of_people: setupOfPeople, veg_only: vegOnly }),
  }).then((r) => handle<InitiateChatResponse>(r))
}

// Whether the user has a resumable barista session (an active chat context and
// an open cart). `active` is true only when both exist; the ids are then set.
export interface ActiveChatSession {
  active: boolean
  chat_context_id: number | null
  cart_id: number | null
}

// Customer: check for a resumable barista session before opening the chat. When
// `active` is true the client can skip the setup step and go straight to the
// chat; otherwise the setup flow runs. The backend repairs inconsistent state
// (stale session / missing cart) as a side effect.
export function getActiveChatSession(): Promise<ActiveChatSession> {
  return fetch('/api/chatbot/active-session', {
    headers: authHeaders(),
  }).then((r) => handle<ActiveChatSession>(r))
}

// A menu item the barista suggested: a full menu item plus the quantity the
// customer asked for (resolved against the real menu by the backend).
export interface ChatMenuItem extends MenuItem {
  quantity: number
}

export interface ChatMenuSubcategory {
  id: number
  name: string
  description: string | null
  photos: string[]
  display_order: number
  is_active: boolean
  items: ChatMenuItem[]
}

export interface ChatMenuCategory {
  id: number
  name: string
  description: string | null
  photos: string[]
  display_order: number
  is_active: boolean
  subcategories: ChatMenuSubcategory[]
}

// The resolved suggestion tree the barista returns for a turn (get-full-menu
// shaped, pruned to the suggested items). Null when nothing was suggested.
export interface ChatItems {
  categories: ChatMenuCategory[]
}

export interface ChatMessageResponse {
  items_json: ChatItems | null
  // The backend returns the text under the key "llm response" (with a space).
  'llm response': string | null
}

export interface ChatTranscriptEntry {
  role: 'user' | 'assistant'
  content: string | null
}

// Customer: send one turn to the barista. `cartId` is the open cart from
// initiate-chat. The reply carries the resolved item suggestions (if any) and
// the barista's natural-language message.
export function sendChatMessage(
  chatContextId: number,
  cartId: number,
  message: string,
): Promise<ChatMessageResponse> {
  return fetch('/api/chatbot/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      chat_context_id: chatContextId,
      cart_id: cartId,
      message,
    }),
  }).then((r) => handle<ChatMessageResponse>(r))
}

// Customer: the stored turns for a chat session (oldest first), used to preload
// an in-progress conversation so it can be continued. Item suggestions are not
// included — replayed turns are plain text bubbles.
export function getChatTranscript(
  chatContextId: number,
): Promise<ChatTranscriptEntry[]> {
  const params = new URLSearchParams({ chat_context_id: String(chatContextId) })
  return fetch(`/api/chatbot/transcript?${params.toString()}`, {
    headers: authHeaders(),
  }).then((r) => handle<ChatTranscriptEntry[]>(r))
}

// Customer: end the active chat session (distills preferences, clears the
// session and its transcript server-side).
export function endChat(): Promise<{ ended: boolean }> {
  return fetch('/api/chatbot/end-chat', {
    method: 'POST',
    headers: authHeaders(),
  }).then((r) => handle<{ ended: boolean }>(r))
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

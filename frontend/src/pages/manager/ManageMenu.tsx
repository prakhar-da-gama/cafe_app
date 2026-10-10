import { useCallback, useEffect, useState } from 'react'
import DishAiPage, { type ChatMsg } from '../../components/DishAiPage'
import {
  createCategory,
  createItem,
  createSubcategory,
  createTopping,
  createVariant,
  endDishAssistant,
  fixGrammar,
  formatCategory,
  formatSubcategory,
  getFullMenu,
  listTags,
  sendDishAssistantMessage,
  startDishAssistant,
  uploadImage,
  type DishAssistantForm,
  type FormatCategoryResponse,
  type FormatSubcategoryResponse,
  type MenuCategory,
  type Tag,
} from '../../api'
import ManagerHeader from '../../components/ManagerHeader'

interface Props {
  onBack: () => void
}

/** Manager authoring page: create a category, a subcategory, or a dish. Each
 *  section is collapsed until its header is clicked, and creating anything
 *  refreshes the shared menu so the category and subcategory pickers immediately
 *  reflect the new rows. */
export default function ManageMenu({ onBack }: Props) {
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  const refreshMenu = useCallback(
    () =>
      getFullMenu()
        .then((res) => setMenu(res.categories))
        .catch(() => {}),
    [],
  )

  useEffect(() => {
    refreshMenu()
    listTags()
      .then(setTags)
      .catch(() => {})
  }, [refreshMenu])

  return (
    <div className="screen menu-screen mgr-screen">
      <ManagerHeader onBack={onBack} />

      <div className="menu-head">
        <h1 className="menu-title">Add to the menu</h1>
      </div>

      <div className="manage-forms">
        <Collapsible title="Create new category">
          <AddCategoryForm onCreated={refreshMenu} />
        </Collapsible>
        <Collapsible title="Create new subcategory">
          <AddSubcategoryForm categories={menu} onCreated={refreshMenu} />
        </Collapsible>
        <Collapsible title="Create a new dish">
          <AddItemForm categories={menu} tags={tags} onCreated={refreshMenu} />
        </Collapsible>
      </div>
    </div>
  )
}

/** A card whose body is hidden until its header is clicked. */
function Collapsible({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card section-card">
      <button
        type="button"
        className="section-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="form-section-title">{title}</span>
        <span className="section-chevron" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

/** A small success/error line shared by the forms. */
function Feedback({ ok, error }: { ok: string | null; error: string | null }) {
  if (error) return <p className="form-error">{error}</p>
  if (ok) return <p className="form-ok">{ok}</p>
  return null
}

/** A text input with a small green "G" button on its right that fixes the
 *  typed text's grammar/spelling via the AI assistant (1 credit). After a fix
 *  the button becomes a revert button that restores the original text; typing
 *  anything flips it back to the "G" button and forgets the saved original. */
function GrammarInput({
  value,
  onChange,
  onError,
  className,
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  onError?: (msg: string | null) => void
  className?: string
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'className' | 'onError'
>) {
  const [mode, setMode] = useState<'fix' | 'revert'>('fix')
  const [previous, setPrevious] = useState('')
  const [busy, setBusy] = useState(false)

  const handleType = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Any manual edit invalidates a pending revert.
    if (mode === 'revert') {
      setMode('fix')
      setPrevious('')
    }
    onChange(e.target.value)
  }

  const fix = async () => {
    const text = value.trim()
    if (!text) return
    setBusy(true)
    onError?.(null)
    try {
      const res = await fixGrammar(text)
      setPrevious(value)
      onChange(res.fixed_text)
      setMode('revert')
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const revert = () => {
    onChange(previous)
    setPrevious('')
    setMode('fix')
  }

  const isRevert = mode === 'revert'
  return (
    <div className="grammar-wrap">
      <input
        {...rest}
        value={value}
        onChange={handleType}
        className={'text-input has-grammar' + (className ? ' ' + className : '')}
      />
      <button
        type="button"
        className={isRevert ? 'grammar-btn is-revert' : 'grammar-btn'}
        onClick={isRevert ? revert : fix}
        disabled={busy || (!isRevert && !value.trim())}
        title={
          isRevert
            ? 'Revert to your original text'
            : 'Fix grammar & spelling (1 credit)'
        }
        aria-label={
          isRevert ? 'Revert to your original text' : 'Fix grammar and spelling'
        }
      >
        {busy ? '…' : isRevert ? '↶' : 'G'}
      </button>
    </div>
  )
}

// ---- Shared "Format with AI" assistant ----

/** The shape both the category and subcategory format responses share: five
 *  suggested names paired with five suggested descriptions. */
interface Suggestable {
  recommended_names: string[]
  recommended_descriptions: string[]
}

/** Drives the "Format with AI" flow for a name+description pair. One paid call
 *  returns five ordered suggestions; the manager can cycle through all of them
 *  for free ("Try again" / "Use previous"), revert to what they typed ("Use
 *  original"), and only pay again once every suggestion has been seen
 *  ("Generate new"). `minReady` lets a form require more than a 3-char name
 *  (the subcategory form also needs a category selected). */
function useAiFormat<T extends Suggestable>({
  name,
  description,
  setName,
  setDescription,
  minReady,
  fetcher,
  onError,
  onResult,
}: {
  name: string
  description: string
  setName: (v: string) => void
  setDescription: (v: string) => void
  minReady: boolean
  fetcher: () => Promise<T>
  onError: (m: string | null) => void
  onResult?: (res: T) => void
}) {
  const [busy, setBusy] = useState(false)
  const [suggestion, setSuggestion] = useState<T | null>(null)
  const [original, setOriginal] = useState<{
    name: string
    description: string
  } | null>(null)
  const [idx, setIdx] = useState(0)

  const count = suggestion
    ? Math.min(
        suggestion.recommended_names.length,
        suggestion.recommended_descriptions.length,
      )
    : 0

  const apply = (s: T, i: number) => {
    setName(s.recommended_names[i])
    setDescription(s.recommended_descriptions[i])
    setIdx(i)
  }

  const ready = name.trim().length >= 3 && minReady

  // The paid call, used by both "Format with AI" and "Generate new". The typed
  // values are captured only on the first run so "Use original" always reverts
  // to them, not to a previously-shown suggestion.
  const run = async () => {
    if (!ready) return
    setBusy(true)
    onError(null)
    try {
      const captured = original ?? { name, description }
      const res = await fetcher()
      setOriginal(captured)
      setSuggestion(res)
      apply(res, 0)
      onResult?.(res)
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setSuggestion(null)
    setOriginal(null)
    setIdx(0)
  }

  const useOriginal = () => {
    if (original) {
      setName(original.name)
      setDescription(original.description)
    }
    reset()
  }

  const next = () => {
    if (suggestion && idx < count - 1) apply(suggestion, idx + 1)
  }
  const prev = () => {
    if (suggestion && idx > 0) apply(suggestion, idx - 1)
  }

  return {
    busy,
    hasSuggestion: suggestion !== null,
    idx,
    count,
    ready,
    run,
    reset,
    useOriginal,
    next,
    prev,
  }
}

type AiFormat = ReturnType<typeof useAiFormat>

/** Renders the Format-with-AI button row from a `useAiFormat` instance: a single
 *  "Format with AI" button until suggestions exist, then Use original / Use
 *  previous / Try again, with the last suggestion swapping "Try again" for the
 *  paid "Generate new". */
function AiFormatControls({ ai }: { ai: AiFormat }) {
  if (!ai.hasSuggestion) {
    return (
      <div className="ai-format">
        <button
          type="button"
          className="candy-btn btn-sky"
          onClick={ai.run}
          disabled={ai.busy || !ai.ready}
        >
          {ai.busy ? 'Formatting…' : 'Format with AI (5 credits)'}
        </button>
      </div>
    )
  }
  const isLast = ai.idx >= ai.count - 1
  return (
    <div className="ai-format">
      <span className="ai-progress">
        Suggestion {ai.idx + 1} of {ai.count}
      </span>
      <div className="ai-btn-row">
        <button
          type="button"
          className="ghost-btn"
          onClick={ai.useOriginal}
          disabled={ai.busy}
        >
          Use original
        </button>
        {ai.idx > 0 && (
          <button
            type="button"
            className="ghost-btn"
            onClick={ai.prev}
            disabled={ai.busy}
          >
            Use previous
          </button>
        )}
        {isLast ? (
          <button
            type="button"
            className="candy-btn btn-sky"
            onClick={ai.run}
            disabled={ai.busy}
          >
            {ai.busy ? 'Formatting…' : 'Generate new (5 credits)'}
          </button>
        ) : (
          <button
            type="button"
            className="candy-btn btn-sky"
            onClick={ai.next}
            disabled={ai.busy}
          >
            Try again (0 credits)
          </button>
        )}
      </div>
    </div>
  )
}

// ---- Create category ----

function AddCategoryForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // "Format with AI" assistant: one paid call returns five suggestions the
  // manager can cycle through for free before paying again.
  const ai = useAiFormat<FormatCategoryResponse>({
    name,
    description,
    setName,
    setDescription,
    minReady: true,
    onError: setError,
    fetcher: () =>
      formatCategory({
        name: name.trim(),
        description: description.trim() || null,
      }),
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const cat = await createCategory({
        name: clean,
        description: description.trim() || null,
      })
      setOk(`Added category “${cat.name}”.`)
      setName('')
      setDescription('')
      ai.reset()
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span className="field-label">Name</span>
        <GrammarInput
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={setName}
          onError={setError}
          placeholder="e.g. Hot Coffees"
        />
      </label>

      <label className="field">
        <span className="field-label">Description (optional)</span>
        <GrammarInput
          type="text"
          value={description}
          onChange={setDescription}
          onError={setError}
          placeholder="A short line shown under the heading"
        />
      </label>

      <Feedback ok={ok} error={error} />

      <AiFormatControls ai={ai} />

      <button
        type="submit"
        className="candy-btn btn-grape"
        disabled={busy || !name.trim()}
      >
        {busy ? 'Adding…' : 'Add category'}
      </button>
    </form>
  )
}

// ---- Create subcategory ----

function AddSubcategoryForm({
  categories,
  onCreated,
}: {
  categories: MenuCategory[]
  onCreated: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // The paid endpoint may also decide this subcategory belongs under a
  // brand-new category; when it does we surface that in a popup (`newCat`).
  const [newCat, setNewCat] = useState<{ name: string; description: string } | null>(
    null,
  )
  const [creatingCat, setCreatingCat] = useState(false)

  // "Format with AI" assistant: five suggestions per paid call, cycled for
  // free. Requires a category to be selected as well as a 3-char name, and
  // opens the new-category popup whenever a response recommends one.
  const ai = useAiFormat<FormatSubcategoryResponse>({
    name,
    description,
    setName,
    setDescription,
    minReady: !!categoryId,
    onError: setError,
    fetcher: () =>
      formatSubcategory({
        name: name.trim(),
        description: description.trim() || null,
        category_id: Number(categoryId),
      }),
    onResult: (res) => {
      if (res.suggested_create_new_category && res.suggested_new_category_name) {
        setNewCat({
          name: res.suggested_new_category_name,
          description: res.suggested_new_category_description ?? '',
        })
      }
    },
  })

  // From the popup: create the AI-suggested category, then file the subcategory
  // under it by selecting it in the picker.
  const createRecommendedCategory = async () => {
    if (!newCat) return
    setCreatingCat(true)
    setError(null)
    try {
      const cat = await createCategory({
        name: newCat.name,
        description: newCat.description || null,
      })
      await Promise.resolve(onCreated())
      setCategoryId(String(cat.id))
      setNewCat(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreatingCat(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean || !categoryId) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const sub = await createSubcategory({
        category_id: Number(categoryId),
        name: clean,
        description: description.trim() || null,
      })
      setOk(`Added subcategory “${sub.name}”.`)
      setName('')
      setDescription('')
      ai.reset()
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span className="field-label">Category</span>
        <select
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="text-input"
        >
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Name</span>
        <GrammarInput
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={setName}
          onError={setError}
          placeholder="e.g. Espresso-based"
        />
      </label>

      <label className="field">
        <span className="field-label">Description (optional)</span>
        <GrammarInput
          type="text"
          value={description}
          onChange={setDescription}
          onError={setError}
          placeholder="A short line shown under the heading"
        />
      </label>

      <Feedback ok={ok} error={error} />

      <AiFormatControls ai={ai} />

      <button
        type="submit"
        className="candy-btn btn-sky"
        disabled={busy || !name.trim() || !categoryId}
      >
        {busy ? 'Adding…' : 'Add subcategory'}
      </button>

      {newCat && (
        <div
          className="sheet-overlay"
          onClick={() => !creatingCat && setNewCat(null)}
        >
          <div
            className="card ai-pop"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="ai-pop-title">AI suggests a new category</h3>
            <p className="muted">
              This subcategory might fit better in a brand-new category than the
              one you picked. Create it and file the subcategory under it?
            </p>
            <div className="ai-pop-card">
              <strong>{newCat.name}</strong>
              {newCat.description && <span>{newCat.description}</span>}
            </div>
            <div className="ai-btn-row">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setNewCat(null)}
                disabled={creatingCat}
              >
                Not now
              </button>
              <button
                type="button"
                className="candy-btn btn-grape"
                onClick={createRecommendedCategory}
                disabled={creatingCat}
              >
                {creatingCat ? 'Creating…' : 'Create category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}

// ---- Create a new dish ----

// Draft rows for the variants/toppings the manager types inline. Each is posted
// to its own table on submit, and the resulting id is linked to the new dish.
interface VariantDraft {
  name: string
  priceDelta: string
}
interface ToppingDraft {
  name: string
  price: string
}

function AddItemForm({
  categories,
  tags,
  onCreated,
}: {
  categories: MenuCategory[]
  tags: Tag[]
  onCreated: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [isVeg, setIsVeg] = useState(true)
  const [tagIds, setTagIds] = useState<Set<number>>(new Set())
  const [variants, setVariants] = useState<VariantDraft[]>([])
  const [toppings, setToppings] = useState<ToppingDraft[]>([])
  const [photo, setPhoto] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // "Create with AI" chat assistant. The session lives server-side (Gemini chat
  // with persistent context); here we keep only the ephemeral transcript and
  // the current session id. Each assistant reply fills the form below.
  const [chatOpen, setChatOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  // The latest proposal the assistant returned, shown as JSON on the AI page.
  const [lastForm, setLastForm] = useState<DishAssistantForm | null>(null)
  // Credits spent in this chat so far (mirrors the backend costs: 5 to start,
  // 1 per follow-up message). Shown live beside the AI page title.
  const [creditsUsed, setCreditsUsed] = useState(0)

  const subcategories =
    categories.find((c) => String(c.id) === categoryId)?.subcategories ?? []

  // Fill the form from an assistant proposal. Only fields it actually returned
  // are applied, so it never wipes something it chose to leave blank.
  const applyAiForm = (form: DishAssistantForm) => {
    if (form.category_id != null) setCategoryId(String(form.category_id))
    if (form.subcategory_id != null) setSubcategoryId(String(form.subcategory_id))
    if (form.name != null) setName(form.name)
    if (form.price != null) setPrice(String(form.price))
    if (form.is_veg != null) setIsVeg(form.is_veg)
    if (form.description != null) setDescription(form.description)
    if (form.tag_ids.length) setTagIds(new Set(form.tag_ids))
    if (form.variants.length)
      setVariants(
        form.variants.map((v) => ({
          name: v.name,
          priceDelta: String(v.price_delta),
        })),
      )
    if (form.toppings.length)
      setToppings(
        form.toppings.map((t) => ({ name: t.name, price: String(t.price) })),
      )
  }

  const sendChat = async () => {
    const text = chatInput.trim()
    if (!text || chatBusy) return
    setChatBusy(true)
    setChatError(null)
    setMessages((m) => [...m, { role: 'user', text }])
    setChatInput('')
    // Starting a fresh session costs 5 credits; every follow-up costs 1.
    const isStart = sessionId === null
    try {
      const { reply, newSession } = sessionId
        ? {
            reply: (await sendDishAssistantMessage(sessionId, text)).reply,
            newSession: sessionId,
          }
        : await startDishAssistant(text).then((r) => ({
            reply: r.reply,
            newSession: r.session_id,
          }))
      // Only count a charge once the call actually succeeded.
      setCreditsUsed((c) => c + (isStart ? 5 : 1))
      setSessionId(newSession)
      setMessages((m) => [...m, { role: 'assistant', text: reply.message }])
      setReady(reply.ready)
      setLastForm(reply.form)
      applyAiForm(reply.form)
    } catch (err) {
      const msg = (err as Error).message
      setChatError(msg)
      // A 410 means the server session timed out; drop it so the next send
      // starts a fresh one.
      if (/expired/i.test(msg)) setSessionId(null)
    } finally {
      setChatBusy(false)
    }
  }

  // End the server session and clear the chat (after a successful create, or if
  // the manager wants to drop it).
  const resetChat = () => {
    if (sessionId) endDishAssistant(sessionId).catch(() => {})
    setSessionId(null)
    setMessages([])
    setChatInput('')
    setReady(false)
    setChatError(null)
    setLastForm(null)
    setCreditsUsed(0)
    setChatOpen(false)
  }

  const toggleTag = (id: number) =>
    setTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const addVariant = () =>
    setVariants((prev) => [...prev, { name: '', priceDelta: '' }])
  const updateVariant = (i: number, patch: Partial<VariantDraft>) =>
    setVariants((prev) =>
      prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)),
    )
  const removeVariant = (i: number) =>
    setVariants((prev) => prev.filter((_, idx) => idx !== i))

  const addTopping = () =>
    setToppings((prev) => [...prev, { name: '', price: '' }])
  const updateTopping = (i: number, patch: Partial<ToppingDraft>) =>
    setToppings((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    )
  const removeTopping = (i: number) =>
    setToppings((prev) => prev.filter((_, idx) => idx !== i))

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { path } = await uploadImage(file)
      setPhoto(path)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const priceValue = Number(price)
  const priceValid = price !== '' && !Number.isNaN(priceValue) && priceValue >= 0
  // Every typed variant/topping row must be named before we can submit.
  const variantsValid = variants.every((v) => v.name.trim())
  const toppingsValid = toppings.every((t) => t.name.trim())
  const canSubmit =
    !!name.trim() &&
    !!subcategoryId &&
    priceValid &&
    variantsValid &&
    toppingsValid &&
    !uploading

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      // Post each new topping and variant first, collecting the ids the dish
      // will reference. Empty rows (no name) are skipped.
      const toppingIds: number[] = []
      for (const t of toppings) {
        const clean = t.name.trim()
        if (!clean) continue
        const priceNum = Number(t.price)
        const created = await createTopping({
          name: clean,
          price: t.price !== '' && !Number.isNaN(priceNum) ? priceNum : 0,
        })
        toppingIds.push(created.id)
      }

      const variantIds: number[] = []
      for (const v of variants) {
        const clean = v.name.trim()
        if (!clean) continue
        const deltaNum = Number(v.priceDelta)
        const created = await createVariant({
          name: clean,
          price_delta:
            v.priceDelta !== '' && !Number.isNaN(deltaNum) ? deltaNum : 0,
        })
        variantIds.push(created.id)
      }

      const item = await createItem({
        subcategory_id: Number(subcategoryId),
        name: name.trim(),
        description: description.trim() || null,
        price: priceValue,
        photos: photo ? [photo] : [],
        tag_ids: [...tagIds],
        topping_ids: toppingIds,
        variant_ids: variantIds,
        is_veg: isVeg,
      })
      setOk(`Added “${item.name}” to the menu.`)
      setName('')
      setPrice('')
      setDescription('')
      setTagIds(new Set())
      setVariants([])
      setToppings([])
      setPhoto(null)
      setIsVeg(true)
      // Creating the dish is the end of the AI flow: close the chat session.
      resetChat()
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // The AI assistant opens as its own full-page view (chat on top, the LLM's
  // JSON proposal below). Returning early keeps AddItemForm mounted so the form
  // state the assistant fills in survives until the manager presses Done.
  if (chatOpen) {
    return (
      <DishAiPage
        messages={messages}
        input={chatInput}
        onInput={setChatInput}
        busy={chatBusy}
        error={chatError}
        ready={ready}
        started={sessionId !== null}
        formJson={lastForm}
        creditsUsed={creditsUsed}
        onSend={sendChat}
        onDone={() => setChatOpen(false)}
      />
    )
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span className="field-label">Category</span>
        <select
          required
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setSubcategoryId('')
          }}
          className="text-input"
        >
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Subcategory</span>
        <select
          required
          value={subcategoryId}
          onChange={(e) => setSubcategoryId(e.target.value)}
          className="text-input"
          disabled={!categoryId}
        >
          <option value="">
            {categoryId ? 'Choose a subcategory…' : 'Pick a category first'}
          </option>
          {subcategories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Name</span>
        <GrammarInput
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={setName}
          onError={setError}
          placeholder="e.g. Cardamom Cappuccino"
        />
      </label>

      <label className="field">
        <span className="field-label">Price (₹)</span>
        <input
          type="number"
          required
          min={0}
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="180"
          className="text-input"
        />
      </label>

      <div className="field">
        <span className="field-label">Type</span>
        <div className="seg">
          <button
            type="button"
            className={isVeg ? 'seg-on' : ''}
            onClick={() => setIsVeg(true)}
          >
            Veg
          </button>
          <button
            type="button"
            className={!isVeg ? 'seg-on' : ''}
            onClick={() => setIsVeg(false)}
          >
            Non-veg
          </button>
          <span className={isVeg ? 'seg-pill' : 'seg-pill seg-pill-right'} />
        </div>
      </div>

      <label className="field">
        <span className="field-label">Description (optional)</span>
        <GrammarInput
          type="text"
          value={description}
          onChange={setDescription}
          onError={setError}
          placeholder="Shown when the dish is opened"
        />
      </label>

      {tags.length > 0 && (
        <div className="field">
          <span className="field-label">Flavour tags (optional)</span>
          <div className="chip-row">
            {tags.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className={tagIds.has(t.id) ? 'cat-pill cat-on' : 'cat-pill'}
                data-candy={(i % 8) + 1}
                onClick={() => toggleTag(t.id)}
                aria-pressed={tagIds.has(t.id)}
              >
                {t.tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Variants: each becomes a row in the variants table, linked to this dish. */}
      <div className="field">
        <span className="field-label">Variants (optional)</span>
        {variants.map((v, i) => (
          <div className="option-row" key={i}>
            <input
              type="text"
              value={v.name}
              onChange={(e) => updateVariant(i, { name: e.target.value })}
              placeholder="e.g. Large"
              className="text-input option-name"
            />
            <input
              type="number"
              step="1"
              value={v.priceDelta}
              onChange={(e) => updateVariant(i, { priceDelta: e.target.value })}
              placeholder="+40"
              className="text-input option-price"
              aria-label="Price change (₹)"
            />
            <button
              type="button"
              className="option-remove"
              onClick={() => removeVariant(i)}
              aria-label="Remove variant"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="ghost-btn sm" onClick={addVariant}>
          + Add variant
        </button>
      </div>

      {/* Toppings: each becomes a row in the toppings table, linked to this dish. */}
      <div className="field">
        <span className="field-label">Toppings (optional)</span>
        {toppings.map((t, i) => (
          <div className="option-row" key={i}>
            <input
              type="text"
              value={t.name}
              onChange={(e) => updateTopping(i, { name: e.target.value })}
              placeholder="e.g. Extra shot"
              className="text-input option-name"
            />
            <input
              type="number"
              min={0}
              step="1"
              value={t.price}
              onChange={(e) => updateTopping(i, { price: e.target.value })}
              placeholder="30"
              className="text-input option-price"
              aria-label="Price (₹)"
            />
            <button
              type="button"
              className="option-remove"
              onClick={() => removeTopping(i)}
              aria-label="Remove topping"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="ghost-btn sm" onClick={addTopping}>
          + Add topping
        </button>
      </div>

      <div className="field">
        <span className="field-label">Photo (optional)</span>
        <input
          type="file"
          accept="image/*"
          onChange={onFile}
          className="text-input file-input"
        />
        {uploading && <p className="muted">Uploading…</p>}
        {photo && !uploading && (
          <div className="photo-preview">
            <img src={photo} alt="Dish preview" />
            <button
              type="button"
              className="ghost-btn sm"
              onClick={() => setPhoto(null)}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      <Feedback ok={ok} error={error} />

      <button
        type="button"
        className="candy-btn btn-grape"
        onClick={() => setChatOpen(true)}
      >
        {sessionId ? 'Continue creating with AI' : 'Create with AI (5 credits)'}
      </button>

      <button
        type="submit"
        className="candy-btn btn-mint"
        disabled={busy || !canSubmit}
      >
        {busy ? 'Adding…' : 'Add dish'}
      </button>
    </form>
  )
}

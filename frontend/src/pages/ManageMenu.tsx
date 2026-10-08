import { useCallback, useEffect, useState } from 'react'
import {
  createCategory,
  createItem,
  createSubcategory,
  getFullMenu,
  listTags,
  uploadImage,
  type MenuCategory,
  type Tag,
} from '../api'
import ManagerHeader from '../components/ManagerHeader'

interface Props {
  onBack: () => void
}

/** Manager authoring page: add a category, a subcategory, or a dish. Each form
 *  is independent; creating anything refreshes the shared menu so the category
 *  and subcategory pickers immediately reflect the new rows. */
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
        <AddCategoryForm onCreated={refreshMenu} />
        <AddSubcategoryForm categories={menu} onCreated={refreshMenu} />
        <AddItemForm categories={menu} tags={tags} onCreated={refreshMenu} />
      </div>
    </div>
  )
}

/** A small success/error line shared by the forms. */
function Feedback({ ok, error }: { ok: string | null; error: string | null }) {
  if (error) return <p className="form-error">{error}</p>
  if (ok) return <p className="form-ok">{ok}</p>
  return null
}

// ---- Add category ----

function AddCategoryForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

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
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <form onSubmit={submit} className="stack">
        <h2 className="form-section-title">New category</h2>

        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hot Coffees"
            className="text-input"
          />
        </label>

        <label className="field">
          <span className="field-label">Description (optional)</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short line shown under the heading"
            className="text-input"
          />
        </label>

        <Feedback ok={ok} error={error} />

        <button
          type="submit"
          className="candy-btn btn-grape"
          disabled={busy || !name.trim()}
        >
          {busy ? 'Adding…' : 'Add category'}
        </button>
      </form>
    </div>
  )
}

// ---- Add subcategory ----

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
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <form onSubmit={submit} className="stack">
        <h2 className="form-section-title">New subcategory</h2>

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
          <input
            type="text"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Espresso-based"
            className="text-input"
          />
        </label>

        <label className="field">
          <span className="field-label">Description (optional)</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short line shown under the heading"
            className="text-input"
          />
        </label>

        <Feedback ok={ok} error={error} />

        <button
          type="submit"
          className="candy-btn btn-sky"
          disabled={busy || !name.trim() || !categoryId}
        >
          {busy ? 'Adding…' : 'Add subcategory'}
        </button>
      </form>
    </div>
  )
}

// ---- Add item ----

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
  const [photo, setPhoto] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const subcategories =
    categories.find((c) => String(c.id) === categoryId)?.subcategories ?? []

  const toggleTag = (id: number) =>
    setTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

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
  const canSubmit = !!name.trim() && !!subcategoryId && priceValid && !uploading

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const item = await createItem({
        subcategory_id: Number(subcategoryId),
        name: name.trim(),
        description: description.trim() || null,
        price: priceValue,
        photos: photo ? [photo] : [],
        tag_ids: [...tagIds],
        is_veg: isVeg,
      })
      setOk(`Added “${item.name}” to the menu.`)
      setName('')
      setPrice('')
      setDescription('')
      setTagIds(new Set())
      setPhoto(null)
      setIsVeg(true)
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <form onSubmit={submit} className="stack">
        <h2 className="form-section-title">New dish</h2>

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
          <input
            type="text"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cardamom Cappuccino"
            className="text-input"
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
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown when the dish is opened"
            className="text-input"
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
                  className={
                    tagIds.has(t.id) ? 'cat-pill cat-on' : 'cat-pill'
                  }
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
          type="submit"
          className="candy-btn btn-mint"
          disabled={busy || !canSubmit}
        >
          {busy ? 'Adding…' : 'Add dish'}
        </button>
      </form>
    </div>
  )
}

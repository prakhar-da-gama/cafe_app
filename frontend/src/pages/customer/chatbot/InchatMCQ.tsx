import { useState } from 'react'

interface Props {
  // The barista's quick-action chips for this turn: short, first-person
  // utterances the guest can tap instead of typing.
  options: string[]
  // Called with the tapped chip's EXACT text so the parent can send it to the
  // barista verbatim as the customer's next message.
  onSelect: (text: string) => void
}

// Self-contained styles, in the app's candy palette, so the chips read as a
// small set of tappable prompts sitting under the barista's opening message
// (never a popup). Kept in this one file alongside the markup and logic, the
// same way InchatMenu is built.
const MCQ_CSS = `
.mcq-root {
  align-self: flex-start;
  max-width: 94%;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  animation: mcq-in 0.3s ease both;
}
@keyframes mcq-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.mcq-chip {
  border: 2px solid var(--line);
  background: #fff;
  color: var(--ink);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85rem;
  line-height: 1.2;
  padding: 9px 15px;
  border-radius: 999px;
  box-shadow: 0 2px 6px rgba(58,43,74,.06);
  transition: transform 0.1s, border-color 0.12s, background 0.12s, color 0.12s,
    opacity 0.12s;
}
.mcq-chip:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--candy-6) 55%, #fff);
  background: color-mix(in srgb, var(--candy-6) 7%, #fff);
}
.mcq-chip:active:not(:disabled) { transform: scale(0.95); }
.mcq-chip-on {
  border-color: var(--candy-6);
  background: linear-gradient(135deg, var(--candy-1), var(--candy-6));
  color: #fff;
}
/* Once one chip is tapped the rest fade back — the intent has been chosen. */
.mcq-chip:disabled { cursor: default; }
.mcq-chip:disabled:not(.mcq-chip-on) { opacity: 0.4; }
`

/** The barista's quick-action chips as an in-chat multiple-choice row. Tapping
 *  a chip hands its exact text up to the parent (sent verbatim to the barista as
 *  the customer's turn) and locks the row, highlighting the chosen chip — so the
 *  guest navigates by intent instead of facing a blank input. */
export default function InchatMCQ({ options, onSelect }: Props) {
  // The chip the guest tapped, if any; locks the row once set.
  const [chosen, setChosen] = useState<string | null>(null)

  const clean = options.map((o) => o.trim()).filter(Boolean)
  if (clean.length === 0) return null

  function pick(text: string) {
    if (chosen !== null) return
    setChosen(text)
    onSelect(text)
  }

  return (
    <div className="mcq-root" role="group" aria-label="Quick actions">
      <style>{MCQ_CSS}</style>
      {clean.map((text, i) => (
        <button
          key={`${i}-${text}`}
          type="button"
          className={text === chosen ? 'mcq-chip mcq-chip-on' : 'mcq-chip'}
          onClick={() => pick(text)}
          disabled={chosen !== null}
          aria-pressed={text === chosen}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { DishAssistantForm } from '../api'

/** One line of the ephemeral dish-assistant transcript (kept only in component
 *  state for the length of the chat; never persisted). */
export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
}

/** A true full-screen, light chat page (portaled to <body> so it escapes any
 *  transformed ancestor instead of floating like a popup). The person's text
 *  sits in a black box; the assistant's reply flows as plain text below, like a
 *  light-mode ChatGPT/Claude thread. The LLM's JSON proposal is reached via the
 *  "Item preview" button, which opens it in its own popup. Purely presentational
 *  — all state lives in the parent — so it can be reused wherever a dish-style
 *  AI chat is needed. */
export default function DishAiPage({
  messages,
  input,
  onInput,
  busy,
  error,
  ready,
  started,
  formJson,
  creditsUsed,
  onSend,
  onDone,
}: {
  messages: ChatMsg[]
  input: string
  onInput: (v: string) => void
  busy: boolean
  error: string | null
  ready: boolean
  started: boolean
  formJson: DishAssistantForm | null
  /** Credits spent in this chat so far (tracked by the caller). */
  creditsUsed: number
  onSend: () => void
  onDone: () => void
}) {
  // The item preview opens in its own popup rather than sitting beside the chat.
  const [previewOpen, setPreviewOpen] = useState(false)
  // The credit badge toggles a small popover explaining how credits are spent.
  const [rulesOpen, setRulesOpen] = useState(false)

  return createPortal(
    <div className="ai-page" role="dialog" aria-modal="true" aria-label="Create a dish with AI">
      <header className="ai-page-head">
        <button
          type="button"
          className="mono-btn mono-ghost ai-nav-btn"
          onClick={onDone}
        >
          <span aria-hidden>←</span> Back
        </button>
        <div className="ai-page-heading">
          <h3 className="ai-page-title">Create a dish with AI</h3>
          <div className="ai-credits">
            <button
              type="button"
              className="ai-credits-badge"
              onClick={() => setRulesOpen((o) => !o)}
              aria-expanded={rulesOpen}
              aria-label={`${creditsUsed} credits used this chat — tap for pricing`}
              title="How credits are spent"
            >
              <span className="ai-credits-dot" aria-hidden>
                ◉
              </span>
              {creditsUsed}
            </button>
            {rulesOpen && (
              <>
                <div
                  className="ai-pop-backdrop"
                  onClick={() => setRulesOpen(false)}
                />
                <div className="ai-credits-pop" role="dialog" aria-label="AI credit pricing">
                  <p className="ai-credits-used">
                    {creditsUsed} credits used this chat
                  </p>
                  <ul className="ai-credits-rules">
                    <li>Starting the chat costs 5 credits</li>
                    <li>Each message costs 1 credit</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          className="mono-btn mono-solid ai-nav-btn"
          onClick={onDone}
        >
          Done
        </button>
      </header>

      <div className="ai-chat-scroll">
        <div className="ai-chat-log">
          {messages.length === 0 && (
            <p className="ai-chat-hint ai-mono-hint">
              Describe the dish you want to add — e.g. “a large iced caramel
              latte, veg, around ₹220”. Starting costs 5 credits; each reply
              after that costs 1.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`ai-msg ai-msg-${m.role}`}>
              {m.text}
            </div>
          ))}
          {busy && (
            <div className="ai-msg ai-msg-assistant ai-msg-typing">Thinking…</div>
          )}
          {ready && !busy && (
            <p className="ai-chat-hint ai-ready-hint">
              Looks ready — press Done to review the form, then Add dish.
            </p>
          )}
          {error && <p className="ai-chat-hint ai-error-hint">{error}</p>}
        </div>
      </div>

      <div className="ai-compose">
        <div className="ai-compose-inner">
          <div className="ai-compose-bar">
            <button
              type="button"
              className="mono-btn mono-ghost ai-preview-btn"
              onClick={() => setPreviewOpen(true)}
            >
              Item preview
            </button>
          </div>
          <div className="ai-chat-input">
            <textarea
              className="mono-input"
              rows={2}
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
              placeholder={
                started ? 'Reply to the assistant…' : 'Describe the dish…'
              }
            />
            <button
              type="button"
              className="mono-btn mono-solid ai-send-btn"
              onClick={onSend}
              disabled={busy || !input.trim()}
              title={started ? 'Send (1 credit)' : 'Start (5 credits)'}
              aria-label={started ? 'Send (1 credit)' : 'Start (5 credits)'}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div className="sheet-overlay" onClick={() => setPreviewOpen(false)}>
          <div
            className="card ai-preview-pop"
            role="dialog"
            aria-modal="true"
            aria-label="Item preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ai-preview-head">
              <h3 className="ai-page-title">Item preview</h3>
              <button
                type="button"
                className="mono-btn mono-ghost"
                onClick={() => setPreviewOpen(false)}
              >
                Close
              </button>
            </div>
            {formJson ? (
              <pre className="ai-json">{JSON.stringify(formJson, null, 2)}</pre>
            ) : (
              <p className="ai-chat-hint ai-mono-hint">
                The dish details the assistant extracts will appear here as JSON.
              </p>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

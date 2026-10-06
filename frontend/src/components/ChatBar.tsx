interface Props {
  onOpen: () => void
}

/** Dashboard launcher: tapping it opens the full barista chat page. */
export default function ChatBar({ onOpen }: Props) {
  return (
    <button
      type="button"
      className="chatbar chatbar-launch"
      onClick={onOpen}
      aria-label="Chat with our barista"
    >
      <span className="chat-dot" aria-hidden="true" />
      <span className="chat-placeholder">Chat with our barista</span>
      <span className="mic-btn" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path
            d="M6 11a6 6 0 0 0 12 0M12 17v3.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </button>
  )
}

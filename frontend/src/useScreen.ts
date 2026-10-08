import { useCallback, useEffect, useState } from 'react'

/**
 * Screen state that is kept in sync with the browser history stack.
 *
 * The apps navigate by swapping a single `screen` string rather than by URL, so
 * on their own the browser only ever holds the one history entry it loaded with
 * — pressing Back (or the phone's back-swipe) unloads the whole site. This hook
 * pushes a history entry for every forward navigation and listens for
 * `popstate`, so Back/forward move between screens instead of leaving the app.
 *
 * - `navigate(screen)` goes to a new screen and pushes a history entry.
 * - `navigate(screen, { replace: true })` swaps the current entry instead of
 *   pushing (use when the screen you're leaving shouldn't be returned to, e.g.
 *   moving to Orders right after the cart was emptied).
 * - `goBack()` steps back through history, which restores the previous screen
 *   via `popstate`. Wire the in-app back buttons to this so they stay in sync
 *   with the browser's own Back button.
 */
export function useScreen<S extends string>(initial: S) {
  const [screen, setScreen] = useState<S>(
    () => (window.history.state?.screen as S | undefined) ?? initial,
  )

  useEffect(() => {
    // Seed the current history entry so Back has a screen to return to and a
    // reload can restore where we were.
    if (!window.history.state?.screen) {
      window.history.replaceState({ screen }, '')
    }

    const onPopState = (event: PopStateEvent) => {
      setScreen((event.state?.screen as S | undefined) ?? initial)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
    // Run once on mount; `screen`/`initial` are only read for the initial seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navigate = useCallback((next: S, opts?: { replace?: boolean }) => {
    setScreen((prev) => {
      if (next === prev && !opts?.replace) return prev
      if (opts?.replace) {
        window.history.replaceState({ screen: next }, '')
      } else {
        window.history.pushState({ screen: next }, '')
      }
      return next
    })
  }, [])

  const goBack = useCallback(() => {
    window.history.back()
  }, [])

  return { screen, navigate, goBack } as const
}

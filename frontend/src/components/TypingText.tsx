import { useEffect, useState } from 'react'

interface Props {
  text: string
  speed?: number
  className?: string
}

/** Reveals `text` one character at a time, then leaves a blinking caret. */
export default function TypingText({ text, speed = 55, className }: Props) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(0)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setCount(text.length)
      return
    }
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(id)
          return c
        }
        return c + 1
      })
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])

  const done = count >= text.length

  return (
    <span className={className} aria-label={text}>
      {text.slice(0, count)}
      <span className={done ? 'caret caret-rest' : 'caret'} aria-hidden="true" />
    </span>
  )
}

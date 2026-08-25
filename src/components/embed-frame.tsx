'use client'

import { useEffect } from 'react'

/**
 * Microfrontend handshake: reports the document height to the hosting parent
 * window so it can size the iframe without scrollbars. Lock the target origin
 * in production via NEXT_PUBLIC_EMBED_PARENT_ORIGIN (e.g. https://benebsworth.com).
 */
export default function EmbedFrame() {
  useEffect(() => {
    const targetOrigin = process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGIN || '*'
    const post = () => {
      if (window.parent === window) return
      window.parent.postMessage(
        { type: 'carbon:height', height: document.documentElement.scrollHeight },
        targetOrigin,
      )
    }
    post()
    const observer = new ResizeObserver(post)
    observer.observe(document.body)
    window.addEventListener('load', post)
    return () => {
      observer.disconnect()
      window.removeEventListener('load', post)
    }
  }, [])
  return null
}

import { useEffect, useRef, useState, type RefObject } from 'react'

interface UseLazyLoadOptions {
  threshold?: number
  rootMargin?: string
  triggerOnce?: boolean
}

export function useLazyLoad<T extends HTMLElement = HTMLDivElement>(
  options: UseLazyLoadOptions = {}
): [RefObject<T | null>, boolean] {
  const { threshold = 0.1, rootMargin = '100px', triggerOnce = true } = options
  const ref = useRef<T | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          if (triggerOnce) {
            observer.unobserve(el)
          }
        } else if (!triggerOnce) {
          setIsVisible(false)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, triggerOnce])

  return [ref, isVisible]
}

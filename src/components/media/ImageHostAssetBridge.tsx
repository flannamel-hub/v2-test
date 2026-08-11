import {
  ImageHostPublicConfig,
  normalizePublicImageHostConfig,
  rewriteManagedAssetUrl,
  rewriteManagedSrcSet,
} from '@/src/lib/media/rewriteManagedAssetUrl'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

const MEDIA_SELECTOR =
  'img[src], img[srcset], source[src], source[srcset], video[src], video[poster]'

function rewriteAttribute(
  element: Element,
  attribute: 'src' | 'srcset' | 'poster',
  config: ImageHostPublicConfig
) {
  const current = element.getAttribute(attribute)
  if (!current) return
  const next =
    attribute === 'srcset'
      ? rewriteManagedSrcSet(current, config)
      : rewriteManagedAssetUrl(current, config)
  if (next !== current) element.setAttribute(attribute, next)
}

function rewriteMediaElement(
  element: Element,
  config: ImageHostPublicConfig
) {
  const tag = element.tagName.toLowerCase()
  if (tag === 'img' || tag === 'source' || tag === 'video') {
    rewriteAttribute(element, 'src', config)
  }
  if (tag === 'img' || tag === 'source') {
    rewriteAttribute(element, 'srcset', config)
  }
  if (tag === 'video') {
    rewriteAttribute(element, 'poster', config)
  }
}

function rewriteDocumentMedia(config: ImageHostPublicConfig) {
  document
    .querySelectorAll(MEDIA_SELECTOR)
    .forEach((element) => rewriteMediaElement(element, config))
}

export function ImageHostAssetBridge() {
  const router = useRouter()

  useEffect(() => {
    let disposed = false
    let observer: MutationObserver | null = null

    const run = async () => {
      try {
        const response = await fetch('/api/image-host-config', {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (!response.ok) return
        const payload = await response.json()
        if (disposed || payload?.success !== true) return

        const config = normalizePublicImageHostConfig(payload)
        rewriteDocumentMedia(config)

        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
              rewriteMediaElement(mutation.target as Element, config)
              continue
            }
            mutation.addedNodes.forEach((node) => {
              if (!(node instanceof Element)) return
              if (node.matches(MEDIA_SELECTOR)) rewriteMediaElement(node, config)
              node
                .querySelectorAll(MEDIA_SELECTOR)
                .forEach((element) => rewriteMediaElement(element, config))
            })
          }
        })
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['src', 'srcset', 'poster'],
        })
      } catch (error) {
        console.warn(
          '[image-host] 客户端媒体兜底未执行：',
          error instanceof Error ? error.message : error
        )
      }
    }

    void run()
    return () => {
      disposed = true
      observer?.disconnect()
    }
  }, [router.asPath])

  return null
}

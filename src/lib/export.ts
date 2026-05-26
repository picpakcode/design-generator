'use client'

import { toPng, toJpeg } from 'html-to-image'

export async function exportAsImage(
  element: HTMLElement,
  filename: string,
  format: 'png' | 'jpeg' = 'png'
): Promise<void> {
  const options = {
    quality: 0.95,
    pixelRatio: 1,
  }

  let dataUrl: string

  if (format === 'jpeg') {
    dataUrl = await toJpeg(element, { ...options, backgroundColor: '#ffffff' })
  } else {
    dataUrl = await toPng(element, options)
  }

  const link = document.createElement('a')
  link.download = `${filename}.${format === 'jpeg' ? 'jpg' : 'png'}`
  link.href = dataUrl
  link.click()
}

'use client'

import { toPng, toJpeg, toBlob } from 'html-to-image'

export async function exportAsImage(
  element: HTMLElement,
  filename: string,
  format: 'png' | 'jpeg' = 'png'
): Promise<void> {
  const options = { quality: 0.95, pixelRatio: 1, cacheBust: true }
  const dataUrl = format === 'jpeg'
    ? await toJpeg(element, { ...options, backgroundColor: '#ffffff' })
    : await toPng(element, options)
  const link = document.createElement('a')
  link.download = `${filename}.${format === 'jpeg' ? 'jpg' : 'png'}`
  link.href = dataUrl
  link.click()
}

export async function copyToClipboard(element: HTMLElement): Promise<void> {
  const blob = await toBlob(element, { pixelRatio: 1, cacheBust: true })
  if (!blob) throw new Error('Failed to capture canvas')
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export async function exportAllAsZip(
  entries: { el: HTMLElement; filename: string; format: 'png' | 'jpeg' }[],
  zipName: string
): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const { el, filename, format } of entries) {
    const dataUrl = format === 'png'
      ? await toPng(el, { pixelRatio: 1, cacheBust: true })
      : await toJpeg(el, { quality: 0.92, pixelRatio: 1, backgroundColor: '#ffffff', cacheBust: true })
    zip.file(`${filename}.${format === 'jpeg' ? 'jpg' : 'png'}`, dataUrl.split(',')[1], { base64: true })
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${zipName}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

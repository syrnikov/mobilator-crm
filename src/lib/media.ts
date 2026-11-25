import { useCallback, useEffect, useRef, useState } from 'react'

/** Înregistrare audio cu MediaRecorder (iOS Safari → audio/mp4, Chrome → audio/webm). */
export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | undefined>(undefined)
  const resolver = useRef<((b: Blob) => void) | null>(null)

  const stopTracks = () => rec.current?.stream.getTracks().forEach((t) => t.stop())

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t))
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    chunks.current = []
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    r.onstop = () => {
      stopTracks()
      resolver.current?.(new Blob(chunks.current, { type: r.mimeType }))
    }
    r.start(1000)
    rec.current = r
    setSeconds(0)
    setRecording(true)
    timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
  }, [])

  const stop = useCallback(
    () =>
      new Promise<Blob>((resolve) => {
        resolver.current = resolve
        window.clearInterval(timer.current)
        setRecording(false)
        rec.current?.stop()
      }),
    [],
  )

  const cancel = useCallback(() => {
    resolver.current = null
    window.clearInterval(timer.current)
    setRecording(false)
    if (rec.current?.state === 'recording') rec.current.stop()
    stopTracks()
  }, [])

  useEffect(() => () => cancel(), [cancel])

  return { recording, seconds, start, stop, cancel }
}

/** Micșorează o poză (carte de vizită) la max 1600px și o întoarce ca data URL JPEG. */
export async function imageToDataUrl(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export const fmtSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Redimensionează o imagine (logo) la max `max` px, PNG transparent. */
export async function imageToPng(file: File, max = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Imagine invalidă'))), 'image/png'))
}

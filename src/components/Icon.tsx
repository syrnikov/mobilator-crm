// Set de iconițe liniare (stroke), desenate pentru grosimea tipografiei Mobilator.
const paths: Record<string, string> = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',
  stop: 'M7 7h10v10H7z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  phone: 'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  whatsapp:
    'M4 20l1.3-3.9A8 8 0 1 1 8 19.1L4 20zM9 8.5c0 3.5 2.5 6.5 6.5 6.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2L9.5 8.5',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  telegram: 'M21 4L3 11l6 2.5M21 4l-3 16-9-6.5M21 4L9 13.5V19l3-3.5',
  map: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  contact: 'M4 4h16v16H4zM12 8a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM7.5 17a4.5 4.5 0 0 1 9 0',
  share: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  camera: 'M4 7h4l2-3h4l2 3h4v13H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  check: 'M5 12l5 5 9-10',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6',
  chat: 'M4 5h16v11H9l-5 4z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15l1.6 1-2 3.4-1.8-.7a7 7 0 0 1-2.2 1.3L14.7 22h-4l-.3-2a7 7 0 0 1-2.2-1.3l-1.8.7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.6L4.4 10.9l2-3.4 1.8.7A7 7 0 0 1 10.4 7l.3-2h4l.3 2a7 7 0 0 1 2.2 1.3l1.8-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.8z',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  send: 'M4 12l16-8-6 16-2-7z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  cloudoff: 'M3 3l18 18M7 18h10a4 4 0 0 0 1.5-7.7A6 6 0 0 0 8 8.5M5.2 9.3A4.5 4.5 0 0 0 7 18',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 22, stroke = 1.8, fill }: { name: IconName; size?: number; stroke?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

/** Pânza de fierăstrău din logo — folosită ca indicator de încărcare. */
export function Saw({ size = 40 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}icons/blade.png`} width={size} height={size} className="saw" alt="" />
}

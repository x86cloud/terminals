import React from 'react'

export type IconName =
    | 'server'
    | 'plus'
    | 'edit'
    | 'trash'
    | 'close'
    | 'refresh'
    | 'up'
    | 'home'
    | 'folder'
    | 'file'
    | 'link'
    | 'upload'
    | 'download'
    | 'terminal'
    | 'plug'
    | 'search'
    | 'newFolder'
    | 'copy'
    | 'panel'
    | 'database'
    | 'table'
    | 'chevron-down'
    | 'chevron-right'
    | 'chevron-left'
    | 'chevrons-left'
    | 'chevrons-right'
    | 'play'
    | 'chart'
    | 'power'
    | 'clock'

const PATHS: Record<IconName, React.ReactNode> = {
    clock: (
        <>
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
        </>
    ),
    power: (
        <>
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
            <line x1="12" y1="2" x2="12" y2="12"/>
        </>
    ),
    server: (
        <>
            <rect x="3" y="4" width="18" height="7" rx="2"/>
            <rect x="3" y="13" width="18" height="7" rx="2"/>
            <path d="M7 7.5h.01M7 16.5h.01"/>
        </>
    ),
    plus: <path d="M12 5v14M5 12h14"/>,
    edit: <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z"/>,
    trash: (
        <>
            <path d="M4 7h16"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/>
            <path d="M9 7V4h6v3"/>
        </>
    ),
    close: <path d="M6 6l12 12M18 6L6 18"/>,
    refresh: (
        <>
            <path d="M20 11a8 8 0 1 0-2.3 6.1"/>
            <path d="M20 5v6h-6"/>
        </>
    ),
    up: <path d="M12 19V5M5 12l7-7 7 7"/>,
    home: <path d="M4 11l8-7 8 7v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8z"/>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>,
    file: (
        <>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/>
            <path d="M14 3v5h5"/>
        </>
    ),
    link: (
        <>
            <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/>
            <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>
        </>
    ),
    upload: (
        <>
            <path d="M12 16V4"/>
            <path d="M7 9l5-5 5 5"/>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
        </>
    ),
    download: (
        <>
            <path d="M12 4v12"/>
            <path d="M7 11l5 5 5-5"/>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
        </>
    ),
    terminal: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <path d="M7 9l3 3-3 3M13 15h4"/>
        </>
    ),
    plug: (
        <>
            <path d="M9 3v6M15 3v6"/>
            <path d="M6 9h12v3a6 6 0 0 1-12 0V9z"/>
            <path d="M12 18v3"/>
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="6"/>
            <path d="M20 20l-3.5-3.5"/>
        </>
    ),
    newFolder: (
        <>
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
            <path d="M12 11v5M9.5 13.5h5"/>
        </>
    ),
    copy: (
        <>
            <rect x="9" y="9" width="11" height="11" rx="2"/>
            <path d="M5 15V5a2 2 0 0 1 2-2h8"/>
        </>
    ),
    panel: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <path d="M14 4v16"/>
        </>
    ),
    database: (
        <>
            <ellipse cx="12" cy="5" rx="8" ry="3"/>
            <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/>
            <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>
        </>
    ),
    table: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <path d="M3 9h18M3 14h18M9 4v16M15 4v16"/>
        </>
    ),
    'chevron-down': <path d="M6 9l6 6 6-6"/>,
    'chevron-right': <path d="M9 6l6 6-6 6"/>,
    'chevron-left': <path d="M15 6l-6 6 6 6"/>,
    'chevrons-left': <path d="M11 6l-6 6 6 6M18 6l-6 6 6 6"/>,
    'chevrons-right': <path d="M6 6l6 6-6 6M13 6l6 6-6 6"/>,
    play: <path d="M7 4l13 8-13 8V4z"/>,
    chart: (
        <>
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>
        </>
    ),
}

interface Props {
    name: IconName
    size?: number
    className?: string
}

export default function Icon({name, size = 16, className}: Props) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{display: 'inline-block', verticalAlign: 'middle', flexShrink: 0}}
        >
            {PATHS[name]}
        </svg>
    )
}

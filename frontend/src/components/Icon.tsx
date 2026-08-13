import React from 'react'
import {
    Server,
    Plus,
    Edit,
    Trash2,
    X,
    RotateCw,
    ChevronUp,
    Home,
    Folder,
    FileText,
    Link as LinkIcon,
    Upload,
    Download,
    Terminal,
    Plug,
    Search,
    FolderPlus,
    Copy,
    Check,
    PanelLeft,
    Database,
    Table,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    ChevronsLeft,
    ChevronsRight,
    Play,
    BarChart2,
    Power,
    Clock,
    Settings,
    Box,
    Layers,
    Maximize2,
    Minimize2,
    Bot,
    User,
    Info,
    Paperclip,
    Shield,
    Square,
    Pin,
    Minus,
    LucideProps,
} from 'lucide-react'

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
    | 'check'
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
    | 'settings'
    | 'box'
    | 'layers'
    | 'maximize'
    | 'minimize'
    | 'bot'
    | 'user'
    | 'info'
    | 'paperclip'
    | 'shield'
    | 'stop'
    | 'square'
    | 'pin'
    | 'window-minimize'
    | 'window-maximize'
    | 'window-restore'

const ICON_MAP: Record<IconName, React.ComponentType<LucideProps>> = {
    server: Server,
    plus: Plus,
    edit: Edit,
    trash: Trash2,
    close: X,
    refresh: RotateCw,
    up: ChevronUp,
    home: Home,
    folder: Folder,
    file: FileText,
    link: LinkIcon,
    upload: Upload,
    download: Download,
    terminal: Terminal,
    plug: Plug,
    search: Search,
    newFolder: FolderPlus,
    copy: Copy,
    check: Check,
    panel: PanelLeft,
    database: Database,
    table: Table,
    'chevron-down': ChevronDown,
    'chevron-right': ChevronRight,
    'chevron-left': ChevronLeft,
    'chevrons-left': ChevronsLeft,
    'chevrons-right': ChevronsRight,
    play: Play,
    chart: BarChart2,
    power: Power,
    clock: Clock,
    settings: Settings,
    box: Box,
    layers: Layers,
    maximize: Maximize2,
    minimize: Minimize2,
    bot: Bot,
    user: User,
    info: Info,
    paperclip: Paperclip,
    shield: Shield,
    stop: Square,
    square: Square,
    pin: Pin,
    'window-minimize': Minus,
    'window-maximize': Square,
    'window-restore': Copy,
}

interface Props {
    name: IconName
    size?: number
    className?: string
}

export default function Icon({ name, size = 16, className }: Props) {
    const Component = ICON_MAP[name]
    if (!Component) {
        return null
    }

    return (
        <Component
            size={size}
            className={className}
            strokeWidth={1.8}
            style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
        />
    )
}

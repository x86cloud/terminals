import { API } from '@/api'
import { bytesToBase64, errorMessage } from '@/utils'

const DROP_UPLOAD_CHUNK_SIZE = 512 * 1024

interface FsEntry {
    isFile: boolean
    isDirectory: boolean
    name: string
}

interface FsFileEntry extends FsEntry {
    file: (success: (file: File) => void, error?: (err: DOMException) => void) => void
}

interface FsDirReader {
    readEntries: (
        success: (entries: FsEntry[]) => void,
        error?: (err: DOMException) => void
    ) => void
}

interface FsDirectoryEntry extends FsEntry {
    createReader: () => FsDirReader
}

export interface DropUploadFile {
    relativePath: string
    file: File
}

export interface DropUploadBatch {
    name: string
    directories: string[]
    files: DropUploadFile[]
    totalSize: number
}

export interface SyncExtractedDrop {
    entries: FsEntry[]
    fallbackFiles: File[]
}

/**
 * Extracts FileSystemEntry items synchronously during the `drop` event
 * before Chromium/WebView2 clears the DataTransferItemList across awaits.
 */
export function extractDroppedEntriesSync(dataTransfer: DataTransfer): SyncExtractedDrop {
    const entries: FsEntry[] = []
    const items = Array.from(dataTransfer.items || [])
    for (const item of items) {
        if (item.kind !== 'file') continue
        const entry = (item as any).webkitGetAsEntry?.() as FsEntry | null | undefined
        if (entry) {
            entries.push(entry)
        }
    }
    const fallbackFiles = entries.length === 0 ? Array.from(dataTransfer.files || []) : []
    return { entries, fallbackFiles }
}

function readEntryFile(entry: FsFileEntry): Promise<File> {
    return new Promise((resolve, reject) => {
        entry.file(resolve, (err) => reject(err || new Error(`读取文件失败: ${entry.name}`)))
    })
}

/**
 * Loops `readEntries` until empty because Chromium returns at most 100 entries per call.
 */
async function readAllDirectoryEntries(reader: FsDirReader): Promise<FsEntry[]> {
    const all: FsEntry[] = []
    while (true) {
        const batch = await new Promise<FsEntry[]>((resolve, reject) => {
            reader.readEntries(resolve, (err) => reject(err || new Error('读取目录失败')))
        })
        if (!batch.length) break
        all.push(...batch)
    }
    return all
}

async function walkDirectoryEntry(
    dirEntry: FsDirectoryEntry,
    relPrefix: string,
    directories: string[],
    files: DropUploadFile[]
): Promise<number> {
    directories.push(relPrefix)
    const children = await readAllDirectoryEntries(dirEntry.createReader())
    let subtotal = 0
    for (const child of children) {
        const childRel = `${relPrefix}/${child.name}`
        if (child.isDirectory) {
            subtotal += await walkDirectoryEntry(
                child as FsDirectoryEntry,
                childRel,
                directories,
                files
            )
        } else if (child.isFile) {
            const f = await readEntryFile(child as FsFileEntry)
            files.push({ relativePath: childRel, file: f })
            subtotal += f.size || 0
        }
    }
    return subtotal
}

/** Filters directories down to empty leaf directories so empty folders are created without redundant RPCs. */
function collectEmptyLeafDirectories(directories: string[], files: DropUploadFile[]): string[] {
    if (directories.length === 0) return []
    const nonEmptyParents = new Set<string>()
    const markParents = (relPath: string) => {
        let idx = relPath.lastIndexOf('/')
        while (idx > 0) {
            const parent = relPath.slice(0, idx)
            nonEmptyParents.add(parent)
            idx = parent.lastIndexOf('/')
        }
    }
    for (const d of directories) markParents(d)
    for (const f of files) markParents(f.relativePath)
    return directories.filter((d) => !nonEmptyParents.has(d))
}

export async function buildDropBatches(
    extracted: SyncExtractedDrop
): Promise<DropUploadBatch[]> {
    const batches: DropUploadBatch[] = []

    if (extracted.entries.length > 0) {
        for (const entry of extracted.entries) {
            if (entry.isDirectory) {
                const allDirs: string[] = []
                const files: DropUploadFile[] = []
                const totalSize = await walkDirectoryEntry(
                    entry as FsDirectoryEntry,
                    entry.name,
                    allDirs,
                    files
                )
                batches.push({
                    name: entry.name,
                    directories: collectEmptyLeafDirectories(allDirs, files),
                    files,
                    totalSize,
                })
            } else if (entry.isFile) {
                const f = await readEntryFile(entry as FsFileEntry)
                batches.push({
                    name: f.name,
                    directories: [],
                    files: [{ relativePath: f.name, file: f }],
                    totalSize: f.size || 0,
                })
            }
        }
        return batches
    }

    for (const file of extracted.fallbackFiles) {
        batches.push({
            name: file.name,
            directories: [],
            files: [{ relativePath: file.name, file }],
            totalSize: file.size || 0,
        })
    }
    return batches
}

async function streamSingleFileChunks(
    uploadId: string,
    relativePath: string,
    file: File
): Promise<void> {
    if (file.size === 0) {
        await API.dropUploadWriteChunk(uploadId, relativePath, '', true, true)
        return
    }
    for (let offset = 0; offset < file.size; offset += DROP_UPLOAD_CHUNK_SIZE) {
        const end = Math.min(offset + DROP_UPLOAD_CHUNK_SIZE, file.size)
        const buffer = await file.slice(offset, end).arrayBuffer()
        const isFirst = offset === 0
        const isLast = end >= file.size
        await API.dropUploadWriteChunk(
            uploadId,
            relativePath,
            bytesToBase64(buffer),
            isFirst,
            isLast
        )
    }
}

export async function streamDropBatches(
    sessionId: string,
    remoteDir: string,
    batches: DropUploadBatch[]
): Promise<{ canceled: boolean }> {
    for (const batch of batches) {
        const uploadId = await API.beginDropUpload(
            sessionId,
            remoteDir,
            batch.name,
            batch.totalSize
        )
        let uploadErr: string | null = null
        let wasCanceled = false
        try {
            for (const relDir of batch.directories) {
                await API.dropUploadMkdir(uploadId, relDir)
            }
            for (const item of batch.files) {
                await streamSingleFileChunks(uploadId, item.relativePath, item.file)
            }
        } catch (err) {
            const msg = errorMessage(err)
            if (msg.includes('已取消')) {
                wasCanceled = true
                uploadErr = '已取消'
            } else {
                uploadErr = msg
                throw err
            }
        } finally {
            await API.finishDropUpload(uploadId, uploadErr).catch(() => undefined)
        }
        if (wasCanceled) {
            return { canceled: true }
        }
    }
    return { canceled: false }
}


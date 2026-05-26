// Client-side Canto folder config — maps asset types to Canto album IDs

export interface CantoAlbum {
  id: string
  name: string
  size: number
}

export interface FolderConfig {
  iconsAlbumId:    string | null
  texturesAlbumId: string | null
  logosAlbumId:    string | null
}

export const EMPTY_CONFIG: FolderConfig = {
  iconsAlbumId: null, texturesAlbumId: null, logosAlbumId: null,
}

const STORAGE_KEY = 'canto-folder-config'

export function loadFolderConfig(): FolderConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return {
      iconsAlbumId:    raw.iconsAlbumId    ?? null,
      texturesAlbumId: raw.texturesAlbumId ?? null,
      logosAlbumId:    raw.logosAlbumId    ?? null,
    }
  } catch {
    return { ...EMPTY_CONFIG }
  }
}

export function saveFolderConfig(c: FolderConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
}

// Try to auto-match album names to asset types on first setup
export function autoMatchFolders(albums: CantoAlbum[]): Partial<FolderConfig> {
  const find = (kws: string[]) =>
    albums.find(a => kws.some(k => a.name.toLowerCase().includes(k)))?.id ?? null
  return {
    iconsAlbumId:    find(['icon']),
    texturesAlbumId: find(['texture', 'background', 'bg']),
    logosAlbumId:    find(['logo', 'brand']),
  }
}

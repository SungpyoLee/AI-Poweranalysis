/**
 * Equipment Library loader
 *
 * loadLibrary(type) is the single entry point for all library data.
 * Swap the import targets here to support user-custom libraries in the future:
 *   1. Load built-in JSON
 *   2. Merge with localStorage / remote user entries
 *   3. Return merged LibraryEntry[]
 */
import type { LibraryEntry } from '../types'

import transformersData from './transformers.json'
import cablesData       from './cables.json'
import breakersData     from './breakers.json'

export type LibraryType = 'transformer' | 'cable' | 'breaker'

export function loadLibrary(type: LibraryType): LibraryEntry[] {
  switch (type) {
    case 'transformer': return transformersData as LibraryEntry[]
    case 'cable':       return cablesData       as LibraryEntry[]
    case 'breaker':     return breakersData     as LibraryEntry[]
  }
}

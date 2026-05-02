import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Export a file that works on both web browsers and Capacitor (Android WebView).
 *
 * Web:    creates a Blob → object URL → invisible <a download> click.
 * Native: writes to the device cache dir via Filesystem, then opens the
 *         system share sheet so the user can save / send it.
 *
 * @param {string}  filename  – e.g. "payments_2026_5.csv"
 * @param {string}  content   – raw file content (text)
 * @param {string}  mimeType  – e.g. "text/csv"
 */
export async function exportFile(filename, content, mimeType = 'text/csv') {
  if (Capacitor.isNativePlatform()) {
    // ── Native (Android / iOS) ───────────────────────────────────────────
    const written = await Filesystem.writeFile({
      path: filename,
      data: btoa(unescape(encodeURIComponent(content))),  // UTF-8 → base64
      directory: Directory.Cache,
    })

    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: 'Save or share file',
    })
  } else {
    // ── Web browser ──────────────────────────────────────────────────────
    const blob = new Blob([content], { type: mimeType })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: filename,
    })
    a.click()
    URL.revokeObjectURL(url)
  }
}

/**
 * Export a binary file (for Documents page downloads).
 * Accepts a Blob instead of a string.
 */
export async function exportBlob(filename, blob) {
  if (Capacitor.isNativePlatform()) {
    // Convert blob → base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    })

    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: 'Save or share file',
    })
  } else {
    const url = URL.createObjectURL(blob)
    const a   = Object.assign(document.createElement('a'), {
      href: url,
      download: filename,
    })
    a.click()
    URL.revokeObjectURL(url)
  }
}

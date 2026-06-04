
/**
 * Logo Utility
 *
 * Fetches the company logo from /logo.png once and caches it as a base64
 * data URL. Using a data URL lets us embed the logo directly in printable
 * HTML blobs that are opened in a new browser window (where relative URLs
 * would not resolve correctly).
 */

let _cachedLogoDataUrl: string | null = null;
let _fetchPromise: Promise<string | null> | null = null;

/**
 * Loads the logo and returns a base64 data URL string, or null if the image
 * cannot be fetched (e.g. no logo file present).
 *
 * The result is cached after the first call so subsequent calls are instant.
 */
export async function loadLogoDataUrl(): Promise<string | null> {
  if (_cachedLogoDataUrl !== null) return _cachedLogoDataUrl;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const response = await fetch('/logo.png');
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();

  _cachedLogoDataUrl = await _fetchPromise;
  return _cachedLogoDataUrl;
}

/**
 * Returns the already-cached logo data URL synchronously.
 * Returns null if loadLogoDataUrl() has not been awaited yet.
 */
export function getLogoDataUrl(): string | null {
  return _cachedLogoDataUrl;
}

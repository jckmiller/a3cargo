/**
 * Persistence Layer
 * 
 * Provides an abstraction over localStorage for saving application state.
 * The async interface allows for easy migration to alternative storage backends
 * (IndexedDB, cloud storage, etc.) without changing calling code.
 */

/**
 * Persistence interface for key-value storage.
 * All methods return Promises to support async storage backends.
 */
type Persistence = {
  /**
   * Stores a value with the given key.
   * @param key - Storage key
   * @param value - Value to store (string)
   */
  setItem(key: string, value: string): Promise<void>;
  
  /**
   * Retrieves a value by key.
   * @param key - Storage key
   * @returns Stored value or null if not found
   */
  getItem(key: string): Promise<string | null>;
  
  /**
   * Removes a value by key.
   * @param key - Storage key
   */
  removeItem(key: string): Promise<void>;
  
  /**
   * Clears all stored data.
   */
  clear(): Promise<void>;
};

/**
 * Default persistence implementation using localStorage.
 * 
 * Used for storing:
 * - User preferences (theme, grid settings)
 * - Custom library items
 * - Any other application state that should persist between sessions
 * 
 * @example
 * // Save theme preference
 * await persistence.setItem('theme', 'dark');
 * 
 * // Load theme preference
 * const theme = await persistence.getItem('theme');
 * 
 * // Save complex data (serialize to JSON)
 * await persistence.setItem('userLibrary', JSON.stringify(libraryItems));
 */
export const persistence: Persistence = {
  async setItem(key, value) {
    localStorage.setItem(key, value);
  },
  
  async getItem(key) {
    return localStorage.getItem(key);
  },
  
  async removeItem(key) {
    localStorage.removeItem(key);
  },
  
  async clear() {
    localStorage.clear();
  },
};

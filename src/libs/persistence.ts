type Persistence = {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
};

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

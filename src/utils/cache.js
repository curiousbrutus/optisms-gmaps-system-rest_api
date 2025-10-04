// Simple in-memory cache with TTL
class Cache {
  constructor() {
    this.store = new Map();
  }

  set(key, value, ttl = 300000) { // default 5 minutes
    const expires = Date.now() + ttl;
    this.store.set(key, { value, expires });
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  // Clean expired entries periodically
  startCleanup(interval = 60000) { // every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.store.entries()) {
        if (now > item.expires) {
          this.store.delete(key);
        }
      }
    }, interval);
  }
}

export default new Cache();

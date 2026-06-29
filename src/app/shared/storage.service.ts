import { DOCUMENT, inject, Service } from '@angular/core';
import { LogService } from './log.service';
 
export type StorageType = 'LOCAL' | 'SESSION';
 
/**
 * Thin, SSR-safe wrapper over Web Storage. Values are JSON-serialised on write
 * and parsed on read; a value that isn't valid JSON is returned as the raw
 * string. Access goes through `document.defaultView`, so it degrades to a no-op
 * (rather than throwing) when there is no window.
 */
@Service()
export class StorageService {
  private readonly document = inject(DOCUMENT);
  private readonly log = inject(LogService);
 
  getItem<T>(key: string, storageType: StorageType = 'LOCAL'): T | string | null {
    const storage = this.resolve(storageType);
    if (!storage) {
      return null;
    }
 
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      this.log.error(`StorageService: failed to read "${key}"`, error);
      return null;
    }
 
    if (raw === null) {
      return null;
    }
 
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // value was a plain (non-JSON) string
    }
  }
 
  setItem(key: string, value: unknown, storageType: StorageType = 'LOCAL'): void {
    const storage = this.resolve(storageType);
    if (!storage) {
      return;
    }
    try {
        this.log.info("Storage Service: setting ", key,JSON.stringify(value))
      storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      this.log.error(`StorageService: failed to write "${key}"`, error);
    }
  }
 
  removeItem(key: string, storageType: StorageType = 'LOCAL'): void {
    this.resolve(storageType)?.removeItem(key);
  }
 
  getAndRemoveItem<T>(key: string, storageType: StorageType = 'LOCAL'): T | string | null {
    const value = this.getItem<T>(key, storageType);
    if (value !== null) {
      this.removeItem(key, storageType);
    }
    return value;
  }
 
  /** Resolves the requested Storage, or null when there is no window (SSR). */
  private resolve(storageType: StorageType): Storage | null {
    const view = this.document.defaultView;
    if (!view) {
      return null;
    }
    return storageType === 'LOCAL' ? view.localStorage : view.sessionStorage;
  }
}
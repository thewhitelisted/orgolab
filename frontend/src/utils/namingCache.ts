import { apiConfig, makeAuthenticatedRequest } from '../config/api';

interface CacheEntry {
  name: string | string[];
  timestamp: number;
  requestTime: number; // Track how long the original request took
}

interface QueuedRequest {
  smiles: string;
  timestamp: number;
  controller: AbortController;
  resolve: (value: string | string[]) => void;
  reject: (error: Error) => void;
}

class NamingCache {
  private cache = new Map<string, CacheEntry>();
  private requestQueue = new Map<string, QueuedRequest>();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly REQUEST_TIMEOUT = apiConfig.timeout; // Use configured timeout

  // Get cached name if available and not expired
  getCached(smiles: string): string | string[] | null {
    const entry = this.cache.get(smiles);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.cache.delete(smiles);
      return null;
    }
    
    return entry.name;
  }

  // Store name in cache
  setCached(smiles: string, name: string | string[], requestTime: number): void {
    // Clear old entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.cache.entries())
        .sort(([,a], [,b]) => a.timestamp - b.timestamp)[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(smiles, {
      name,
      timestamp: Date.now(),
      requestTime
    });
  }

  // Request name with simplified logic for pre-cached models
  async requestName(smiles: string): Promise<string | string[]> {
    // Check cache first
    const cached = this.getCached(smiles);
    if (cached !== null) {
      return cached;
    }

    // Cancel any existing request for the same SMILES
    const existingRequest = this.requestQueue.get(smiles);
    if (existingRequest) {
      existingRequest.controller.abort();
      this.requestQueue.delete(smiles);
    }

    // Create new request with standard timeout (models are pre-cached)
    const controller = new AbortController();
    const startTime = Date.now();

    return new Promise<string | string[]>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        smiles,
        timestamp: Date.now(),
        controller,
        resolve,
        reject
      };

      this.requestQueue.set(smiles, queuedRequest);

      // Set timeout for the request
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.REQUEST_TIMEOUT);

      // Make the actual request
      this.makeRequest(smiles, controller.signal)
        .then(result => {
          clearTimeout(timeoutId);
          this.requestQueue.delete(smiles);
          const requestTime = Date.now() - startTime;
          this.setCached(smiles, result, requestTime);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          this.requestQueue.delete(smiles);
          if (error.name === 'AbortError') {
            const isTimeout = Date.now() - startTime >= this.REQUEST_TIMEOUT * 0.95;
            reject(new Error(isTimeout ? 'Request timed out' : 'Request cancelled'));
          } else {
            reject(error);
          }
        });
    });
  }

  private async makeRequest(smiles: string, signal: AbortSignal): Promise<string | string[]> {
    const fragments = smiles.split('.').map(f => f.trim()).filter(Boolean);
    const body = { smiles: fragments.length === 1 ? fragments[0] : fragments };
    
    console.log('Sending request:', { smiles, fragments, body });
    
    try {
      const response = await makeAuthenticatedRequest('/api/name', body, signal);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Request failed:', { status: response.status, error: errorText, body });
        throw new Error(`Naming API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (Array.isArray(data.names)) {
        return fragments.length === 1 ? data.names[0] : data.names;
      } else {
        return 'No name found';
      }
    } catch (error) {
      console.error('Authenticated request failed:', error);
      throw error;
    }
  }

  // Cancel all pending requests
  cancelAllRequests(): void {
    for (const request of this.requestQueue.values()) {
      request.controller.abort();
    }
    this.requestQueue.clear();
  }

  // Simplified status for UI feedback
  getColdStartStatus() {
    return {
      isLikelyColdStart: false,  // No longer relevant with pre-cached models
      estimatedWaitTime: 2000,   // Fast response expected
      warmupInProgress: false,
      avgResponseTime: 2000,
      stoutLoaded: true,         // Always loaded
      stoutLoading: false,       // Never loading
      needsStoutLoading: false   // Never needed
    };
  }
}

// Export singleton instance
export const namingCache = new NamingCache(); 
import type { RangeResponse, Source } from 'pmtiles';

/**
 * PMTiles source that prefers HTTP range requests but survives hosts that ignore them.
 *
 * Range requests (206) let the browser fetch only the tiles on screen. Some static hosts
 * answer a range request with the whole file (200) instead. The stock FetchSource errors
 * on that and the map goes blank. Here, a 200 response is kept in memory and every later
 * read is sliced from it, so the worst case is downloading the ~3 MB file once.
 */
export class RangeOrWholeSource implements Source {
  private whole: Promise<ArrayBuffer> | null = null;

  constructor(private readonly url: string) {}

  getKey(): string {
    return this.url;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    if (this.whole) {
      const buf = await this.whole;
      return { data: buf.slice(offset, offset + length) };
    }

    const res = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
    });

    if (res.status === 206) {
      return { data: await res.arrayBuffer(), etag: res.headers.get('etag') ?? undefined };
    }
    if (res.status === 200) {
      // Host ignored the Range header and sent everything: keep it.
      this.whole = res.arrayBuffer();
      const buf = await this.whole;
      return { data: buf.slice(offset, offset + length) };
    }
    throw new Error(`Map tiles unavailable (HTTP ${res.status})`);
  }
}

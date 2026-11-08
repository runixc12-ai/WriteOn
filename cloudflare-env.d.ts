declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GEMINI_API_KEY?: string;
    ELEVENLABS_API_KEY?: string;
    GEMINI_MODEL?: string;
  }
}

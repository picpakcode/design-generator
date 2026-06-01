// Minimal hand-written types — regenerate with `supabase gen types` for full safety
export type Database = {
  public: {
    Tables: {
      design_sessions: {
        Row:    { user_id: string; state: unknown; updated_at: string }
        Insert: { user_id: string; state: unknown; updated_at?: string }
        Update: { user_id?: string; state?: unknown; updated_at?: string }
      }
      presets: {
        Row:    { id: string; user_id: string; name: string; state: unknown; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; name: string; state: unknown }
        Update: { name?: string; state?: unknown; updated_at?: string }
      }
      product_history: {
        Row:    { user_id: string; product_name: string; sku: string | null; last_used_at: string }
        Insert: { user_id: string; product_name: string; sku?: string | null; last_used_at?: string }
        Update: { sku?: string | null; last_used_at?: string }
      }
      assets: {
        Row:    { id: string; user_id: string; name: string; storage_path: string }
        Insert: { id: string; user_id: string; name: string; storage_path: string }
        Update: { name?: string; storage_path?: string }
      }
      projects: {
        Row:    { id: string; user_id: string; name: string; state: unknown; thumbnail_url: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; name: string; state: unknown; thumbnail_url?: string | null }
        Update: { name?: string; state?: unknown; thumbnail_url?: string | null; updated_at?: string }
      }
    }
  }
}

// Regenerate with: npx supabase gen types typescript --linked > src/types/database.ts
export type Database = {
  public: {
    // Supabase JS v2's GenericSchema requires these keys to be present for
    // typed queries to resolve correctly (otherwise all results become `never`).
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
    Tables: {
      design_sessions: {
        Row:    { user_id: string; state: unknown; updated_at: string }
        Insert: { user_id: string; state: unknown; updated_at?: string }
        Update: { user_id?: string; state?: unknown; updated_at?: string }
        Relationships: []
      }
      presets: {
        Row:    { id: string; user_id: string; name: string; state: unknown; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; name: string; state: unknown }
        Update: { name?: string; state?: unknown; updated_at?: string }
        Relationships: []
      }
      product_history: {
        Row:    { user_id: string; product_name: string; sku: string | null; last_used_at: string }
        Insert: { user_id: string; product_name: string; sku?: string | null; last_used_at?: string }
        Update: { sku?: string | null; last_used_at?: string }
        Relationships: []
      }
      assets: {
        Row:    { id: string; user_id: string; name: string; storage_path: string }
        Insert: { id: string; user_id: string; name: string; storage_path: string }
        Update: { name?: string; storage_path?: string }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          state: unknown
          project_type: 'amazon' | 'shopify' | null
          template_state: unknown | null
          thumbnail_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          state: unknown
          project_type?: 'amazon' | 'shopify' | null
          template_state?: unknown | null
          thumbnail_url?: string | null
        }
        Update: {
          name?: string
          state?: unknown
          project_type?: 'amazon' | 'shopify' | null
          template_state?: unknown | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_shares: {
        Row: {
          id: string
          project_id: string
          created_by: string
          token: string
          access_level: 'view' | 'edit'
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          created_by: string
          token?: string
          access_level?: 'view' | 'edit'
          is_public?: boolean
        }
        Update: { access_level?: 'view' | 'edit'; is_public?: boolean; updated_at?: string }
        Relationships: []
      }
      project_comments: {
        Row: {
          id: string
          project_id: string
          block_id: string
          parent_id: string | null
          share_token: string
          author_name: string
          author_type: 'owner' | 'reviewer'
          body: string
          created_at: string
          resolved_at: string | null
          resolved_by: string | null
          reactions: Record<string, string[]> | null
        }
        Insert: {
          id?: string
          project_id: string
          block_id: string
          parent_id?: string | null
          share_token: string
          author_name: string
          author_type?: 'owner' | 'reviewer'
          body: string
        }
        Update: {
          body?: string
          reactions?: Record<string, string[]> | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: []
      }
      block_approvals: {
        Row: {
          id: string
          project_id: string
          block_id: string
          share_token: string
          author_name: string
          status: 'approved' | 'changes_requested'
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          block_id: string
          share_token: string
          author_name: string
          status: 'approved' | 'changes_requested'
        }
        Update: { status?: 'approved' | 'changes_requested' }
        Relationships: []
      }
    }
  }
}

/**
 * P3-5: Supabase Diagram Repository Adapter
 *
 * Implements the DiagramRepository interface using Supabase as the backend.
 * Enables multi-user collaboration and cloud storage of diagram templates.
 *
 * Setup:
 *   1. Create a Supabase project at https://app.supabase.com
 *   2. Run the SQL below in the Supabase SQL editor to create the table:
 *
 *   CREATE TABLE diagram_templates (
 *     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     name        text NOT NULL,
 *     description text,
 *     created_at  timestamptz DEFAULT now(),
 *     updated_at  timestamptz DEFAULT now(),
 *     nodes_json  jsonb NOT NULL,
 *     edges_json  jsonb NOT NULL,
 *     user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE
 *   );
 *   -- Enable Row Level Security
 *   ALTER TABLE diagram_templates ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "Users can manage own diagrams"
 *     ON diagram_templates FOR ALL
 *     USING (auth.uid() = user_id);
 *
 *   3. Set env vars in .env.local:
 *     VITE_SUPABASE_URL=https://xxxx.supabase.co
 *     VITE_SUPABASE_ANON_KEY=eyJ...
 *
 *   4. In App.tsx, replace the default localStorage repository with:
 *     import { createSupabaseRepository } from './store/supabaseDiagramRepository'
 *     const repo = createSupabaseRepository()
 *     useDiagramLibraryStore.getState().setRepository(repo)
 */

import type { DiagramTemplate } from './useDiagramLibraryStore'

// ── Minimal Supabase client interface (avoid full SDK dependency) ─────────────
interface SupabaseClient {
  from: (table: string) => {
    select: (cols?: string) => Promise<{ data: any[]; error: any }>
    insert: (row: object) => Promise<{ error: any }>
    update: (patch: object) => { eq: (col: string, val: string) => Promise<{ error: any }> }
    delete: () => { eq: (col: string, val: string) => Promise<{ error: any }> }
    eq:     (col: string, val: string) => {
      single: () => Promise<{ data: any; error: any }>
    }
  }
}

// ── DiagramRepository interface (mirrors useDiagramLibraryStore) ──────────────
export interface DiagramRepository {
  save(t: DiagramTemplate): Promise<void>
  load(id: string): Promise<DiagramTemplate | null>
  delete(id: string): Promise<void>
  list(): Promise<DiagramTemplate[]>
}

// ── Factory ───────────────────────────────────────────────────────────────────
export function createSupabaseRepository(): DiagramRepository {
  const url  = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

  if (!url || !key) {
    console.warn(
      '[SupabaseRepository] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set. ' +
      'Falling back to no-op repository. Set env vars to enable cloud storage.'
    )
    return noopRepository()
  }

  // Dynamic import of @supabase/supabase-js (peer dependency, optional)
  let supabase: SupabaseClient | null = null

  const getClient = async (): Promise<SupabaseClient> => {
    if (supabase) return supabase
    try {
      const { createClient } = await import('@supabase/supabase-js' as any)
      supabase = createClient(url, key) as SupabaseClient
      return supabase
    } catch {
      throw new Error(
        'Supabase SDK not installed. Run: npm install @supabase/supabase-js'
      )
    }
  }

  return {
    async save(t: DiagramTemplate): Promise<void> {
      const sb = await getClient()
      const row = {
        id:          t.id,
        name:        t.name,
        description: t.description,
        updated_at:  t.updatedAt,
        nodes_json:  t.nodes,
        edges_json:  t.edges,
      }
      // Upsert: insert or update if id already exists
      const { error } = await sb.from('diagram_templates').insert(row)
      if (error) {
        // Try update if insert fails (duplicate key)
        await sb.from('diagram_templates')
          .update({ name: row.name, description: row.description, updated_at: row.updated_at, nodes_json: row.nodes_json, edges_json: row.edges_json })
          .eq('id', t.id)
      }
    },

    async load(id: string): Promise<DiagramTemplate | null> {
      const sb = await getClient()
      const { data, error } = await sb.from('diagram_templates').eq('id', id).single()
      if (error || !data) return null
      return rowToTemplate(data)
    },

    async delete(id: string): Promise<void> {
      const sb = await getClient()
      await sb.from('diagram_templates').delete().eq('id', id)
    },

    async list(): Promise<DiagramTemplate[]> {
      const sb = await getClient()
      const { data, error } = await sb.from('diagram_templates').select()
      if (error || !data) return []
      return data.map(rowToTemplate).sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    },
  }
}

function rowToTemplate(row: any): DiagramTemplate {
  return {
    id:          row.id,
    name:        row.name,
    description: row.description ?? '',
    createdAt:   row.created_at ?? new Date().toISOString(),
    updatedAt:   row.updated_at ?? new Date().toISOString(),
    nodes:       row.nodes_json ?? [],
    edges:       row.edges_json ?? [],
  }
}

function noopRepository(): DiagramRepository {
  return {
    async save()         { /* no-op */ },
    async load()         { return null },
    async delete()       { /* no-op */ },
    async list()         { return [] },
  }
}

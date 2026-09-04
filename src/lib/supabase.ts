/**
 * Cliente de Supabase para el frontend.
 * Crea el cliente con la clave pública (anon) desde import.meta.env.
 * Si faltan credenciales devuelve null; la app usa entonces la capa en memoria.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createSupabaseClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) return null
  return createClient(url, anonKey)
}

export const supabaseClient = createSupabaseClient()
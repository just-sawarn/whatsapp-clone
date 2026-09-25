/** Supabase/PostgREST errors are plain objects with a message in some versions; normalise both shapes. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof Error && error.message) return error.message
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message || fallback
  }
  return fallback
}

/**
 * PostgREST answers 404 / PGRST202 when an RPC does not exist, which in this app means the database has not
 * had the latest migrations applied. Say that, rather than surfacing a bare "not found".
 */
export function isMissingFunctionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    (typeof message === 'string' &&
      /could not find the function/i.test(message))
  )
}

export const MIGRATIONS_HINT =
  'The database is missing the latest updates. Apply the migrations in supabase/migrations (run "npx supabase db push"), then reload.'

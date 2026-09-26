import { createBrowserClient } from "@supabase/ssr";

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

let browserClient: SupabaseBrowserClient | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  return browserClient;
}

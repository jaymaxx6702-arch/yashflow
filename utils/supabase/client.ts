import { createBrowserClient } from "@supabase/ssr";

function makeBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

let browserClient: ReturnType<typeof makeBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = makeBrowserClient();
  return browserClient;
}

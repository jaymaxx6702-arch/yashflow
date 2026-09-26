import { createBrowserClient } from "@supabase/ssr";

// YashFlow intentionally uses dynamic Supabase rows across many modules.
// Keep the shared browser client unparameterized while reusing one instance
// so auth refreshes cannot race each other in the same tab.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: any = null;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  return browserClient;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // Paid module switches, "true" to ship. See src/app/modules.ts.
  readonly VITE_MODULE_FINANZAS?: string;
  readonly VITE_MODULE_REPORTES?: string;
  readonly VITE_MODULE_REDES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by vite.config.ts. Names the service worker cache per build.
declare const __BUILD_ID__: string;

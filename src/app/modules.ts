// Paid optional modules. Flags are resolved at BUILD time: Vite replaces the
// env accesses below with string literals, the `false` branches at the call
// sites fold away, and Rollup drops the module's lazy chunks from the build
// output. A client whose instance was built without a module never receives
// its code — there is nothing in the browser to unhide or unlock.
//
// Fail closed: an unset variable means the module is NOT shipped.
//
// This is the client-side half. The Redes server endpoint has its own
// non-VITE `MODULE_REDES` check (api/social-generate.ts), and the module's
// database tables/migrations simply are not provisioned for instances that
// did not buy it — RLS and absent tables guard the data, not the UI.
export const MODULE_FINANZAS = import.meta.env.VITE_MODULE_FINANZAS === "true";
export const MODULE_REPORTES = import.meta.env.VITE_MODULE_REPORTES === "true";
export const MODULE_REDES = import.meta.env.VITE_MODULE_REDES === "true";

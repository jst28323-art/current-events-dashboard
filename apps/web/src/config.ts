// Where the live API lives (D-027). Overridable at build time with VITE_API_BASE (e.g. a local `wrangler dev`).
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'https://ced-api.usgovfeed.workers.dev'

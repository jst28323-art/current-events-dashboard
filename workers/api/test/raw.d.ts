// Vite's ?raw imports (test/replay.test.ts bundles recorded fixtures as text: workerd tests have no host disk).
declare module '*?raw' {
  const text: string
  export default text
}

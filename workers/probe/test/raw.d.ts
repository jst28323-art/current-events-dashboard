// Vite's ?raw imports: the tests bundle recorded fixtures as text (workerd tests have no host disk). Fixtures are never
// edited (fixtures/README.md).
declare module '*?raw' {
  const text: string
  export default text
}

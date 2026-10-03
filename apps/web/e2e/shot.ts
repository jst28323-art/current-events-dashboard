// Screenshots with ONE narrow retry: only for the browser's own capture failure ("Unable to capture screenshot", a
// Chromium protocol error seen in 2 of 9 full e2e runs under load, 2026-10-03), never for an assertion: a wrong pixel
// still fails at once. Up to 2 retries, then the original error.
export async function shot(take: () => Promise<Buffer>): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await take()
    } catch (e) {
      if (attempt >= 2 || !/Unable to capture screenshot/i.test(String(e))) throw e
    }
  }
}

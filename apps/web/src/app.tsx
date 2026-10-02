// P1.2 shell: the header and an honest empty state. P1.6 turns this into the live feed.
export function App() {
  return (
    <div class="shell">
      <header class="toolbar"><h1>Current Events</h1></header>
      <main class="feed" aria-live="polite">
        <p class="empty">Live feed coming soon.</p>
      </main>
    </div>
  )
}

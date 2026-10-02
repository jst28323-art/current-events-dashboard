# Current Events Dashboard

A live feed of the United States federal government: what's on the House and Senate floor, what's being voted on and
how each member voted, the day's agendas, briefings and live events, presidential actions, and the Federal Register,
shown in one calm, macOS-style feed as things happen.

**Status: groundwork laid (2026-10-02). Nothing is live yet.** The placeholder page is at
<https://jst28323-art.github.io/current-events-dashboard/>. The plan is in [docs/ROADMAP.md](docs/ROADMAP.md).

## How it will work

- **Sources:** official government feeds first (House Clerk, Senate LIS, Federal Register, White House, Congress.gov,
  the House and Senate live caption streams). Faster unofficial, partisan or third-party sources are used only when
  labeled as such. Every item links to its primary source and shows how fresh it is.
- **Backbone:** a Cloudflare Worker on the free plan polls sources about every 20–60 seconds, removes duplicates, stores
  events and pushes them to open pages. The web app is a static page on GitHub Pages. See
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Phone:** a home-screen web app with notifications first; a native iOS app may come later.

## For contributors (human or agent)

Start with [HANDOFF.md](HANDOFF.md), then [CLAUDE.md](CLAUDE.md) and [MAP.md](MAP.md).

```
node scripts/ship_state.mjs     # where the tree stands, and the next step
node scripts/gate.mjs           # the full check suite; writes the stamp a push needs
git config core.hooksPath enforcement/git-hooks   # once per clone: secret scan, no force-push, gate stamp required to push main
```

Requires Node 22 or newer. The research behind the design is in [docs/research/](docs/research/).

## License

No license has been chosen: all rights reserved (see [docs/DECISIONS.md](docs/DECISIONS.md), D-014). Government data
shown by the app is generally in the public domain; third-party sources keep their own terms.

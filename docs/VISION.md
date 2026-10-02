# VISION — what the owner asked for

This page keeps the owner's original brief **verbatim** (the source of truth for intent) and then a short reading of it.
If a later doc seems to contradict the brief, the brief wins until the owner says otherwise (record the change in
[DECISIONS.md](DECISIONS.md)).

## The brief (owner, 2026-10-02, verbatim)

> Start a new repo called "current events dashboard". I want to build a live tracker for the united states government
> that allows me to follow what's going on right as it happens. I want to be able to see live transcripts and briefings
> on the senate, house, any press conferences, any time the president, cabinet member, or other member of the
> administration/executive branch is speaking, or anything else important that is going on. I want to see what's being
> voted on, who is voting for what, the agendas for the day, who's speaking, presidential actions, federal register,
> basically a live feed of every new event as soon as possible as it happens. i want to be able to access the feed from a
> free webpage (maybe github pages or something similar) that i can see from anywhere, not just on my home computer.
> eventually i would like it to be mobile friendly and also have an ios app as well so that i don't have to look on a
> computer, but that can come further down the line once the product is already working. other future work includes news
> from places other than the federal government, such as financial and world political news. investigate how best to
> build and curate such a feed, and build a framework for the repo so that the development can be continued further in
> future sessions. feel free to copy and adapt handoff/harness ideas from the aviary repo, as that procedure seems to be
> working pretty well. don't worry about actually building the product today, i just want you to focus on laying the
> groundwork so that the first real development session knows where to start and what to do and can easily begin
> building and have smooth handoffs to future sessions.
>
> feel free to ask me any questions you want at any point to clarify scope or anything else. you can use
> AskUserQuestion or just ask in prose in the chat, but if you do the latter please send a push notification so that i
> can answer as soon as possible as i might not be looking at the chat the whole time.
>
> in terms of design language/feel, seek to emulate apple's macos. i want it to be minimalistic, clean, and intuitive
> to use.

## The feature list (IDs used everywhere in this repo)

| id | feature | owner's words |
|---|---|---|
| F1 | Senate floor live: what is happening, live text | "live transcripts and briefings on the senate" |
| F2 | House floor live: what is happening, live text | "…the house" |
| F3 | Press conferences and briefings | "any press conferences" |
| F4 | President / cabinet / executive officials speaking | "any time the president, cabinet member, or other member of the administration/executive branch is speaking" |
| F5 | What is being voted on now | "what's being voted on" |
| F6 | Who voted how (member-level) | "who is voting for what" |
| F7 | Today's agendas: floor schedules, hearings, the President's schedule | "the agendas for the day" |
| F8 | Who is speaking now | "who's speaking" |
| F9 | Presidential actions (EOs, proclamations, memoranda, nominations, signings) | "presidential actions" |
| F10 | Federal Register, including Public Inspection | "federal register" |
| F11 | Other important federal events (bills, nominations, SCOTUS, CBO/GAO, major agency actions) | "anything else important that is going on" |
| F12 | Later: financial and world-political news | "other future work includes news from places other than the federal government" |

## Product principles (derived; the owner may amend)

1. **Fast and honest.** Show each item as soon as a legitimate source has it. Say where it came from and how fresh it
   is, and never present an inferred fact (an inferred speaker, an unofficial tally) as an official one.
2. **One feed, many sources.** Sources are plugins that emit one normalized event shape ([EVENT_MODEL.md](EVENT_MODEL.md)).
   Adding a source never requires touching the UI.
3. **Free first.** The owner's budget is $0 for now ([DECISIONS.md](DECISIONS.md) D-001). Every paid upgrade is a
   decision for the owner, priced in plain English.
4. **macOS calm.** Minimal, clean, intuitive ([DESIGN_LANGUAGE.md](DESIGN_LANGUAGE.md)). The feed is dense with
   information, and the chrome stays quiet.
5. **Web first, phone soon, iOS later.** A responsive PWA first; a native iOS app reads the same API later.

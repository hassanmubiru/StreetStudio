# StreetStudio — Product Strategy

This document is the **experience-centric** companion to the engineering-centric
[`VISION.md`](../VISION.md) and [`IMPLEMENTATION_REPORT.md`](IMPLEMENTATION_REPORT.md).
Where those describe *what* is built, this describes *why teams will love it* and
the workflow the product is designed around.

## Positioning

> **StreetStudio is the asynchronous operating system for software teams.**

Everything in the product supports that one sentence. Recording is a means, not
the end. Loom succeeded not because it recorded video, but because sharing ideas
asynchronously is faster than meetings. StreetStudio starts where Loom stops.

## The lifecycle (not "record → upload → share")

A recording is one step in a lifecycle, not the destination:

```
Capture → Explain → Collaborate → Track → Resolve → Archive
```

Concretely, the workflow is one continuous thread:

```
Developer clicks "New Explanation"  (not "Record Screen" — the mindset changes)
        ↓
Records — AI generates title, chapters, transcript, summary
        ↓
Someone comments → a thread starts
        ↓
Developer records a follow-up
        ↓
A merge request is linked
        ↓
The issue is closed
        ↓
The knowledge base updates
```

The unit of value is the **explanation and its resolution**, not the video file.

## Where StreetStudio beats Loom

Loom ends after the video. StreetStudio continues through the engineering
lifecycle teams actually need:

```
Problem → Recording → Discussion → Decision → Implementation → Verification → Archive
```

## Engineering memory (the knowledge graph)

Every recording becomes durable, searchable engineering knowledge. Search is not
"find a video" — it is querying institutional memory:

```
Search: "redis cluster"
→ Video @ 02:17
  Transcript excerpt
  Comments / thread
  Related PR
  Related Issue
  Related docs
```

This is why **knowledge is a first-class concern that evolves separately from
media** (see ADR-0010): media is bytes and renditions; knowledge is the graph of
transcripts, decisions, links, and reuse that outlives any single recording.

## The recorder developers love

Not "another recorder." A capture surface built for engineers:

- Screen + camera + microphone + system audio
- Region/zoom focus, cursor highlight, drawing, **secret blurring**
- Terminal mode and code-focus mode
- **Markers**: press `M` while recording to drop a typed marker —
  `Marker · API · Bug · Decision · TODO`. The creator tells the system what
  matters, so AI does not have to *guess* chapters — it confirms them.

## Engineering reviews (whole workflow, not just comments)

A recording links into the tools teams already use:

- GitHub PR, GitLab MR, Azure DevOps, Shortcut
- Jira, Linear
- Notion, Discord

The recording becomes a node in the delivery workflow, not a side artifact.

## Developer Mode (bug reports that are actually useful)

When recording a bug, capture the full context alongside the video:

- Logs, console, network, performance timings
- Browser info, OS
- StreetJS diagnostics

A bug "explanation" then carries everything an engineer needs to reproduce and
fix — no back-and-forth.

## Analytics about outcomes, not views

Views are vanity. Measure whether knowledge changed outcomes:

- Average watch completion
- Average response time (time-to-first-reply on a thread)
- Average issue resolution time
- Recordings that led to a merged PR
- Questions answered
- Knowledge reused (a recording resurfaced via search/links)

## Experience-based roadmap

Organized around experiences, not "more features":

- **Phase 1 — Explain & Discuss:** recording, sharing, comments, search.
- **Phase 2 — Team Knowledge:** knowledge base, engineering reviews, AI
  summaries, plugins.
- **Phase 3 — Organization Memory:** company-wide search, enterprise SSO, audit,
  compliance.
- **Phase 4 — Developer Intelligence:** knowledge graph, recommendations, code
  context, decision history.

Eventually StreetStudio stops competing only with Loom and competes with
**Loom + Confluence + Notion + Slab + Tettra + GitBook** at once — async
explanation *and* the living knowledge base it produces.

## Relationship with StreetJS (promotion-first)

StreetStudio stays independent and consumes **only** StreetJS public APIs/packages
— never internal source. The strongest long-term loop:

1. When StreetStudio needs a reusable capability, **promote it into StreetJS
   first**, release it, then consume the released package.
2. This keeps StreetJS improving naturally and proves its public APIs are
   sufficient for a real, scalable application.
3. StreetStudio never becomes a fork or extension — it keeps its own release
   cycle, roadmap, and community, serving as StreetJS's real-world proof of
   scalability and developer experience.

## What this does not change

The technical foundations already in place remain correct and are the enablers
of the above: AI stays optional and plugin-based (no vendor lock-in), storage is
pluggable, security is deny-by-default with audit logging, and the platform is
self-hostable and horizontally scalable. See [`ARCHITECTURE.md`](ARCHITECTURE.md).

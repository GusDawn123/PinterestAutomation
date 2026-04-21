# App Brief — Carmen's Pinterest Cockpit

A functional description of the app. No design direction — that's your call.

---

## 1. What the app does

An internal cockpit for **Carmen**, a solo creator running a Pinterest-driven blog business. It automates the pipeline from **keyword → blog post → Pinterest pins** with a human approval step at every stage.

Pipeline:
> Pick a trending keyword → Claude writes the blog draft → Ideogram generates the blog images → Carmen adds affiliate products → Carmen uploads the composed pin images → scheduler posts to Pinterest at optimal times.

Carmen doesn't write code. She opens the app once or twice a day, reviews what the agent produced, tweaks what needs tweaking, approves, and moves on.

---

## 2. The user

**Carmen** — one person, one account, no teams, no roles.

- Desktop 90% of the time, phone 10%
- Reviews ~2–5 blog posts per week, each with 3–6 pin variations
- Her goal per session: get through the approval queue without thinking too hard

This is a single-user app for repetitive creative work. Not a multi-tenant SaaS dashboard.

---

## 3. Pages

Two kinds of pages: **workspace pages** (reachable from the nav) and **approval pages** (the step-by-step pipeline).

### Workspace pages

| Route | Purpose | Key content |
| --- | --- | --- |
| `/` | Landing | One CTA that enters the app |
| `/dashboard` | Home base | "Start new blog post" primary action; stat cards (drafts pending, pins queued, last post); recent activity feed |
| `/approvals` | Queue hub | List of pending approvals grouped by kind (keyword, draft, images, affiliates, pins). Each row deep-links to the matching approval page. |
| `/calendar` | Scheduled pins | Upcoming + already-posted pins, grouped by date. Per-pin actions: reschedule, cancel. |
| `/analytics` | Performance | Board selector → slot recommendations (which day-of-week × hour performs best, with a score). Secondary: per-pin impressions/saves. |

### Approval pages (the core flow)

These are where Carmen spends most of her time. Each represents one stage of the pipeline.

| Route | Stage | What Carmen does on this page |
| --- | --- | --- |
| `/approvals/keyword` | 1 | Reviews 5–10 trending keywords (each shown with a score). Picks one. Writes a short creative brief. Submits. |
| `/approvals/draft` | 2 | Reviews the Claude-generated blog draft: headline, URL slug, body (Markdown), meta description (160 char limit, needs a counter), social description, category, tags. Edits inline. Approves. |
| `/approvals/images` | 3 | Reviews Ideogram-generated images (one per slot in the draft). Per slot: thumbnail, the prompt used, alt text (editable), a "Regenerate" button. Approves when all slots are good. |
| `/approvals/affiliates` | 4 | Per image slot: Claude-suggested search queries are shown. Carmen pastes affiliate product HTML rows for each slot. |
| `/approvals/pins` | 5 | Per pin: 3 copy variations to choose from; Carmen uploads the composed pin image she made externally; an auto-post toggle. |
| `/approvals/publish` | 6 | Final review before the post is pushed to WordPress as a draft. |

---

## 4. Key data shapes

When designing a page, check `lib/api.ts` and the imported types from `@pa/shared-types` for the exact fields on each approval payload. Don't invent fields.

High-level:

- **Keyword**: `{ keyword, score, category }`
- **BlogDraft**: `{ headline, urlSlug, bodyMarkdown, metaDescription, socialDescription, category, tags[], imageSlots[] }`
- **ImageSlot**: `{ position, promptHint, generatedImageUrl?, altTextSuggestion?, ideogramSeed? }`
- **AffiliateSlot**: `{ slotPosition, suggestedQueries[], productHtml? }`
- **ComposedPin**: `{ copyVariations[], chosenCopyIndex?, composedImageUrl?, needsManualCompose }`
- **ScheduledPin**: `{ id, pinterestBoardId, scheduledFor, status, copy, imageUrl }`
- **Analytics slot**: `{ dayOfWeek, hour, score, sampleSize }`

---

## 5. Behaviors and constraints

- **Auth**: deferred. Middleware is currently a pass-through. Design as if the user is already signed in.
- **Dark mode**: must be supported. Toggle is in the topbar.
- **Responsive**: must work down to 375px (phone).
- **Keyboard**: every action must be reachable without a mouse.
- **Loading states**: pages fetch from a backend. Every page needs a loading state and an empty state.
- **Errors**: API calls can fail; every page needs an error state (inline or toast).
- **Toasts**: already wired (sonner). Use for success/failure of async actions.

---

## 6. What stays the same

The backend, the API contract, the data shapes, the set of pages, and the pipeline stages are fixed. Those are not up for redesign. Everything visual and everything about page layout, navigation, interaction patterns, and component design is open.

---

## 7. How to run the frontend

```bash
pnpm install
pnpm --filter @pa/shared-types build
pnpm --filter @pa/carmen-web dev
```

Frontend runs at http://localhost:3000. The backend does not need to be running for visual work — API-dependent pages will show their error/empty states, which is useful.

Before handoff, this must succeed:

```bash
pnpm --filter @pa/carmen-web build
```

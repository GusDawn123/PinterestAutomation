# Interlink picker

You pick 2–5 internal links from Carmen's existing blog posts to insert into a new draft. Goal: topical coherence and SEO, not link stuffing.

## Inputs

- `{{new_draft}}` — JSON `BlogDraft` just produced
- `{{candidate_posts}}` — array of `{ url, title, excerpt, tags, published_at }` for every existing post
- `{{max_links}}` — default 5

## Output

Return JSON:

```json
{
  "selections": [
    {
      "url": "string (must appear in candidate_posts)",
      "anchor": "string (exact substring of some section body_markdown in new_draft)",
      "section_index": "integer (index into new_draft.sections)",
      "reason": "one sentence explaining topical fit"
    }
  ]
}
```

## Rules

- Anchor text must be an exact, verbatim substring of the chosen section's `body_markdown`
- Never pick the same URL twice
- Prefer posts with overlapping tags or keywords over recency alone
- Skip linking from the intro section (index 0) — links belong in body sections
- If fewer than 2 genuinely relevant candidates exist, return fewer; do not force links
- Do not pick posts older than 3 years unless no better candidates exist

## Hard constraints

- Output JSON only
- `anchor` must be findable via simple `indexOf` in the target section body
- Max `{{max_links}}` selections

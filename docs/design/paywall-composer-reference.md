# Paywall & Composer — Design Reference

Structural reference distilled from the app the user chose as the visual benchmark (screenshots live in the
2026-08-15 planning chat; if they get dropped into `docs/design/refs/`, read them directly for fidelity).

## Adaptation rules (non-negotiable)

- Clone **structure and rhythm only**. All copy, illustrations, and testimonial content are OURS.
- Signature blue — nudged more vibrant, kept light — replaces every lilac/purple accent.
- Serif display typeface scoped to the paywall screens only; rest of the app keeps its type.
- Copy targets the pain: forgetting, never missing what matters. Everyday-forgetting language only —
  no memory-condition or health-outcome claims (aligns with the legal medical-device callout).
- No invented proof. Award/review/testimonial slots are built but feature-flagged OFF until real ones exist.
- No new native modules (a native rebuild is already queued; don't add to it).

## Paywall structure (top → bottom)

1. Floating close (×), top-right.
2. Centered 3-line serif display hero on a soft tinted→white vertical gradient; small scattered dot
   accents; a brand shape (crescent/moon in the reference) bleeding off one edge.
3. Horizontally scrolling proof-card carousel — rounded light cards, neighbors peeking at both screen
   edges. **Flagged OFF at launch.**
4. Two pricing cards side by side:
   - Left, Monthly: thin light border, serif price, "Billed monthly" + bold "(No trial)".
   - Right, Annual: thick dark border, accent pill "MOST POPULAR" overlapping the top edge, serif price,
     "Billed yearly" + bold "(7 days trial)".
5. Centered serif affinity line (our pain-point version).
6. Testimonial blocks: centered warm-tone 5-star rows, serif quote, plain name. **Flagged OFF at launch.**
7. Feature table: serif section header; PRO / FREE letterspaced column heads; rows = feature name left,
   accent check circles; FREE column sparse; hairline dividers; rounded light container. Rows come from
   the REAL tier split (interval nagging premium, active-reminder cap, etc.).
8. Laurel-flanked badge row (ratings / editorial). **Flagged OFF at launch.**
9. Closing serif headline + line illustration (ours), outlined "Restore purchase" pill, one-line brand
   statement, "Terms of Service" / "Redeem Offer Code" text links (URLs from `lib/legalLinks.ts`).
10. Sticky full-width black pill CTA — "Start 7 days free trial" — persistent over all scroll positions,
    with a two-line honesty caption beneath (trial length, yearly price, cancel anytime).

## Composer structure

- Bottom sheet over the dimmed home screen, large top corner radius, autofocused text field with a quiet
  gray placeholder ("Type to begin" pattern), keyboard open.
- Chip row beneath the field: white pill chips with icons. In OUR flow chips display the **parsed**
  schedule (times, days, repeat) and tapping one opens the schedule grid — chips are never manual
  pre-assembly. Overflow "···" chip for the rest.
- Right-aligned black pill **Speak** button (waveform icon) hands off to the voice flow.
- Entry point: a keyboard affordance beside the home mic hero. The mic stays the hero.
- After parse: the sheet returns pre-filled — title + schedule chips populated; save generates spoken
  audio exactly like a voice take.

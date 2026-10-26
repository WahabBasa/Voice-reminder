/**
 * Home header fit (lib/headerFit.ts): English keeps the full pill; long
 * titles or labels compact the pill to crown + "Pro" instead of colliding.
 */
import {
  ADD_BUTTON_SIZE,
  HEADER_GAP,
  PILL_GAP,
  PILL_MAX_WIDTH,
  TITLE_MIN_SCALE,
  proPillMode,
} from "../../lib/headerFit";

// An iPhone 15-class row: 393 pt screen minus 2 × 20 pt padding.
const ROW = 353;

it("renders the full pill until everything is measured", () => {
  expect(proPillMode({ rowWidth: 0, titleWidth: 140, pillFullWidth: 95 })).toBe("full");
  expect(proPillMode({ rowWidth: ROW, titleWidth: 0, pillFullWidth: 95 })).toBe("full");
  expect(proPillMode({ rowWidth: ROW, titleWidth: 140, pillFullWidth: 0 })).toBe("full");
});

it("English: 'Reminders' + 'Get Pro' fit, full pill", () => {
  expect(proPillMode({ rowWidth: ROW, titleWidth: 145, pillFullWidth: 95 })).toBe("full");
});

it("a long title that would crowd the full pill compacts it", () => {
  // "Erinnerungen" / "Muistutukset" class widths with a "Pro holen" pill.
  expect(proPillMode({ rowWidth: ROW, titleWidth: 200, pillFullWidth: 105 })).toBe("compact");
});

it("the exact fit keeps the full pill; one point more compacts", () => {
  const pill = 100;
  const title = ROW - HEADER_GAP - pill - PILL_GAP - ADD_BUTTON_SIZE;
  expect(proPillMode({ rowWidth: ROW, titleWidth: title, pillFullWidth: pill })).toBe("full");
  expect(proPillMode({ rowWidth: ROW, titleWidth: title + 1, pillFullWidth: pill })).toBe("compact");
});

it("a label too long for the pill even shrunk compacts, whatever the title", () => {
  expect(proPillMode({ rowWidth: ROW, titleWidth: 60, pillFullWidth: PILL_MAX_WIDTH / 0.75 + 1 })).toBe("compact");
});

it("a wide label within the shrink range counts at the pill's max width", () => {
  // 170 natural (×0.85 = 144.5 ≤ 150) → capped at 150; 140 + 12 + 150 + 10 + 36 = 348 fits.
  expect(proPillMode({ rowWidth: ROW, titleWidth: 140, pillFullWidth: 170 })).toBe("full");
});

describe("stacking: the title on its own line", () => {
  const compact = 58; // crown + "Pro"

  it("stays side by side while the shrunk title fits next to the compact pill", () => {
    const title = (ROW - HEADER_GAP - compact - PILL_GAP - ADD_BUTTON_SIZE) / TITLE_MIN_SCALE;
    expect(proPillMode({ rowWidth: ROW, titleWidth: title, pillFullWidth: 120, pillCompactWidth: compact })).toBe(
      "compact"
    );
  });

  it("stacks when even the shrunk title and the compact pill don't fit", () => {
    expect(proPillMode({ rowWidth: ROW, titleWidth: 320, pillFullWidth: 120, pillCompactWidth: compact })).toBe(
      "stacked"
    );
  });

  it("never stacks before the compact pill is measured", () => {
    expect(proPillMode({ rowWidth: ROW, titleWidth: 320, pillFullWidth: 120 })).toBe("compact");
  });

  it("English never compacts or stacks", () => {
    expect(proPillMode({ rowWidth: ROW, titleWidth: 145, pillFullWidth: 95, pillCompactWidth: compact })).toBe("full");
  });
});

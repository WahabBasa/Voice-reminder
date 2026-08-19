import { crossedIntoClosed } from "../../lib/sheetClose";

describe("crossedIntoClosed", () => {
    it("does not fire on the reaction's first run, even at the closed position", () => {
        expect(crossedIntoClosed(null, -1)).toBe(false);
        expect(crossedIntoClosed(undefined, -1)).toBe(false);
    });

    it("does not fire while the sheet opens from closed", () => {
        expect(crossedIntoClosed(-1, -0.5)).toBe(false);
        expect(crossedIntoClosed(-0.5, 0)).toBe(false);
        expect(crossedIntoClosed(0, 1)).toBe(false);
    });

    it("fires when an animated close settles into the closed position", () => {
        expect(crossedIntoClosed(-0.2, -1)).toBe(true);
    });

    it("fires when a gesture snaps straight from open to closed (the silent path)", () => {
        // The dock-vanish bug: a fling that parks the sheet at closed emits no
        // library callbacks at all — the index stream is the only signal.
        expect(crossedIntoClosed(0, -1)).toBe(true);
    });

    it("fires only on the crossing, not while resting at closed", () => {
        expect(crossedIntoClosed(-1, -1)).toBe(false);
    });

    it("does not fire for dips that stay above the closed threshold", () => {
        expect(crossedIntoClosed(-0.5, -0.99)).toBe(false);
    });

    it("treats values within epsilon of -1 as closed", () => {
        expect(crossedIntoClosed(-0.5, -0.9995)).toBe(true);
    });
});

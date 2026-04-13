import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import { clampComparisonPosition } from "@/lib/imageCompare";

describe("BeforeAfterSlider", () => {
  it("clamps the comparison position to valid bounds", () => {
    expect(clampComparisonPosition(-10)).toBe(0);
    expect(clampComparisonPosition(35)).toBe(35);
    expect(clampComparisonPosition(120)).toBe(100);
  });

  it("renders the clipped before image without invalid widths", () => {
    render(<BeforeAfterSlider before="/before.png" after="/after.png" />);

    const beforeImage = screen.getByAltText("Antes");

    expect(beforeImage.parentElement).toHaveStyle({
      clipPath: "inset(0 50% 0 0)",
    });
  });
});

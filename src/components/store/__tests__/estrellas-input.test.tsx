import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EstrellasInput } from "../estrellas-input";

describe("EstrellasInput", () => {
  it("marca como llenas las estrellas hasta el valor actual", () => {
    render(<EstrellasInput value={3} onChange={() => {}} />);
    const botones = screen.getAllByRole("button");
    expect(botones).toHaveLength(5);
    expect(botones[0]).toHaveAttribute("aria-pressed", "true");
    expect(botones[2]).toHaveAttribute("aria-pressed", "true");
    expect(botones[3]).toHaveAttribute("aria-pressed", "false");
  });

  it("llama a onChange con el numero de estrella clickeada", () => {
    const onChange = vi.fn();
    render(<EstrellasInput value={2} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("4 estrellas"));

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("no llama a onChange cuando disabled", () => {
    const onChange = vi.fn();
    render(<EstrellasInput value={2} onChange={onChange} disabled />);

    fireEvent.click(screen.getByLabelText("4 estrellas"));

    expect(onChange).not.toHaveBeenCalled();
  });
});

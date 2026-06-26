import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Input } from "@/components/ui/input"

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input />)
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("renders with a placeholder", () => {
    render(<Input placeholder="Enter text..." />)
    expect(screen.getByPlaceholderText("Enter text...")).toBeInTheDocument()
  })

  it("renders with a controlled value", () => {
    render(<Input value="hello" onChange={() => {}} />)
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("hello")
  })

  it("calls onChange when user types", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Input onChange={onChange} />)
    const input = screen.getByRole("textbox")
    await user.type(input, "a")
    expect(onChange).toHaveBeenCalled()
  })

  it("disabled state prevents interaction", () => {
    render(<Input disabled />)
    const input = screen.getByRole("textbox")
    expect(input).toBeDisabled()
  })

  it("disabled state applies disabled classes", () => {
    render(<Input disabled />)
    const input = screen.getByRole("textbox")
    expect(input).toHaveClass("disabled:cursor-not-allowed", "disabled:opacity-50")
  })

  it("type=text is the default", () => {
    render(<Input />)
    const input = screen.getByRole("textbox") as HTMLInputElement
    // Default type attribute is "text" when type prop is omitted
    expect(input.type).toBe("text")
  })

  it("type=email is passed through", () => {
    render(<Input type="email" />)
    const input = document.querySelector("input") as HTMLInputElement
    expect(input.type).toBe("email")
  })

  it("type=password is passed through", () => {
    render(<Input type="password" />)
    const input = document.querySelector("input") as HTMLInputElement
    expect(input.type).toBe("password")
  })

  it("type=file is passed through", () => {
    render(<Input type="file" />)
    const input = document.querySelector("input") as HTMLInputElement
    expect(input.type).toBe("file")
  })

  it("custom className is merged with base classes", () => {
    render(<Input className="my-input-class" />)
    const input = screen.getByRole("textbox")
    expect(input).toHaveClass("my-input-class")
    // base class still present
    expect(input).toHaveClass("border-zinc-200")
  })

  it("has base structural classes", () => {
    render(<Input />)
    const input = screen.getByRole("textbox")
    expect(input).toHaveClass(
      "flex",
      "h-10",
      "w-full",
      "rounded-lg",
      "border",
      "border-zinc-200",
      "bg-white",
      "px-3",
      "py-2",
      "text-base"
    )
  })
})

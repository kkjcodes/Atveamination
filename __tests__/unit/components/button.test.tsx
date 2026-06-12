import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button } from "@/components/ui/button"

describe("Button", () => {
  it("renders with default variant classes", () => {
    render(<Button>Click me</Button>)
    const btn = screen.getByRole("button", { name: "Click me" })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveClass("bg-violet-600", "text-white")
  })

  it("renders with secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>)
    const btn = screen.getByRole("button", { name: "Secondary" })
    expect(btn).toHaveClass("bg-zinc-100", "text-zinc-900")
  })

  it("renders with outline variant", () => {
    render(<Button variant="outline">Outline</Button>)
    const btn = screen.getByRole("button", { name: "Outline" })
    expect(btn).toHaveClass("border", "border-zinc-200", "bg-white", "text-zinc-900")
  })

  it("renders with ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>)
    const btn = screen.getByRole("button", { name: "Ghost" })
    expect(btn).toHaveClass("text-zinc-700")
  })

  it("renders with destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>)
    const btn = screen.getByRole("button", { name: "Delete" })
    expect(btn).toHaveClass("bg-red-500", "text-white")
  })

  it("renders with sm size", () => {
    render(<Button size="sm">Small</Button>)
    const btn = screen.getByRole("button", { name: "Small" })
    expect(btn).toHaveClass("h-8", "px-3", "text-xs")
  })

  it("renders with default size", () => {
    render(<Button size="default">Default</Button>)
    const btn = screen.getByRole("button", { name: "Default" })
    expect(btn).toHaveClass("h-10", "px-4", "py-2")
  })

  it("renders with lg size", () => {
    render(<Button size="lg">Large</Button>)
    const btn = screen.getByRole("button", { name: "Large" })
    expect(btn).toHaveClass("h-12", "px-6", "text-base")
  })

  it("renders with icon size", () => {
    render(<Button size="icon" aria-label="icon-btn">X</Button>)
    const btn = screen.getByRole("button", { name: "icon-btn" })
    expect(btn).toHaveClass("h-10", "w-10")
  })

  it("disabled state has pointer-events-none and opacity-50 classes", () => {
    render(<Button disabled>Disabled</Button>)
    const btn = screen.getByRole("button", { name: "Disabled" })
    expect(btn).toBeDisabled()
    expect(btn).toHaveClass("disabled:pointer-events-none", "disabled:opacity-50")
  })

  it("calls onClick handler when clicked", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click me</Button>)
    await user.click(screen.getByRole("button", { name: "Click me" }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Disabled</Button>)
    await user.click(screen.getByRole("button", { name: "Disabled" }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("asChild renders child element instead of button", () => {
    render(
      <Button asChild>
        <a href="/test">Link button</a>
      </Button>
    )
    const link = screen.getByRole("link", { name: "Link button" })
    expect(link).toBeInTheDocument()
    expect(link.tagName).toBe("A")
    // no <button> in the DOM
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("custom className merges with variant classes", () => {
    render(<Button className="my-custom-class">Custom</Button>)
    const btn = screen.getByRole("button", { name: "Custom" })
    expect(btn).toHaveClass("my-custom-class")
    expect(btn).toHaveClass("bg-violet-600")
  })
})

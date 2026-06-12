import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Badge } from "@/components/ui/badge"

describe("Badge", () => {
  it("renders with default variant", () => {
    render(<Badge>Default</Badge>)
    const badge = screen.getByText("Default")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass("bg-violet-600", "text-white", "border-transparent")
  })

  it("renders with secondary variant", () => {
    render(<Badge variant="secondary">Secondary</Badge>)
    const badge = screen.getByText("Secondary")
    expect(badge).toHaveClass("bg-zinc-100", "text-zinc-900", "border-transparent")
  })

  it("renders with success variant", () => {
    render(<Badge variant="success">Success</Badge>)
    const badge = screen.getByText("Success")
    expect(badge).toHaveClass("bg-green-100", "text-green-800", "border-transparent")
  })

  it("renders with destructive variant", () => {
    render(<Badge variant="destructive">Error</Badge>)
    const badge = screen.getByText("Error")
    expect(badge).toHaveClass("bg-red-100", "text-red-800", "border-transparent")
  })

  it("renders with warning variant", () => {
    render(<Badge variant="warning">Warning</Badge>)
    const badge = screen.getByText("Warning")
    expect(badge).toHaveClass("bg-yellow-100", "text-yellow-800", "border-transparent")
  })

  it("renders with outline variant", () => {
    render(<Badge variant="outline">Outline</Badge>)
    const badge = screen.getByText("Outline")
    expect(badge).toHaveClass("text-zinc-700")
  })

  it("renders children correctly", () => {
    render(<Badge>Hello World</Badge>)
    expect(screen.getByText("Hello World")).toBeInTheDocument()
  })

  it("custom className is applied alongside variant classes", () => {
    render(<Badge className="my-extra-class">Custom</Badge>)
    const badge = screen.getByText("Custom")
    expect(badge).toHaveClass("my-extra-class")
    // default variant classes still present
    expect(badge).toHaveClass("bg-violet-600")
  })

  it("renders as a div element", () => {
    render(<Badge>Div badge</Badge>)
    const badge = screen.getByText("Div badge")
    expect(badge.tagName).toBe("DIV")
  })

  it("has base structural classes", () => {
    render(<Badge>Base</Badge>)
    const badge = screen.getByText("Base")
    expect(badge).toHaveClass(
      "inline-flex",
      "items-center",
      "rounded-full",
      "border",
      "px-2.5",
      "py-0.5",
      "text-xs",
      "font-semibold"
    )
  })
})

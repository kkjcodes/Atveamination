import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { Progress } from "@/components/ui/progress"

// The indicator is the inner div styled with the translateX transform.
// Radix UI's ProgressPrimitive.Indicator renders as a div inside the root.
function getIndicator(container: HTMLElement): HTMLElement {
  // The indicator is the first child of the progress root element.
  const root = container.querySelector('[role="progressbar"]') as HTMLElement
  return root.firstElementChild as HTMLElement
}

describe("Progress", () => {
  it("renders without crashing", () => {
    const { container } = render(<Progress value={50} />)
    const root = container.querySelector('[role="progressbar"]')
    expect(root).toBeInTheDocument()
  })

  it("value=50 sets indicator transform to translateX(-50%)", () => {
    const { container } = render(<Progress value={50} />)
    const indicator = getIndicator(container)
    expect(indicator.style.transform).toBe("translateX(-50%)")
  })

  it("value=0 sets indicator transform to translateX(-100%)", () => {
    const { container } = render(<Progress value={0} />)
    const indicator = getIndicator(container)
    expect(indicator.style.transform).toBe("translateX(-100%)")
  })

  it("value=100 sets indicator transform to translateX(-0%)", () => {
    const { container } = render(<Progress value={100} />)
    const indicator = getIndicator(container)
    expect(indicator.style.transform).toBe("translateX(-0%)")
  })

  it("value=25 sets indicator transform to translateX(-75%)", () => {
    const { container } = render(<Progress value={25} />)
    const indicator = getIndicator(container)
    expect(indicator.style.transform).toBe("translateX(-75%)")
  })

  it("value=75 sets indicator transform to translateX(-25%)", () => {
    const { container } = render(<Progress value={75} />)
    const indicator = getIndicator(container)
    expect(indicator.style.transform).toBe("translateX(-25%)")
  })

  it("omitting value defaults to translateX(-100%) (value || 0)", () => {
    const { container } = render(<Progress />)
    const indicator = getIndicator(container)
    expect(indicator.style.transform).toBe("translateX(-100%)")
  })

  it("custom className is applied to the root element", () => {
    const { container } = render(<Progress value={50} className="my-progress" />)
    const root = container.querySelector('[role="progressbar"]')
    expect(root).toHaveClass("my-progress")
  })

  it("root has base classes", () => {
    const { container } = render(<Progress value={50} />)
    const root = container.querySelector('[role="progressbar"]')
    expect(root).toHaveClass("relative", "h-2", "w-full", "overflow-hidden", "rounded-full", "bg-zinc-100")
  })

  it("indicator has violet background", () => {
    const { container } = render(<Progress value={50} />)
    const indicator = getIndicator(container)
    expect(indicator).toHaveClass("bg-violet-600")
  })
})

// test/setup.ts — runs before every test file (vite.config.ts → test.setupFiles).
//
// Tests run in jsdom, a fake browser that lacks a few APIs Mantine calls. These stand-ins do nothing
// useful; they only stop "x is not a function" errors. (List taken from Mantine's Vitest guide.)

import { vi } from 'vitest'

// Mantine reads computed styles for transitions; jsdom's version throws on pseudo-elements.
const { getComputedStyle } = window
window.getComputedStyle = (element) => getComputedStyle(element)

// Combobox / Select scroll the highlighted option into view.
window.HTMLElement.prototype.scrollIntoView = () => {}

// Colour scheme "auto" and responsive props ask the browser about media queries.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

if (!document.fonts) {
  Object.defineProperty(document, 'fonts', {
    writable: true,
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  })
}

// Used by components that measure themselves (ScrollArea, AppShell, Textarea autosize).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub

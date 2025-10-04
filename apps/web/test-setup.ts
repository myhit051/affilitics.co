import '@testing-library/jest-dom'

// Global test setup for Vitest
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Setup global fetch for testing
import { vi } from 'vitest'
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn()
}

// Mock File API for Node.js environment
class MockFile {
  constructor(public parts: (string | ArrayBuffer)[], public name: string, public options: { type: string }) {
    this.size = parts.reduce((acc, part) => acc + (typeof part === 'string' ? part.length : part.byteLength), 0)
  }
  size: number
  type: string = this.options.type
}

global.File = MockFile as any
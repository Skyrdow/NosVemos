import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Se ejecuta ANTES de evaluar cualquier import (vi.hoisted va al tope del
// archivo transformado), de modo que el data layer se resuelve en modo
// memoria antes de que cualquier test cargue src/lib/data.
vi.hoisted(() => {
  vi.stubEnv('VITE_USE_LOCAL', 'true')
})

import { dataLayer, MemoryDataLayer } from '../lib/data'

afterEach(() => {
  cleanup()
  // Aislar el data layer entre tests.
  if (dataLayer instanceof MemoryDataLayer) {
    dataLayer.reset()
  }
})
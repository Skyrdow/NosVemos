# AGENTS.md

Convenciones compartidas para los agentes de este proyecto (Builder y Evaluator).

## Stack

- React 18+ + TypeScript
- Build tool: Vite
- Testing: vitest + @testing-library/react

## Estructura

- `src/` — código fuente de la app
- `src/components/` — componentes de React
- `src/tests/` o `src/**/*.test.tsx` — tests co-locados junto al código

## Flujo de trabajo

1. El agente **builder** implementa la feature.
2. El agente **evaluator** revisa el código, corre build/lint/test y da feedback.
3. Si el evaluador pide cambios, el builder corrige y se re-evalúa hasta APPROVE.

## Checks obligatorios (antes de dar algo por terminado)

- `npm run build`   — typecheck + build de producción
- `npm run lint`    — lint
- `npm test`        — tests

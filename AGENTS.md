# AGENTS.md

Convenciones compartidas para los agentes de este proyecto (Builder y Evaluator).

## Stack

- React 18+ + TypeScript
- Build tool: Vite
- Testing: vitest + @testing-library/react
- DB: Supabase (Postgres + Realtime)
- Deploy: Vercel
- Spec del producto: `SPEC.md` (el documento rector de lo que se construye)

## Seguridad (IMPORTANTE)

- **Nunca** commitear `.env.local` ni claves.
- La clave `sb_publishable_*` (anon) va en `.env.local` — es pública por diseño.
- La clave `sb_secret_*` (service_role) JAMÁS en el repo ni en el frontend. Solo admin/servidor.

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

## YAGNI / minimalismo

- **YAGNI**: no agregues features, props, archivos ni abstracciones que todavía no se usan.
- Preferí la solución más simple que funcione; si alcanza con **un cambio de 1 línea**, ese es el correcto.
- No dejes código muerto: cortá lo que sobre aunque esté "bien escrito".
- Antes de escribir código nuevo, chequear repetida (duplicación) con algo existente que ya resuelva el caso.

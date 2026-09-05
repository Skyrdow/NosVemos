# NosVemos

App web para coordinar reuniones por disponibilidad: un único link, cada
participante marca sus horas libres y la app calcula en qué franjas **todos**
pueden reunirse.

- **Stack**: React 18 + TypeScript + Vite + react-router (SPA)
- **DB**: Supabase (Postgres + Realtime), accedida solo a través del data layer
- **Deploy**: Vercel
- **UI en español**, CSS plano (sin UI kit ni Tailwind)

## Requisitos

- Node 20+
- npm

## Puesta en marcha (modo local, sin Supabase)

La app funciona 100% con un data layer **en memoria** (gracias a
`VITE_USE_LOCAL=true`): ideal para desarrollo, preview y tests.

```bash
npm install
cp .env.example .env.local   # ya trae VITE_USE_LOCAL=true
npm run dev                  # http://localhost:5173
```

Los tests corren siempre contra la capa en memoria, sin credenciales:

```bash
npm test       # vitest
npm run lint   # typecheck + oxlint
npm run build  # typecheck + build de producción
```

## Integración con Supabase (paso a paso)

1. Creá un proyecto en [Supabase](https://supabase.com) (Plan Free alcanza).
2. En **SQL Editor** → New query, pegá el contenido de `supabase/schema.sql` y
   ejecutalo. Crea las tablas `meetings`, `participants`, `slots`, índices y las
   políticas RLS anónimas (MVP de link compartido). `meetings` incluye el rango
   horario de la reunión (`time_start_min`/`time_end_min`, default 08:00–20:00)
   y políticas `select`/`insert`/`update` (el creador puede ajustar las
   opciones). `slots` tiene `select`/`insert`/`delete` — el `delete` es
   necesario porque `saveSlots` reemplaza las reglas borrando las anteriores
   antes de insertar, y el "borrar disponibilidad de todos" (al cambiar
   opciones) hace un delete masivo.
3. En **Project Settings → API**, copiá:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY` (clave **publishable**, segura en el cliente)
4. Editá `.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu_publishable_key
   VITE_USE_LOCAL=false
   ```

   > Con `VITE_USE_LOCAL=true` la app usa la capa en memoria aunque haya
   > credenciales. Sin las tres variables también cae en memoria (modo seguro).

5. Reiniciá `npm run dev` (o `npm run build && npm run preview`).

### Realtime

La suscripción a cambios (opciones de la reunión, nuevos participantes y nuevos
aportes) se hace por Realtime: `meetings` (filtrados por reunión), `participants`
(filtrados por reunión) y `slots` se escuchan y la grilla se recalcula al vuelo.
En modo memoria, el data layer emite los mismos eventos localmente.

## Seguridad

- **Nunca** commitear `.env.local` ni claves (está en `.gitignore`).
- La clave `anon` (`sb_publishable_*`) es pública por diseño y puede ir en el cliente.
- La clave `service_role` (`sb_secret_*`) es solo admin/servidor: **no** va en el repo
  ni en el frontend.

## Estructura

```
src/
  lib/
    intersect.ts          # motor de intersección (TS puro, el más testeado)
    intersect.test.ts     # casos obligatorios + perf smoke
    rules.ts              # helpers puros reglas ↔ slots ↔ selección
    supabase.ts           # cliente Supabase desde import.meta.env
    utils.ts              # slugs, fechas, sessionStorage
    data/
      types.ts            # interfaz única del data layer
      memoryDataLayer.ts  # implementación en memoria (dev/tests)
      supabaseDataLayer.ts# implementación real (Postgres + Realtime)
      index.ts            # exporta la capa activa según env
  pages/
    CreateMeeting.tsx     # /  crear reunión
    JoinMeeting.tsx       # /m/:slug  unirse/participar
  components/
    MeetingOptions.tsx    # popup de opciones de la reunión (solo anfitrión)
    CalendarPreview.tsx   # mini grilla estática (opciones del creador)
    MonthCalendar.tsx     # calendario mensual (semanas + mes por popup)
    AvailabilityGrid.tsx  # input de disponibilidad (clic/arrastre)
    ResultGrid.tsx        # grilla agregada con colores y detalle
    NamePrompt.tsx        # pedido de nombre al participar
    __tests__/            # tests de componentes
  App.tsx                 # rutas de la SPA
  App.css / index.css     # estilos
supabase/schema.sql       # esquema SQL (aplicar una vez en Supabase)
vercel.json               # build + rewrites SPA (/m/:slug → index.html)
```

## Despliegue en Vercel

`vercel.json` ya configura todo: `npm run build` → `dist`, con rewrite SPA para
`/m/:slug`. En Vercel agregá las mismas variables de entorno de `.env.local`.

## Spec

El documento rector es `SPEC.md` (producto, motor, esquema y criterios de calidad).
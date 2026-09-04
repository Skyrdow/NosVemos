# SPEC — "NosVemos" (coordinación de reuniones por disponibilidad)

App web para que un grupo de personas organice una reunión en un horario.

- Cada persona ingresa **por su cuenta** sus horarios disponibles.
- La app calcula **rápido** las intersecciones: en qué franjas TODOS están libres,
  y muestra la grilla de disponibilidad parcial (cuántos/cuáles están libres por franja).
- Un **único link** permite sumar a todos los participantes.
- Soporta dos formas de agenda: **recurrente semanal** y **evento puntual (un día)**.

**Stack**: Frontend React 18 + Vite + TypeScript, desplegado en **Vercel**.
**DB**: **Supabase** (Postgres + Realtime). No hay otro servidor.

---

## 1. Páginas / flujo

### 1.1 Crear reunión — `/`
Formulario:
- Título de la reunión.
- Granularidad de la grilla: 15 / 30 / 60 min (default 30).
- Duración mínima sugerida (min).
- Tipo de agenda de la reunión: `weekly` | `one_off` | `hybrid` (si `hybrid`, cada
  participante elige cómo aportar; si `weekly`, solo recurrente; si `one_off`, solo fechas).
- Zona horaria (default la del navegador).
- Al crear → genera el slug (5-6 chars, sin mayúsculas/ambigüos, ej. `-` `0O1lI` fuera)
  y redirige a `/m/<slug>`. El creador es automáticamente el primer participante y
  también aporta disponibilidad.

### 1.2 Unirse/participar — `/m/:slug`
- Si el usuario no tiene un nombre guardado en la reunión, primero pide **nombre** y
  lo registra como participante.
- Muestra:
  a) la **grilla agregada** de disponibilidad de todos (si hay aportes),
  b) los **huecos donde todos están libres** (allFree),
  c) el **input** para que este participante marque sus franjas.
- Las ediciones de otros se reflejan en vivo (Supabase Realtime) y la grilla se
  recalcula al vuelo.

### 1.3 Vista de agenda por día
- Adicional a la semana recurrente, se puede elegir **día concreto** (mes/día) y marcar
  franjas para ese día puntual. La grilla de resultados colapsa/expande días puntuales.

---

## 2. Input de disponibilidad

Cada participante aporta **reglas de disponibilidad**.

```
tipo regla:
  weekly      → se repite todas las semanas mientras se necesite
                campos: day_of_week (0=Lun … 6=Dom), ranges[]
  one_off     → una fecha concreta
                campos: date (YYYY-MM-DD), ranges[]

ranges: array de [startMin, endMin] en minutos desde medianoche (0..1440, start<end).
```

- **Empalme**: si dentro de una misma regla dos rangos se tocan o solapan, se unen
  (`[9,12]` + `[11,14]` → `[9,14]`). Es responsabilidad del motor, no del UI.
- **Validación**: start<end, dentro de 0..1440, `day_of_week` en 0..6, `date` válida.
  Los rangos inválidos se rechazan antes de persistir.
- **Interacción en el UI**: grilla semana (7 días × franjas según granularidad) donde
  el usuario marca con clic/arrastre las horas libres. Un input adicional permite
  alternar "recurrente semanal" ↔ "día puntual" (fecha) según el `agenda_type`.

---

## 3. Motor de intersección (el corazón de la app)

Módulo **TS puro** `src/lib/intersect.ts` — sin DOM, sin Red, sin React.
Es la pieza más testeada del proyecto.

### API
```ts
type Rule =
  | { kind: 'weekly'; dayOfWeek: number; ranges: [number, number][] }
  | { kind: 'one_off'; date: string; ranges: [number, number][] }

interface ParticipantSlot { participantId: string; name: string; rules: Rule[] }

interface Cell {
  dayOfWeek?: number;      // para weekly
  date?: string;           // para one_off
  startMin: number; endMin: number;
  freeCount: number;       // cuántos participantes libres en esta franja
  freeParticipantIds: string[];
  allFree: boolean;        // freeCount === totalParticipantes
}

function computeIntersections(
  slots: ParticipantSlot[],
  granularityMin: number
): { cells: Cell[]; allFreeRanges: AllFreeRange[] }
```

`allFreeRanges`: rangos contiguos donde `allFree === true` (útil para colapsar a
"huecos donde todos pueden").

### Algoritmo (rápido con mucha gente)
1. Por cada participante y regla, barrer sus `ranges` y marcar buckets de
   `granularityMin` minutos en un mapa `(díaKey, bucketIdx) → set de participantIds`.
2. Antes de marcar, **unir rangos solapados/tocantes** de la misma regla (evita doble
   marca y es más rápido).
3. Recorrer el mapa ordenado y emitir celdas: `freeCount`, `freeParticipantIds`,
   `allFree`.
4. Comprimir celdas `allFree` contiguas en `allFreeRanges` (sumando días de por medio
   respetando la granularidad).

Complejidad objetivo: con `P ≤ 100` participantes y `S ≤ 20` rangos por persona,
el cálculo debe ser **< 50 ms** en el cliente. Tests de humo con 100 participantes.

### Tests obligatorios (vitest)
- Sin solapamiento → 0 celdas allFree.
- Solapamiento exacto de 2 personas → 1 hueco allFree correcto.
- Solapamiento parcial → solo la fracción compartida es allFree.
- 3+ personas, una falta en un hueco → allFree solo donde las 3 coinciden.
- Rangos que se tocan/solapan dentro de una regla → se unen (no doble marca).
- Híbrido weekly + one_off sobre la misma "persona".
- Perf smoke: 100 participantes, completo en < 50 ms (se marca con métrica, sin flake).

---

## 4. Datos (Supabase)

Esquema en `supabase/schema.sql` (aplicar en la consola de Supabase una vez):

```sql
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  timezone text not null default 'UTC',
  granularity_min int not null default 30,
  duration_hint_min int,
  agenda_type text not null default 'hybrid'
    check (agenda_type in ('weekly','one_off','hybrid')),
  creator_name text,
  created_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (meeting_id, name)
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  kind text not null check (kind in ('weekly','one_off')),
  day_of_week int check (day_of_week between 0 and 6),   -- solo si kind='weekly'
  date text,                                              -- solo si kind='one_off'
  ranges jsonb not null                                   -- [[startMin,endMin], ...]
);

create index meetings_slug_idx   on public.meetings(slug);
create index participants_meeting_idx on public.participants(meeting_id);
create index slots_participant_idx on public.slots(participant_id);

-- RLS: MVP de link compartido → lectura/escritura anónima sobre la reunión.
alter table public.meetings     enable row level security;
alter table public.participants enable row level security;
alter table public.slots        enable row level security;

create policy "anon leer reunión"    on public.meetings     for select using (true);
create policy "anon crear reunión"   on public.meetings     for insert with check (true);
create policy "anon leer participantes" on public.participants for select using (true);
create policy "anon insert participantes" on public.participants for insert with check (true);
create policy "anon leer slots"      on public.slots        for select using (true);
create policy "anon insert slots"    on public.slots        for insert with check (true);
```

- Slug único conflictivo → reintentar con otro slug.
- `meetings`/`slots` se escuchan con **Realtime** para actualizar la grilla en vivo.

### Cliente y data layer
- `src/lib/supabase.ts` crea el cliente con
  `import.meta.env.VITE_SUPABASE_URL` y `import.meta.env.VITE_SUPABASE_ANON_KEY`.
- **Data layer con interfaz única** en `src/lib/data/`:
  - `supabaseDataLayer.ts` — implementación real con @supabase/supabase-js (+ realtime).
  - `memoryDataLayer.ts` — implementación en memoria con la MISMA interfaz, para
    desarrollo, preview y **tests sin credenciales**.
  - `index.ts` exporta la capa activa según `VITE_USE_LOCAL=true` o presencia de env vars.
- La app DEBE funcionar completa en modo local (memory) para que los tests corran sin
  secretos. La integración con Supabase real se documenta en el README (paso a paso).
- **Nunca** commitear credenciales. `.env.example` con placeholders:
  `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`, `VITE_USE_LOCAL=true`.

---

## 5. Front (Vercel)

- React 18 + Vite + TS, **react-router** (`/` crear, `/m/:slug` participar).
- `vercel.json`:
  ```json
  { "buildCommand": "npm run build", "outputDirectory": "dist" }
  ```
  y rewrites para SPA: `/m/:slug` → `index.html`.
- **Español** en toda la UI.
- CSS plano o CSS Modules (mantener dependencias al mínimo; sin UI kit ni Tailwind).
- Grilla semanal responsive; clic/arrastre para marcar franjas; accesible (labels,
  teclado donde sea razonable).
- Estilo de colores de celdas: verde `allFree`, amarillo parcial, gris ninguno;
  tooltip/detalle con la lista de quiénes están libres al hacer clic.
- Intercambio de datos con Supabase solo vía el data layer (nunca fetch directo).

---

## 6. Calidad / checks (obligatorio para APPROVE)

- `npm run build` (typecheck + build prod) ✓
- `npm run lint` ✓
- `npm test` ✓ (motor de intersección 100% cubierto de casos + component tests:
  crear reunión, unirse con nombre, marcar franja, grilla con recuento, highlight allFree)

---

## 7. Fuera de alcance (MVP) — el builder no debe implementar esto

- Auth/login, roles, permisos finos, votación para elegir horario definitivo.
- Invitaciones por email, import/export .ics, notificaciones.
- Persistencia de "quién soy yo" entre dispositivos (cada dispositivo pide nombre).
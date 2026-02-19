# Refactor Log — Codeck

Este archivo registra el progreso y decisiones técnicas.

---

## Estado actual

Branch: refactor/daemon-runtime-gateway
Modo objetivo: local + gateway
Último bloque completado: MILESTONE 0 — PREPARACIÓN

---

## Iteraciones

### Iteración 1 — MILESTONE 0: PREPARACIÓN
**Fecha:** 2026-02-19

**Bloque:** Milestone 0 — Preparación del monorepo

**Cambios:**
- Creada estructura de directorios: `apps/{web,daemon,runtime,cli}`, `packages/{shared,protocols}`, `container/`
- Agregado `turbo.json` con tasks: build, dev, clean, test
- Configurado `workspaces` en root `package.json` apuntando a `apps/*` y `packages/*`
- Creado `packages/shared` con package.json, tsconfig.json e `index.ts` stub (`@codeck/shared`)
- Creado `packages/protocols` con package.json, tsconfig.json e `index.ts` stub (`@codeck/protocols`), con dependencia a `@codeck/shared`
- Creados package.json placeholder en cada app (`@codeck/web`, `@codeck/daemon`, `@codeck/runtime`, `@codeck/cli`)
- Ejecutado `npm install` para vincular los 6 workspaces

**Problemas:** Ninguno.

**Decisiones:**
- Las apps llevan package.json con build scripts de placeholder (echo) — se reemplazan en sus milestones respectivos
- `@codeck/protocols` depende de `@codeck/shared` desde el inicio (por diseño del plan)
- No se movió código existente; el root package.json sigue siendo el punto de entrada funcional y el build existente no se alteró
- Se verificó que `npm run build` (frontend + backend) sigue funcionando sin regresión
- `.gitignore` ya cubre `dist` y `.turbo` globalmente, no se necesitaron cambios

**Smoke test:** `npm run build` — OK (frontend vite + backend tsc + copy:templates)

---

(El agente debe agregar nuevas entradas por cada iteración)

# Codeck Refactor Agent — PROMPT

## Objetivo
Refactorizar el sistema a arquitectura monorepo con modos:
- local
- gateway

Mantener comportamiento actual intacto.

---

## REGLAS ESTRICTAS

1. Trabajar SOLO en rama:
   refactor/daemon-runtime-gateway

2. NO tocar main.
3. NO hacer merge.
4. Ejecutar SOLO un bloque por iteración.
5. Commits pequeños y frecuentes.
6. Push obligatorio al finalizar.
7. Si algo rompe build, arreglar antes de continuar.
8. No agregar nuevas features fuera del plan.
9. No implementar docker services.
10. No crear endpoints host.exec.

---

## Flujo por iteración

1. Leer:
   - docs/plans/REFRACTOR_PLAN_CODECK.md
   - docs/plans/REFRACTOR_LOG.md
   - este archivo

2. Determinar el siguiente bloque sin completar.

3. Actualizar sección "CURRENT NEXT BLOCK".

4. Implementar SOLO ese bloque.

5. Ejecutar smoke test básico.

6. Marcar checkbox correspondiente.

7. Actualizar REFRACTOR_LOG.md con:
   - qué se hizo
   - problemas encontrados
   - decisiones técnicas

8. Commit + Push.

9. Finalizar ejecución.

---

## Seguridad conceptual

- runtime ejecuta código arbitrario
- runtime nunca debe estar expuesto en gateway mode
- daemon es el único gateway
- rate limit y sesiones viven en daemon
- frontend nunca sabe el modo activo

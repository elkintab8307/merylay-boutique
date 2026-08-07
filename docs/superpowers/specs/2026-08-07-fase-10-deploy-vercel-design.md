# Fase 10 — Deploy en Vercel: Diseño

> Ver `CLAUDE.md` §8, §11, §12 punto 10 para los requisitos originales.

## Objetivo

Publicar MeryLay Boutique en producción sobre Vercel, con el repo de GitHub
conectado para despliegue continuo, y verificar que la tienda pública y las
rutas protegidas por rol (`/admin`, `/pos`, `/superadmin`) funcionan
correctamente en el entorno desplegado.

## Restricciones descubiertas (limitan el alcance del MCP de Vercel)

El MCP de Vercel disponible en este entorno **no** ofrece:
- Una herramienta para vincular un repo de GitHub a un proyecto (import).
  Solo existe `deploy_to_vercel`, que sube un árbol de archivos sueltos y
  crea un proyecto sin integración Git — no sirve para despliegue continuo
  en cada push.
- Una herramienta para crear/editar variables de entorno del proyecto.

Por lo tanto, la conexión GitHub↔Vercel y la carga de variables de entorno
las hace el dueño del proyecto manualmente en el dashboard de Vercel. El
MCP se usa para todo lo que sí soporta: verificar que el proyecto existe,
inspeccionar despliegues, logs de build, errores/logs de runtime, y
analítica.

## División de trabajo

### 1. Dueño del proyecto (dashboard de Vercel, una sola vez)

1. **Import Project** → selecciona el repo `elkintab8307/merylay-boutique`
   de GitHub. Vercel detecta Next.js automáticamente; no se requiere
   configuración de build custom (usa `next build` por defecto, ya
   confirmado en `package.json`).
2. Antes de desplegar, agrega estas variables de entorno para los entornos
   **Production** y **Preview**, copiando los valores desde `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Dispara el primer deploy (Vercel lo hace automáticamente al importar).

**No se agregan** `SUPERADMIN_EMAIL` / `SUPERADMIN_USERNAME` /
`SUPERADMIN_PASSWORD` a Vercel: verificado por grep (`src/` y `scripts/`)
que solo `scripts/seed-superadmin.ts` los lee, y ese script corre de forma
local/manual, no como parte de la app desplegada. El superadmin ya existe
en el proyecto de Supabase real desde la Fase 4 — no hace falta re-sembrar
nada en este paso.

### 2. Asistente (vía MCP de Vercel), una vez el proyecto exista

1. Confirmar que el proyecto aparece (`list_projects` / `get_project`).
2. Supervisar el primer deploy a producción:
   - Si falla, revisar `get_deployment_build_logs` e identificar la causa
     (típicamente: variable de entorno faltante o mal copiada).
   - Si el fallo es de código (no de configuración), corregirlo en este
     mismo repo, commitear, y dejar que el nuevo push re-dispare el deploy.
3. Verificar el resultado en vivo contra la URL real `*.vercel.app`:
   - La home pública (`/`) responde 200 y renderiza contenido de la tienda.
   - `/admin`, `/pos`, `/superadmin` responden con redirect (307/302) hacia
     `/login` cuando no hay sesión — mismo método de verificación por
     `curl`/`WebFetch` ya usado en fases anteriores, pero contra producción
     en vez de `localhost`.
4. Revisar `get_runtime_errors` / `get_runtime_logs` por errores que solo
   aparezcan en producción (p. ej. variables de entorno de servidor mal
   configuradas, que no siempre fallan en build time con Next.js).

### 3. Dominio

Se mantiene el subdominio gratuito `*.vercel.app` para esta fase, conforme
al roadmap (`CLAUDE.md` §11 punto 5). La vinculación de un dominio propio
queda fuera de alcance — es un paso posterior explícitamente separado en el
roadmap.

## Fuera de alcance

- No se escribe código nuevo en este repo salvo que la verificación en
  producción revele un problema no visible en local (p. ej. una ruta que
  dependa de una variable de entorno de servidor ausente). Si ocurre, se
  corrige como parte de esta misma fase, con su propio commit.
- No se configura dominio propio, ni analítica, ni protección por
  contraseña del deployment — no pedidos en el roadmap de esta fase.
- No se re-siembra el superadmin ni se tocan datos de Supabase — el
  proyecto de Supabase ya es el mismo usado en desarrollo (no hay entorno
  Supabase separado de producción en este proyecto).

## Testing / verificación

No aplica TDD (no hay lógica de negocio nueva). La verificación es
operacional: build exitoso en Vercel, rutas públicas accesibles, rutas
protegidas redirigiendo correctamente, sin errores de runtime nuevos tras
el despliegue.

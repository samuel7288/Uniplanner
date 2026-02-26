#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# create-github-issues.sh
# Crea en GitHub todos los issues del informe de seguridad y bugs detectados.
#
# REQUISITOS:
#   gh CLI instalado y autenticado: gh auth login
#
# USO:
#   chmod +x scripts/create-github-issues.sh
#   ./scripts/create-github-issues.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="samuel7288/Uniplanner"

create_issue() {
  local title="$1"
  local body="$2"
  local labels="$3"
  echo "  → $title"
  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    --label "$labels" 2>/dev/null || \
  gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Uniplanner — Security & Bug Audit Issue Creator"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Crear labels si no existen (ignora error si ya existen)
for label_def in \
  "security:CC0000:Vulnerabilidad de seguridad" \
  "bug:d73a4a:Error o comportamiento incorrecto" \
  "config:0075ca:Configuración o despliegue" \
  "performance:e4e669:Rendimiento" \
  "severity:critical:b60205:Severidad crítica" \
  "severity:high:e11d48:Severidad alta" \
  "severity:medium:fb8f00:Severidad media" \
  "severity:low:0e8a16:Severidad baja"
do
  IFS=':' read -r name color desc <<< "$label_def"
  gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" 2>/dev/null || true
done

echo ""
echo "▶ CRÍTICOS"
# ── Issue 1 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Security][Critical] Password reset token exposed in server logs" \
  "## Descripción
En \`backend/src/routes/auth.ts:237\`, cuando SMTP no está configurado el token de reseteo de contraseña se escribe directamente a stdout:
\`\`\`ts
process.stdout.write(\`[PASSWORD RESET TOKEN] \${rawToken}\n\`)
\`\`\`

## Impacto
- Tokens secretos visibles en logs de contenedores, CI/CD y paneles de Render.
- Un atacante con acceso a logs puede robar y usar el token antes que el usuario.

## Solución sugerida
Eliminar completamente la línea. Si se necesita en desarrollo, usar \`logger.debug()\` condicionado a \`NODE_ENV !== 'production'\` y nunca imprimir el token completo.

**Archivo:** \`backend/src/routes/auth.ts:237\`" \
  "security,severity:critical"

# ── Issue 2 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Security][Critical] JWT secret minimum length too weak (10 chars)" \
  "## Descripción
En \`backend/src/config/env.ts\`, los secretos JWT solo requieren mínimo 10 caracteres:
\`\`\`ts
JWT_ACCESS_SECRET: z.string().min(10),
JWT_REFRESH_SECRET: z.string().min(10),
\`\`\`

## Impacto
Secretos cortos son vulnerables a ataques de fuerza bruta. Los JWT podrían ser forjados si el secreto es débil.

## Solución sugerida
Cambiar a \`z.string().min(32)\` (256 bits mínimo). Regenerar secretos en Render con \`openssl rand -hex 32\`.

**Archivo:** \`backend/src/config/env.ts:10-11\`" \
  "security,severity:critical"

# ── Issue 3 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Security][Critical] Redis connection has no authentication" \
  "## Descripción
Redis se inicializa sin contraseña en \`backend/src/lib/queue.ts\` y en ambos docker-compose files. El puerto Redis está expuesto en desarrollo.

## Impacto
- Cualquier proceso en la misma red puede leer/escribir la cola de trabajos.
- Datos de notificaciones y sesiones accesibles sin autenticación.

## Solución sugerida
1. Añadir \`requirepass <password>\` en la config de Redis.
2. Pasar \`REDIS_PASSWORD\` como variable de entorno.
3. Inicializar ioredis: \`new Redis(env.REDIS_URL, { password: env.REDIS_PASSWORD })\`.

**Archivos:** \`backend/src/lib/queue.ts\`, \`docker-compose.yml\`, \`docker-compose.prod.yml\`" \
  "security,severity:critical"

# ── Issue 4 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Security][High] PostgreSQL port exposed to host in development" \
  "## Descripción
En \`docker-compose.yml\`, el puerto de PostgreSQL está publicado al host:
\`\`\`yaml
ports:
  - \"\${POSTGRES_PORT:-5432}:5432\"
\`\`\`

## Impacto
La base de datos es accesible desde cualquier proceso en el host, y potencialmente desde la red si el firewall no está configurado.

## Solución sugerida
Eliminar la sección \`ports\` del servicio postgres en docker-compose.yml para desarrollo. Solo los servicios internos de Docker necesitan acceso.

**Archivo:** \`docker-compose.yml:14\`" \
  "security,severity:high"

# ── Issue 5 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Security][High] Hardcoded default database credentials in version control" \
  "## Descripción
\`docker-compose.yml\` usa credenciales por defecto (postgres/postgres) y \`.env.example\` las expone en el repositorio:
\`\`\`yaml
POSTGRES_USER: postgres
POSTGRES_PASSWORD: postgres
\`\`\`

## Impacto
Credenciales débiles y predecibles. Cualquier persona con acceso al repo conoce las credenciales por defecto.

## Solución sugerida
1. Eliminar valores por defecto del docker-compose.yml — requerir variables explícitas.
2. Usar \`.env.local\` (en .gitignore) para desarrollo local.
3. Documentar en README cómo generar credenciales seguras.

**Archivos:** \`docker-compose.yml:10-12\`, \`.env.example\`" \
  "security,severity:high"

echo ""
echo "▶ ALTOS"

# ── Issue 6 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Security][High] No CSRF protection on state-changing endpoints" \
  "## Descripción
No existe ningún middleware CSRF en la aplicación. Todas las rutas POST/PUT/DELETE carecen de validación CSRF.

## Impacto
Un atacante puede hacer que un usuario autenticado realice acciones no deseadas desde un sitio malicioso (Cross-Site Request Forgery).

## Solución sugerida
Implementar protección CSRF mediante:
- Double-submit cookie pattern para endpoints de API
- O usar el header \`X-Requested-With: XMLHttpRequest\` como verificación
- Dado que se usan cookies HttpOnly, el patrón \`SameSite=Strict\` + verificar \`Origin\`/\`Referer\` headers es suficiente.

**Archivo:** \`backend/src/app.ts\`" \
  "security,severity:high"

# ── Issue 7 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Bug][High] Notifications route: /read-all conflicts with /:id/read" \
  "## Descripción
En \`backend/src/routes/notifications.ts:132\`, el endpoint \`PATCH /read-all\` está definido **después** de \`PATCH /:id/read\`. Express resuelve la ruta \`/read-all\` como \`/:id/read\` con \`id='read-all'\`, causando un error en lugar de marcar todas las notificaciones como leídas.

## Pasos para reproducir
1. Autenticarse
2. Hacer \`PATCH /api/notifications/read-all\`
3. Recibe 404 o error de Prisma (id inválido)

## Solución sugerida
Reordenar las rutas poniendo \`/read-all\` y \`/unread-count\` **antes** de \`/:id\` en el router.

**Archivo:** \`backend/src/routes/notifications.ts:132\`" \
  "bug,severity:high"

# ── Issue 8 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Security][High] Missing max-length validation on all text input fields" \
  "## Descripción
Los schemas Zod en las rutas no tienen límite de longitud máxima para campos de texto:
\`\`\`ts
title: z.string().min(1)         // sin .max()
description: z.string().optional() // sin .max()
\`\`\`

## Impacto
Un atacante puede enviar strings de varios MB, causando lentitud en búsquedas de texto completo, uso excesivo de almacenamiento y posibles errores OOM.

## Solución sugerida
Añadir \`.max()\` a todos los campos:
- Títulos: \`.max(255)\`
- Descripciones: \`.max(5000)\`
- Nombres de usuario: \`.max(100)\`

**Archivos:** \`backend/src/routes/assignments.ts\`, \`courses.ts\`, \`exams.ts\`, \`projects.ts\`" \
  "security,severity:high"

# ── Issue 9 ──────────────────────────────────────────────────────────────────
create_issue \
  "[Security][High] Email enumeration via 'Email already registered' error" \
  "## Descripción
En \`backend/src/routes/auth.ts:99\`, el endpoint de registro devuelve un mensaje diferente dependiendo de si el email existe:
\`\`\`ts
res.status(409).json({ message: 'Email already registered' })
\`\`\`

## Impacto
Permite a atacantes enumerar qué emails están registrados en la plataforma, facilitando ataques de phishing dirigido.

## Solución sugerida
Devolver siempre el mismo mensaje genérico, o simplemente devolver 200 sin indicar si el email existía. Añadir rate limiting específico al endpoint de registro.

**Archivo:** \`backend/src/routes/auth.ts:99\`" \
  "security,severity:high"

echo ""
echo "▶ MEDIOS"

# ── Issue 10 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Security][Medium] Missing Content-Security-Policy header" \
  "## Descripción
Helmet está configurado pero sin una política CSP explícita. La política por defecto puede ser demasiado permisiva.

## Impacto
Sin CSP, ataques XSS pueden ejecutar scripts arbitrarios, robar cookies y credenciales.

## Solución sugerida
\`\`\`ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [\"'self'\"],
      scriptSrc: [\"'self'\"],
      styleSrc: [\"'self'\", \"'unsafe-inline'\"],
      imgSrc: [\"'self'\", \"data:\", \"https:\"],
      connectSrc: [\"'self'\"],
      fontSrc: [\"'self'\"],
      objectSrc: [\"'none'\"],
      upgradeInsecureRequests: [],
    },
  },
}))
\`\`\`

**Archivo:** \`backend/src/app.ts:46\`" \
  "security,severity:medium"

# ── Issue 11 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Security][Medium] Swagger UI /api/docs accessible without authentication" \
  "## Descripción
La documentación Swagger en \`/api/docs\` es pública y no requiere autenticación. Expone toda la estructura de la API en producción.

## Impacto
Facilita el reconocimiento de la API por parte de atacantes: endpoints, schemas, parámetros, tipos de datos.

## Solución sugerida
En producción, desactivar o proteger \`/api/docs\` con autenticación básica o solo habilitarlo cuando \`NODE_ENV !== 'production'\`.

**Archivo:** \`backend/src/app.ts:54\`" \
  "security,severity:medium"

# ── Issue 12 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Security][Medium] Missing HSTS header in nginx production config" \
  "## Descripción
El archivo \`frontend/nginx.conf\` no incluye el header \`Strict-Transport-Security\`. Los navegadores no aplican HTTPS estrictamente.

## Impacto
Posibles ataques de downgrade SSL/TLS. Los navegadores no marcan el sitio como HTTPS-only.

## Solución sugerida
Añadir en \`nginx.conf\` dentro del bloque \`server\`:
\`\`\`nginx
add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;
\`\`\`

**Archivo:** \`frontend/nginx.conf\`" \
  "security,severity:medium"

# ── Issue 13 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Security][Medium] Missing security audit logging for auth events" \
  "## Descripción
No existe registro de auditoría para eventos de seguridad: intentos de login fallidos, cambios de contraseña, tokens refresh, etc.

## Impacto
Imposible detectar ataques de fuerza bruta, accesos no autorizados o actividad sospechosa en producción.

## Solución sugerida
Añadir logging estructurado (pino) para:
- Login exitoso/fallido (con IP y timestamp)
- Logout
- Cambio de contraseña / reset
- Token refresh
- Errores de autenticación repetidos

**Archivo:** \`backend/src/routes/auth.ts\`" \
  "security,severity:medium"

# ── Issue 14 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Security][Medium] Raw SQL in search endpoint needs input length limit" \
  "## Descripción
En \`backend/src/routes/search.ts\`, se usa \`prisma.\$queryRaw\` con \`websearch_to_tsquery\` y el input del usuario. Aunque Prisma parametriza la query, no hay límite de longitud en el parámetro de búsqueda.

## Solución sugerida
Añadir validación explícita al schema:
\`\`\`ts
q: z.string().min(1).max(500).trim()
\`\`\`

**Archivo:** \`backend/src/routes/search.ts:88-130\`" \
  "security,severity:medium"

echo ""
echo "▶ BAJOS"

# ── Issue 15 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Config][Low] Inconsistent pagination limits across routes" \
  "## Descripción
Distintas rutas usan límites de paginación diferentes:
- assignments, exams, projects, search: \`.max(50)\`
- notifications: \`.max(100)\`

## Solución sugerida
Estandarizar a \`.max(50)\` en todas las rutas o extraer a una constante global \`MAX_PAGE_SIZE = 50\`.

**Archivos:** \`backend/src/routes/\`" \
  "config,severity:low"

# ── Issue 16 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Bug][Low] grade-projection endpoint: missing validation on 'target' query param" \
  "## Descripción
En \`backend/src/routes/courses.ts:285\`, el parámetro \`target\` se convierte a número pero no tiene validación de rango:
\`\`\`ts
target: z.coerce.number().default(7)
\`\`\`

Un usuario puede pasar valores negativos, 0 o 1000, produciendo proyecciones absurdas.

## Solución sugerida
\`\`\`ts
target: z.coerce.number().min(0).max(10).default(7)
\`\`\`

**Archivo:** \`backend/src/routes/courses.ts:285\`" \
  "bug,severity:low"

# ── Issue 17 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Config][Low] Redis retry strategy may cause slowdowns with maxRetriesPerRequest: null" \
  "## Descripción
En \`backend/src/lib/queue.ts\`, la configuración de BullMQ/ioredis usa \`maxRetriesPerRequest: null\` que permite reintentos infinitos, bloqueando workers indefinidamente en caso de Redis inaccesible.

## Solución sugerida
Limitar reintentos:
\`\`\`ts
maxRetriesPerRequest: 3,
retryStrategy: (times) => Math.min(times * 100, 2000),
\`\`\`

**Archivo:** \`backend/src/lib/queue.ts\`" \
  "config,severity:low"

# ── Issue 18 ─────────────────────────────────────────────────────────────────
create_issue \
  "[Config][Low] render.yaml: FRONTEND_URL and BACKEND_INTERNAL_URL require manual setup post-deploy" \
  "## Descripción
Las variables \`FRONTEND_URL\` y \`BACKEND_INTERNAL_URL\` en \`render.yaml\` están marcadas \`sync: false\`, requiriendo configuración manual post-deploy. Esto es propenso a errores y no está automatizado.

## Solución sugerida
Documentar el proceso en el README con pasos exactos. Evaluar usar Render's \`fromService\` para la URL pública cuando esté disponible.

**Archivo:** \`render.yaml:43,64\`" \
  "config,severity:low"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Issues creados: 18"
echo "  Ver en: https://github.com/$REPO/issues"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

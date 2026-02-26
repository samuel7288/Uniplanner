#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# create-github-issues.sh
# Crea en GitHub todos los issues del informe de seguridad y bugs detectados.
#
# REQUISITOS:
#   - GitHub CLI (gh): https://cli.github.com
#   - Autenticado via: gh auth login
#     O pasar token:   GITHUB_TOKEN=ghp_xxxx ./scripts/create-github-issues.sh
#
# USO:
#   ./scripts/create-github-issues.sh
#   GITHUB_TOKEN=ghp_xxxxxxxxxxxx ./scripts/create-github-issues.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="samuel7288/Uniplanner"

# ── Verificar gh CLI instalado ────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
  echo "✗ GitHub CLI (gh) no está instalado."
  echo "  Descárgalo en: https://cli.github.com"
  exit 1
fi

# ── Verificar autenticación ───────────────────────────────────────────────────
echo ""
echo "Verificando autenticación..."
USER_LOGIN=$(gh api user --jq '.login' 2>/dev/null || true)

if [ -z "$USER_LOGIN" ]; then
  echo "✗ No autenticado."
  echo "  Opción A: gh auth login"
  echo "  Opción B: GITHUB_TOKEN=ghp_xxxx ./scripts/create-github-issues.sh"
  exit 1
fi
echo "✓ Autenticado como: $USER_LOGIN"

# ── Función para crear issue ──────────────────────────────────────────────────
create_issue() {
  local title="$1"
  local body="$2"
  local labels="$3"

  echo "  → $title"

  # Convertir "label1,label2" en múltiples flags --label
  local label_args=()
  IFS=',' read -ra label_list <<< "$labels"
  for lbl in "${label_list[@]}"; do
    label_args+=(--label "$lbl")
  done

  local url
  if url=$(gh issue create \
    --repo "$REPO" \
    --title "$title" \
    --body "$body" \
    "${label_args[@]}" 2>&1); then
    echo "    ✓ $url"
  else
    echo "    ⚠ Error: $url"
  fi
}

# ── Función para crear label ──────────────────────────────────────────────────
create_label() {
  local name="$1"
  local color="$2"
  local desc="$3"

  gh label create "$name" \
    --repo "$REPO" \
    --color "$color" \
    --description "$desc" \
    --force 2>/dev/null || true
}

# ── Crear labels ──────────────────────────────────────────────────────────────
echo ""
echo "Creando labels..."
create_label "security"          "CC0000" "Vulnerabilidad de seguridad"
create_label "bug"               "d73a4a" "Error o comportamiento incorrecto"
create_label "config"            "0075ca" "Configuracion o despliegue"
create_label "performance"       "e4e669" "Rendimiento"
create_label "severity:critical" "b60205" "Severidad critica"
create_label "severity:high"     "e11d48" "Severidad alta"
create_label "severity:medium"   "fb8f00" "Severidad media"
create_label "severity:low"      "0e8a16" "Severidad baja"
echo "✓ Labels listos"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Uniplanner — Security & Bug Audit Issues"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ CRITICOS"
# ─────────────────────────────────────────────────────────────────────────────

create_issue \
  "[Security][Critical] Password reset token exposed in server logs" \
  "## Descripcion
En \`backend/src/routes/auth.ts:237\`, cuando SMTP no esta configurado el token de reseteo se escribe a stdout:

\`\`\`ts
process.stdout.write(\`[PASSWORD RESET TOKEN] \${rawToken}\n\`)
\`\`\`

## Impacto
- Tokens secretos visibles en logs de contenedores, CI/CD y paneles de Render.
- Un atacante con acceso a logs puede robar el token y resetear la contrasena de cualquier usuario.

## Solucion sugerida
Eliminar la linea. Si se requiere en desarrollo, usar logger condicionado a \`NODE_ENV !== 'production'\` y nunca imprimir el token completo.

**Archivo:** \`backend/src/routes/auth.ts:237\`" \
  "security,severity:critical"

create_issue \
  "[Security][Critical] JWT secret minimum length too weak (10 chars)" \
  "## Descripcion
Los secretos JWT solo requieren minimo 10 caracteres:

\`\`\`ts
JWT_ACCESS_SECRET: z.string().min(10),
JWT_REFRESH_SECRET: z.string().min(10),
\`\`\`

## Impacto
Secretos cortos son vulnerables a ataques de fuerza bruta. Los JWT podrian ser forjados si el secreto es debil.

## Solucion sugerida
Cambiar a \`z.string().min(32)\` (256 bits). Regenerar secretos con: \`openssl rand -hex 32\`

**Archivo:** \`backend/src/config/env.ts:10-11\`" \
  "security,severity:critical"

create_issue \
  "[Security][Critical] Redis connection has no authentication" \
  "## Descripcion
Redis se inicializa sin contrasena en \`queue.ts\` y en ambos docker-compose files.

## Impacto
- Cualquier proceso en la red puede leer/escribir la cola de trabajos.
- Datos de notificaciones y sesiones accesibles sin autenticacion.

## Solucion sugerida
1. Anadir \`requirepass <password>\` en la config de Redis.
2. Pasar \`REDIS_PASSWORD\` como variable de entorno.
3. Inicializar: \`new Redis(env.REDIS_URL, { password: env.REDIS_PASSWORD })\`

**Archivos:** \`backend/src/lib/queue.ts\`, \`docker-compose.yml\`, \`docker-compose.prod.yml\`" \
  "security,severity:critical"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ ALTOS"
# ─────────────────────────────────────────────────────────────────────────────

create_issue \
  "[Security][High] PostgreSQL port exposed to host in docker-compose" \
  "## Descripcion
El puerto de PostgreSQL esta publicado al host en \`docker-compose.yml\`:

\`\`\`yaml
ports:
  - \"\${POSTGRES_PORT:-5432}:5432\"
\`\`\`

## Impacto
La base de datos es accesible desde cualquier proceso en el host y potencialmente desde la red local.

## Solucion sugerida
Eliminar la seccion \`ports\` del servicio postgres en docker-compose.yml. Solo los servicios internos de Docker necesitan acceso.

**Archivo:** \`docker-compose.yml:14\`" \
  "security,severity:high"

create_issue \
  "[Security][High] Hardcoded default database credentials in version control" \
  "## Descripcion
\`docker-compose.yml\` usa credenciales por defecto (postgres/postgres) expuestas en el repositorio.

## Impacto
Credenciales debiles y predecibles conocidas por cualquier persona con acceso al repo.

## Solucion sugerida
1. Eliminar valores por defecto del docker-compose.yml.
2. Usar \`.env.local\` (en .gitignore) para credenciales locales.
3. Documentar como generar credenciales seguras en el README.

**Archivos:** \`docker-compose.yml:10-12\`, \`.env.example\`" \
  "security,severity:high"

create_issue \
  "[Security][High] No CSRF protection on state-changing endpoints" \
  "## Descripcion
No existe ningun middleware CSRF. Todas las rutas POST/PUT/DELETE carecen de validacion CSRF.

## Impacto
Un atacante puede hacer que un usuario autenticado realice acciones no deseadas desde un sitio malicioso (Cross-Site Request Forgery).

## Solucion sugerida
- Verificar headers \`Origin\`/\`Referer\` en rutas sensibles.
- Dado que se usan cookies \`SameSite=Strict\` en produccion, el riesgo es menor en prod pero alto en desarrollo (\`SameSite=lax\`).

**Archivo:** \`backend/src/app.ts\`" \
  "security,severity:high"

create_issue \
  "[Bug][High] PATCH /notifications/read-all conflicts with /:id/read route" \
  "## Descripcion
En \`backend/src/routes/notifications.ts\`, el endpoint \`PATCH /read-all\` esta definido DESPUES de \`PATCH /:id/read\`. Express resuelve \`/read-all\` como \`/:id/read\` con id='read-all', causando un error de Prisma.

## Pasos para reproducir
1. Autenticarse con cualquier cuenta
2. \`PATCH /api/notifications/read-all\`
3. Recibe error de Prisma (id invalido) en lugar de marcar todas como leidas

## Solucion sugerida
Reordenar las rutas en el router: poner \`/read-all\` y \`/unread-count\` ANTES de \`/:id\`.

**Archivo:** \`backend/src/routes/notifications.ts:131\`" \
  "bug,severity:high"

create_issue \
  "[Security][High] No max-length validation on text input fields (DoS risk)" \
  "## Descripcion
Los schemas Zod no tienen limite de longitud maxima para campos de texto:

\`\`\`ts
title: z.string().min(2)          // sin .max()
description: z.string().optional() // sin .max()
\`\`\`

## Impacto
Un atacante puede enviar strings de varios MB, causando lentitud en busquedas full-text, uso excesivo de almacenamiento y errores OOM.

## Solucion sugerida
Anadir \`.max()\` a todos los campos: titulos \`.max(255)\`, descripciones \`.max(5000)\`.

**Archivos:** \`assignments.ts\`, \`courses.ts\`, \`exams.ts\`, \`projects.ts\`" \
  "security,severity:high"

create_issue \
  "[Security][High] Email enumeration via 'Email already registered' on register" \
  "## Descripcion
El endpoint de registro devuelve mensaje diferente si el email existe:

\`\`\`ts
res.status(409).json({ message: 'Email already registered' })
\`\`\`

## Impacto
Permite enumerar que emails estan registrados, facilitando ataques de phishing dirigido.

## Solucion sugerida
Devolver siempre el mismo mensaje generico o status 200 sin indicar si el email existia.

**Archivo:** \`backend/src/routes/auth.ts:99\`" \
  "security,severity:high"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ MEDIOS"
# ─────────────────────────────────────────────────────────────────────────────

create_issue \
  "[Security][Medium] Missing Content-Security-Policy header" \
  "## Descripcion
Helmet esta configurado sin una politica CSP explicita.

## Impacto
Sin CSP, ataques XSS pueden ejecutar scripts arbitrarios y robar credenciales.

## Solucion sugerida
Configurar helmet con CSP explicito:
\`\`\`ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [\"'self'\"],
      scriptSrc: [\"'self'\"],
      styleSrc: [\"'self'\", \"'unsafe-inline'\"],
      imgSrc: [\"'self'\", \"data:\", \"https:\"],
      connectSrc: [\"'self'\"],
      objectSrc: [\"'none'\"],
    },
  },
}))
\`\`\`

**Archivo:** \`backend/src/app.ts:46\`" \
  "security,severity:medium"

create_issue \
  "[Security][Medium] Swagger UI /api/docs publicly accessible in production" \
  "## Descripcion
La documentacion Swagger es publica y no requiere autenticacion, exponiendo la estructura completa de la API.

## Impacto
Facilita reconocimiento de la API: endpoints, schemas, parametros y tipos de datos a atacantes.

## Solucion sugerida
Desactivar en produccion: \`if (!isProd) app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(...))\`

**Archivo:** \`backend/src/app.ts:54\`" \
  "security,severity:medium"

create_issue \
  "[Security][Medium] Missing HSTS header in nginx production config" \
  "## Descripcion
\`frontend/nginx.conf\` no incluye el header \`Strict-Transport-Security\`.

## Impacto
Los navegadores no aplican HTTPS estrictamente, abriendo la puerta a ataques de downgrade SSL/TLS.

## Solucion sugerida
Anadir en el bloque \`server\` de nginx.conf:
\`\`\`nginx
add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;
\`\`\`

**Archivo:** \`frontend/nginx.conf\`" \
  "security,severity:medium"

create_issue \
  "[Security][Medium] No security audit logging for authentication events" \
  "## Descripcion
No existe registro de auditoria para eventos de seguridad (logins fallidos, cambios de contrasena, refresh de tokens).

## Impacto
Imposible detectar ataques de fuerza bruta o accesos no autorizados en produccion.

## Solucion sugerida
Anadir logging estructurado (pino) para: login exitoso/fallido con IP, logout, cambio de contrasena, token refresh, errores repetidos de autenticacion.

**Archivo:** \`backend/src/routes/auth.ts\`" \
  "security,severity:medium"

create_issue \
  "[Security][Medium] Search query param missing max-length limit" \
  "## Descripcion
El parametro \`q\` en el endpoint de busqueda no tiene limite de longitud:
\`\`\`ts
q: z.string().min(1)  // sin .max()
\`\`\`
Se usa directamente en \`websearch_to_tsquery\` de PostgreSQL.

## Solucion sugerida
\`\`\`ts
q: z.string().min(1).max(500).trim()
\`\`\`

**Archivo:** \`backend/src/routes/search.ts:47\`" \
  "security,severity:medium"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "▶ BAJOS"
# ─────────────────────────────────────────────────────────────────────────────

create_issue \
  "[Config][Low] Inconsistent pagination limits across routes" \
  "## Descripcion
Distintas rutas usan limites de paginacion diferentes (max 50 vs max 100).

## Solucion sugerida
Estandarizar a \`.max(50)\` en todas las rutas o extraer a constante global \`MAX_PAGE_SIZE\`.

**Archivos:** \`backend/src/routes/\`" \
  "config,severity:low"

create_issue \
  "[Bug][Low] grade-projection: missing range validation on 'target' param" \
  "## Descripcion
El parametro \`target\` en grade-projection no tiene validacion de rango:
\`\`\`ts
target: z.coerce.number().default(7)
\`\`\`
Valores negativos o >10 producen proyecciones absurdas.

## Solucion sugerida
\`\`\`ts
target: z.coerce.number().min(0).max(10).default(7)
\`\`\`

**Archivo:** \`backend/src/routes/courses.ts\`" \
  "bug,severity:low"

create_issue \
  "[Config][Low] Redis maxRetriesPerRequest: null may cause indefinite blocking" \
  "## Descripcion
La config de BullMQ usa \`maxRetriesPerRequest: null\`, permitiendo reintentos infinitos y bloqueando workers si Redis esta inaccesible.

## Solucion sugerida
\`\`\`ts
maxRetriesPerRequest: 3,
retryStrategy: (times) => Math.min(times * 100, 2000),
\`\`\`

**Archivo:** \`backend/src/lib/queue.ts\`" \
  "config,severity:low"

create_issue \
  "[Config][Low] render.yaml variables require manual post-deploy configuration" \
  "## Descripcion
Las variables \`FRONTEND_URL\` y \`BACKEND_INTERNAL_URL\` en render.yaml estan marcadas \`sync: false\`, requiriendo configuracion manual post-deploy y siendo propensas a errores.

## Solucion sugerida
Documentar en el README los pasos exactos necesarios post-deploy. Evaluar automatizacion via Render API o scripts de inicializacion.

**Archivo:** \`render.yaml:43,64\`" \
  "config,severity:low"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Issues creados: 18"
echo "  Ver en: https://github.com/$REPO/issues"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# UniPlanner

Aplicación web full-stack para planificar la vida universitaria: materias, horarios, tareas, exámenes, proyectos, notas, sesiones de estudio, logros, calendario y notificaciones.

---

## Stack tecnológico

**Backend**

| Categoría | Tecnología |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| ORM / Base de datos | Prisma + PostgreSQL |
| Autenticación | JWT (access + refresh tokens rotativos) |
| Cola de trabajos | BullMQ + Redis |
| Validación | Zod |
| Seguridad | Helmet, CORS, rate limiting por ruta, CSRF |
| Logging | Pino |
| Email | Nodemailer (fallback a consola) |
| Scheduler | node-cron |
| Tests | Jest + Supertest |

**Frontend**

| Categoría | Tecnología |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite + PWA (vite-plugin-pwa) |
| Routing | React Router v6 |
| Estilos | Tailwind CSS |
| UI | Headless UI + Heroicons |
| Formularios | React Hook Form + Zod |
| Calendario | FullCalendar |
| Gráficos | Recharts |
| Drag & Drop | dnd-kit |
| Animaciones | Framer Motion |
| Exportar PDF | jsPDF + html2canvas |
| Exportar Excel | xlsx |
| Toasts | react-hot-toast |
| Tests E2E | Playwright |

---

## Estructura del monorepo

```text
Uniplanner/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── config/env.ts
│   │   ├── docs/             # OpenAPI / Swagger
│   │   ├── lib/
│   │   │   ├── prisma.ts
│   │   │   ├── tokens.ts
│   │   │   ├── email.ts
│   │   │   ├── scheduler.ts
│   │   │   ├── queue.ts      # BullMQ
│   │   │   └── logger.ts     # Pino
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── validation.ts
│   │   │   ├── error.ts
│   │   │   ├── csrf.ts
│   │   │   └── requestId.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── settings.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── planning.ts
│   │   │   ├── today.ts
│   │   │   ├── search.ts
│   │   │   ├── calendar.ts
│   │   │   ├── notifications.ts
│   │   │   ├── courses.ts
│   │   │   ├── assignments.ts
│   │   │   ├── exams.ts
│   │   │   ├── projects.ts
│   │   │   ├── grades.ts
│   │   │   ├── studySessions.ts
│   │   │   ├── studyGoals.ts
│   │   │   └── achievements.ts
│   │   ├── services/
│   │   │   ├── assignmentsService.ts
│   │   │   ├── achievementsService.ts
│   │   │   ├── coursesService.ts
│   │   │   ├── examRetrospectiveService.ts
│   │   │   ├── notificationsService.ts
│   │   │   ├── projectsService.ts
│   │   │   ├── studyGoalsService.ts
│   │   │   ├── studyReminderPreferencesService.ts
│   │   │   └── studySessionsService.ts
│   │   ├── validators/       # Schemas Zod por recurso
│   │   ├── workers/          # BullMQ notification worker
│   │   ├── types/
│   │   ├── utils/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/       # 15+ componentes reutilizables
│   │   ├── context/          # AuthContext y otros providers
│   │   ├── hooks/            # Custom hooks
│   │   ├── lib/              # Cliente API + tipos
│   │   ├── utils/
│   │   └── pages/
│   │       ├── LoginPage.tsx
│   │       ├── RegisterPage.tsx
│   │       ├── ForgotPasswordPage.tsx
│   │       ├── ResetPasswordPage.tsx
│   │       ├── DashboardPage.tsx
│   │       ├── TodayPage.tsx
│   │       ├── CoursesPage.tsx
│   │       ├── SchedulePage.tsx
│   │       ├── AssignmentsPage.tsx
│   │       ├── ExamsPage.tsx
│   │       ├── ProjectsPage.tsx
│   │       ├── CalendarPage.tsx
│   │       ├── NotificationsPage.tsx
│   │       ├── SemesterHistoryPage.tsx
│   │       ├── SettingsPage.tsx
│   │       └── NotFoundPage.tsx
│   ├── tests/                # Playwright E2E
│   ├── Dockerfile
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── index.html
├── docker-compose.yml
├── .env.example
└── render.yaml
```

---

## Arquitectura

```text
[React + Vite + Tailwind — PWA]
  └─ Cliente Axios con JWT access token + auto-refresh
       └─ REST /api/*

[Express API]
  ├─ Middleware global: Helmet · CORS · Rate limit · CSRF · Request ID · Pino logger
  ├─ Rutas con validación Zod y middleware de autenticación JWT
  ├─ Servicios de dominio
  └─ Prisma ORM

[PostgreSQL]
  └─ Persistencia de usuarios, cursos, tareas, exámenes, proyectos, notas,
     sesiones de estudio, logros, notificaciones y tokens

[Redis + BullMQ]
  └─ Cola de trabajos para envío de notificaciones en background

[node-cron Scheduler]
  ├─ Evalúa streaks de estudio y desbloquea logros (diario, medianoche)
  └─ Genera recordatorios de exámenes/tareas por offsets configurables
```

### Modelo de datos (relaciones principales)

- `users` 1:N `courses`
- `courses` 1:N `class_sessions`
- `users` 1:N `assignments`; `courses` 1:N `assignments`
- `assignments` N:M `tags` via `assignment_tags`
- `users` 1:N `exams` (con retrospectiva post-examen)
- `users` 1:N `projects`; `projects` 1:N `milestones` + `project_tasks` (kanban)
- `users` 1:N `grades`; `courses` 1:N `grades`
- `users` 1:N `study_sessions`; `users` 1:N `study_goals`
- `users` 1:N `user_achievements`
- `users` 1:N `notifications`
- `users` 1:N `refresh_tokens`; `users` 1:N `password_reset_tokens`

### Decisiones de diseño

- JWT access (15 min) + refresh rotativo (7 días) almacenado con hash SHA-256 para revocación server-side.
- Rate limiting por categoría: auth (30 req/10 min), mutaciones (120 req/60 s), global (500 req/15 min).
- BullMQ + Redis para notificaciones en background; permite reintentos y monitoreo de jobs.
- Prisma para consistencia tipada; raw SQL solo en agregaciones de rendimiento crítico.
- El scheduler cron corre dentro del proceso API (suficiente para escala actual); para producción con múltiples instancias se recomienda separarlo.

---

## Configuración y ejecución

### Prerrequisitos

- Docker Desktop con Compose v2

### Arranque rápido (Docker — recomendado)

```bash
# 1. Copia variables de entorno
cp .env.example .env

# 2. Genera secretos seguros (reemplaza los valores de ejemplo en .env)
openssl rand -hex 32   # para POSTGRES_PASSWORD, REDIS_PASSWORD,
                       #     JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

# 3. Levanta toda la app (postgres + redis + backend + frontend)
docker compose up --build

# 4. Aplica migraciones y carga datos demo
docker compose exec backend npm run prisma:push
docker compose exec backend npm run seed
```

**URLs disponibles:**
- Frontend: `http://localhost:5173`
- Backend / Health: `http://localhost:4000/api/health`

**Credenciales demo:**
- Email: `demo@uniplanner.app`
- Password: `Demo12345!`

### Variables de entorno (`.env.example`)

```env
# Base de datos
POSTGRES_USER=uniplanner
POSTGRES_PASSWORD=<secreto>
POSTGRES_DB=uniplanner
POSTGRES_PORT=5432
DATABASE_URL=postgresql://uniplanner:<secreto>@localhost:5432/uniplanner?schema=public

# Backend
BACKEND_PORT=4000
JWT_ACCESS_SECRET=<min 32 chars>
JWT_REFRESH_SECRET=<min 32 chars>
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7

# Redis / BullMQ
REDIS_PASSWORD=<secreto>
REDIS_URL=redis://:<secreto>@localhost:6379

# CORS
FRONTEND_URL=http://localhost:5173

# SMTP (opcional — si se omite, los emails se imprimen en consola)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=UniPlanner <no-reply@uniplanner.local>

# Frontend
VITE_API_BASE_URL=   # dejar vacío para usar el proxy de Vite
```

### Deploy en Render

`render.yaml` incluye dos variables en `sync: false` que deben configurarse manualmente tras el primer deploy:

1. Ejecuta el blueprint.
2. Copia la URL pública del backend → pégala en `BACKEND_INTERNAL_URL` del servicio frontend.
3. Copia la URL pública del frontend → pégala en `FRONTEND_URL` del servicio backend.
4. Redeploy de ambos servicios.

### Tests

```bash
# Tests de integración (Jest + Supertest)
docker compose exec backend npm test

# Tests E2E (Playwright) — requiere app corriendo
cd frontend && npx playwright test
```

---

## API — Endpoints

| Área | Rutas |
|---|---|
| **Auth** | `POST /register` · `POST /login` · `POST /refresh` · `POST /logout` · `POST /forgot-password` · `POST /reset-password` |
| **Perfil** | `GET/PATCH /api/settings/profile` · `GET/PATCH /api/settings/preferences` |
| **Materias** | `GET/POST/PATCH/DELETE /api/courses` · `GET /api/courses/:id/schedule/weekly` · `GET /api/courses/:id/grade-projection` |
| **Tareas** | `GET/POST/PATCH/DELETE /api/assignments` |
| **Exámenes** | `GET/POST/PATCH/DELETE /api/exams` · `POST /api/exams/:id/retrospective` |
| **Proyectos** | `GET/POST/PATCH/DELETE /api/projects` · `/milestones` · `/tasks` (kanban) |
| **Notas** | `GET/POST/PATCH/DELETE /api/grades` |
| **Sesiones de estudio** | `GET/POST /api/study-sessions` |
| **Metas de estudio** | `GET/PUT /api/study-goals` |
| **Logros** | `GET /api/achievements` |
| **Dashboard** | `GET /api/dashboard/summary` |
| **Hoy** | `GET /api/today` |
| **Plan semanal** | `GET /api/planning/week` |
| **Calendario** | `GET /api/calendar/events` · `GET /api/calendar/ics` |
| **Notificaciones** | `GET/PATCH /api/notifications` |
| **Búsqueda** | `GET /api/search?q=...` |

---

## Ejemplos cURL

```bash
# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@uniplanner.app","password":"Demo12345!"}'

# Dashboard
curl http://localhost:4000/api/dashboard/summary \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# Crear tarea con etiquetas
curl -X POST http://localhost:4000/api/assignments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "title": "Estudiar estructuras de datos",
    "dueDate": "2026-03-01T20:00:00.000Z",
    "priority": "HIGH",
    "status": "PENDING",
    "tags": ["estudio", "algoritmos"]
  }'

# Registrar sesión de estudio
curl -X POST http://localhost:4000/api/study-sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "courseId": "<COURSE_ID>",
    "startTime": "2026-02-28T14:00:00.000Z",
    "endTime": "2026-02-28T15:30:00.000Z",
    "source": "manual"
  }'

# Exportar calendario ICS
curl http://localhost:4000/api/calendar/ics \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -o uniplanner.ics
```

---

## Funcionalidades implementadas

**Autenticación y cuenta**
- [x] Registro / login / logout / refresh JWT rotativo
- [x] Recuperación de contraseña con token temporal
- [x] Perfil y preferencias de notificación
- [x] Rate limiting y validación backend

**Gestión académica**
- [x] CRUD materias con color, créditos, docente, semestre
- [x] Horario semanal de clases (presencial / online)
- [x] CRUD tareas con prioridad / estado / etiquetas / repetición / adjuntos
- [x] CRUD exámenes con offsets de recordatorio y peso en nota
- [x] Retrospectiva post-examen (sensación, horas de estudio, notas)
- [x] CRUD proyectos + milestones + kanban de tareas (dnd-kit)
- [x] Registro de evaluaciones y proyección de nota final
- [x] Historial de semestres anteriores

**Estudio y gamificación**
- [x] Sesiones de estudio (manual / automático) con duración por materia
- [x] Metas semanales de estudio por materia
- [x] Streaks de estudio (actual, máximo, última fecha)
- [x] Sistema de logros con 8 achievements (FIRST_SESSION, STREAK_3, STREAK_7, STREAK_30, WEEKLY_GOAL_1, NIGHT_OWL, EARLY_BIRD, MARATHON)

**Vistas y productividad**
- [x] Dashboard con KPIs, gráfico de estudio semanal, materias en riesgo
- [x] Vista "Hoy" con agenda del día y tareas próximas
- [x] Calendario mensual/semanal con FullCalendar
- [x] Export ICS (Google Calendar / Outlook)
- [x] Notificaciones in-app + marcar leídas
- [x] Email opcional por SMTP (fallback a consola)
- [x] Búsqueda global
- [x] Plan semanal automático (heurística)
- [x] Exportar a PDF y Excel

**Infraestructura**
- [x] Docker Compose (postgres + redis + backend + frontend)
- [x] Cola de notificaciones con BullMQ + Redis
- [x] PWA (installable, offline-ready)
- [x] OpenAPI / Swagger docs
- [x] Tests de integración (Jest + Supertest)
- [x] Tests E2E (Playwright)
- [x] Deploy en Render con `render.yaml`
- [x] Seeds demo

---

## Próximas mejoras

1. Corregir issues de seguridad abiertos (#104–#113): enumeración de usuarios, validación de tipo JWT, race condition en refresh, CSS injection en color, etc.
2. Sustituir funciones `ensure*` de DDL en runtime por Prisma puro (#110).
3. Agregar índice compuesto `Grade(userId, courseId)` (#112).
4. Integrar almacenamiento real de adjuntos (S3 / Cloudinary).
5. RBAC, auditoría y observabilidad (OpenTelemetry + tracing).
6. Integración directa con Google / Outlook Calendar (OAuth).

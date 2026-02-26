# UniPlanner
Aplicacion web full-stack para planificar la vida universitaria: materias, horarios, tareas, examenes, proyectos, notas, calendario, notificaciones y plan de estudio semanal.

## 1) Estructura del monorepo

```text
Prueba/
  backend/
    prisma/
      schema.prisma
      seed.ts
    src/
      config/env.ts
      lib/
        prisma.ts
        tokens.ts
        email.ts
        scheduler.ts
      middleware/
        auth.ts
        validation.ts
        error.ts
      routes/
        auth.ts
        settings.ts
        dashboard.ts
        planning.ts
        search.ts
        calendar.ts
        notifications.ts
        courses.ts
        assignments.ts
        exams.ts
        projects.ts
        grades.ts
      utils/
        asyncHandler.ts
        grading.ts
        planning.ts
        calendar.ts
      app.ts
      server.ts
    tests/
      setupEnv.ts
      api.test.ts
    Dockerfile
    package.json
    tsconfig.json
    jest.config.json
  frontend/
    src/
      components/
        AppShell.tsx
        AuthCard.tsx
        RouteGuards.tsx
        UI.tsx
      context/
        AuthContext.tsx
      hooks/
        useDebounce.ts
      lib/
        api.ts
        types.ts
      pages/
        LoginPage.tsx
        RegisterPage.tsx
        ForgotPasswordPage.tsx
        ResetPasswordPage.tsx
        DashboardPage.tsx
        CoursesPage.tsx
        SchedulePage.tsx
        AssignmentsPage.tsx
        ExamsPage.tsx
        ProjectsPage.tsx
        CalendarPage.tsx
        NotificationsPage.tsx
        SettingsPage.tsx
        NotFoundPage.tsx
      App.tsx
      main.tsx
      index.css
    Dockerfile
    package.json
    tailwind.config.js
    postcss.config.js
    vite.config.ts
    tsconfig.json
    index.html
  docker-compose.yml
  .env.example
  .gitignore
```

## 2) Arquitectura (diseno)

### Diagrama textual de modulos y flujo

```text
[React + Vite + Tailwind Frontend]
  -> Axios API client (JWT access token + auto refresh)
  -> REST calls /api/*

[Express API]
  -> Security middleware (helmet, rate limit, validation, auth)
  -> Domain routes (auth, courses, assignments, exams, projects, grades, calendar, planning)
  -> Prisma ORM

[PostgreSQL]
  -> Persistencia de usuarios, cursos, tareas, examenes, proyectos, notas y notificaciones

[Node Cron Scheduler]
  -> Calcula recordatorios por offsets
  -> Crea notificaciones in-app
  -> Envia email por SMTP (o fallback en consola)
```

### Modelo ER (resumen)

- `users` 1:N `courses`
- `courses` 1:N `class_sessions`
- `users` 1:N `assignments`; `courses` 1:N `assignments`
- `users` 1:N `exams`; `courses` 1:N `exams`
- `users` 1:N `projects`; `courses` 1:N `projects`
- `projects` 1:N `milestones`
- `projects` 1:N `project_tasks` (kanban)
- `users` 1:N `grades`; `courses` 1:N `grades`
- `users` 1:N `notifications`
- `users` 1:N `tags`; `assignments` N:M `tags` via `assignment_tags`
- `users` 1:N `refresh_tokens`
- `users` 1:N `password_reset_tokens`

### Decisiones y tradeoffs

- Se usa JWT access + refresh token rotativo almacenado con hash SHA-256 para revocacion server-side.
- Prisma + PostgreSQL para consistencia tipada y relaciones complejas.
- Scheduler en API (simple y suficiente local); para escala futura conviene separar worker/cola.
- Upload de adjuntos se implementa como links (requisito opcional).
- Email real depende de SMTP; si no existe configuracion, se simula en consola sin romper flujo.

## 3) Configuracion y ejecucion paso a paso

### Prerequisitos

- Docker Desktop (Compose v2)

### Arranque rapido con Docker (recomendado)

1. Copia variables de entorno:

```bash
cp .env.example .env
```

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Recomendado para desarrollo local:

```bash
cp .env.example .env.local
```

En `.env` o `.env.local`, reemplaza credenciales por valores fuertes antes de levantar contenedores:
- `POSTGRES_PASSWORD` y `REDIS_PASSWORD`: genera secretos con `openssl rand -hex 32`
- `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`: minimo 32 caracteres
- `DATABASE_URL`: debe coincidir con el usuario/password definidos

2. Levanta toda la app:

```bash
docker compose up --build
```

3. URLs:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000/api/health`

4. Credenciales demo (seed):
- Email: `demo@uniplanner.app`
- Password: `Demo12345!`

### Deploy en Render (pasos manuales obligatorios)

`render.yaml` deja dos variables en `sync: false` para evitar valores incorrectos en el primer deploy:
- `BACKEND_INTERNAL_URL` (servicio frontend)
- `FRONTEND_URL` (servicio backend)

Flujo recomendado:
1. Ejecuta el primer deploy del blueprint.
2. Copia la URL publica del backend y guardala en `BACKEND_INTERNAL_URL` del frontend.
3. Copia la URL publica del frontend y guardala en `FRONTEND_URL` del backend.
4. Redeploy de ambos servicios para aplicar enlaces cruzados.

### Migraciones y seed (manual)

Si quieres correrlos manualmente dentro del backend:

```bash
docker compose exec backend npm run prisma:generate
docker compose exec backend npm run prisma:push
docker compose exec backend npm run seed
```

### Tests basicos (supertest)

```bash
docker compose exec backend npm test
```

> Nota: Los tests usan la base configurada en `DATABASE_URL`.

## 4) Endpoints clave

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password`
- Perfil/Ajustes: `/api/settings/profile`, `/api/settings/preferences`
- Materias: `/api/courses` (+ `/schedule/weekly`, `/:id/grade-projection`, class sessions)
- Tareas: `/api/assignments`
- Examenes: `/api/exams`
- Proyectos/Kanban: `/api/projects` (+ milestones/tasks)
- Notas: `/api/grades`
- Dashboard: `/api/dashboard/summary`
- Plan semanal: `/api/planning/week`
- Calendario: `/api/calendar/events`, `/api/calendar/ics`
- Notificaciones: `/api/notifications`
- Buscador global: `/api/search?q=...`

## 5) cURL de ejemplo

### Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@uniplanner.app","password":"Demo12345!"}'
```

### Dashboard summary

```bash
curl http://localhost:4000/api/dashboard/summary \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Crear tarea

```bash
curl -X POST http://localhost:4000/api/assignments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "title":"Estudiar estructuras de datos",
    "dueDate":"2026-03-01T20:00:00.000Z",
    "priority":"HIGH",
    "status":"PENDING",
    "repeatRule":"NONE",
    "tags":["estudio","algoritmos"]
  }'
```

### Crear examen

```bash
curl -X POST http://localhost:4000/api/exams \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "title":"Parcial 2",
    "dateTime":"2026-03-05T15:00:00.000Z",
    "type":"MIDTERM",
    "reminderOffsets":[10080,4320,1440,360,60]
  }'
```

### Exportar calendario ICS

```bash
curl http://localhost:4000/api/calendar/ics \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -o uniplanner.ics
```

## 6) Cobertura funcional implementada

- [x] Registro/login/logout/refresh JWT
- [x] Recuperacion de password con token temporal
- [x] Perfil + preferencias de notificacion
- [x] Rate limit + validaciones backend
- [x] CRUD materias + horarios
- [x] Vista horario semanal
- [x] CRUD tareas + estado/prioridad/etiquetas/repeticion + links adjuntos
- [x] CRUD examenes + offsets de recordatorio
- [x] CRUD proyectos + milestones + kanban tareas
- [x] Registro de evaluaciones y proyeccion de nota final
- [x] Dashboard con KPIs + materias en riesgo
- [x] Calendario mensual/semanal con filtros
- [x] Export ICS
- [x] Notificaciones in-app + marcar leidas
- [x] Email opcional por SMTP, fallback a consola
- [x] Buscador global
- [x] Modo enfoque (tareas del dia + pomodoro opcional)
- [x] Plan semanal automatico (heuristica)
- [x] Seeds demo
- [x] Docker Compose (frontend + backend + db)
- [x] Tests basicos supertest (auth + CRUD critico)

## 7) Proximas mejoras recomendadas

1. Integrar almacenamiento real de adjuntos (S3/Cloudinary) con control de permisos.
2. Separar scheduler en worker con cola (BullMQ/Redis) para escalabilidad.
3. Agregar RBAC, auditoria y observabilidad (OpenTelemetry + tracing).
4. Cobertura de tests E2E (Playwright) y contract testing.
5. Integracion directa con Google/Outlook Calendar (OAuth).

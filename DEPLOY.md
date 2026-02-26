# UniPlanner — Guía de despliegue multi-dispositivo

Cómo tener UniPlanner en tu **teléfono** y tu **computadora**, siempre sincronizado.

## Arquitectura

```
┌─────────────┐     ┌─────────────┐
│  Teléfono   │     │ Computadora │
│  (PWA App)  │     │  (PWA App)  │
└──────┬──────┘     └──────┬──────┘
       │    HTTPS (Caddy)  │
       └────────┬──────────┘
                │
       ┌────────▼────────┐
       │   Tu Servidor   │
       │ (VPS / Cloud)   │
       │                 │
       │  ┌───────────┐  │
       │  │  Caddy    │  │  ← HTTPS automático
       │  ├───────────┤  │
       │  │  Frontend │  │  ← React PWA
       │  ├───────────┤  │
       │  │  Backend  │  │  ← Express API
       │  ├───────────┤  │
       │  │ PostgreSQL│  │  ← Datos sincronizados
       │  ├───────────┤  │
       │  │  Redis    │  │  ← Cola de notificaciones
       │  └───────────┘  │
       └─────────────────┘
```

Los datos viven en **un solo lugar** (PostgreSQL en el servidor). Ambos dispositivos
se conectan al mismo servidor, por lo que siempre ven los mismos datos en tiempo real.

## Opción A: VPS con Docker (Recomendada)

### Requisitos

- Un VPS con al menos 1 GB de RAM (ejemplos: Hetzner CX22 ~€4/mes, DigitalOcean $6/mes)
- Un dominio (ejemplo: namecheap.com ~$10/año)
- Docker y Docker Compose instalados en el VPS

### Paso 1: Configurar DNS

Apunta tu dominio (o subdominio) a la IP de tu VPS:

```
Tipo: A
Nombre: uniplanner   (o @ para el dominio raíz)
Valor: TU_IP_DEL_VPS
TTL:   300
```

### Paso 2: Clonar el proyecto en el VPS

```bash
ssh tu-usuario@TU_IP_DEL_VPS
git clone https://github.com/TU_USUARIO/Uniplanner.git
cd Uniplanner
```

### Paso 3: Configurar variables de entorno

```bash
cp .env.production .env
nano .env   # Editar con tus valores reales
```

Valores **obligatorios** a cambiar:
- `DOMAIN` → tu dominio real (ej: `uniplanner.midominio.com`)
- `POSTGRES_PASSWORD` → una contraseña fuerte
- `DATABASE_URL` → actualizar la contraseña para que coincida
- `JWT_ACCESS_SECRET` → generar con `openssl rand -hex 32`
- `JWT_REFRESH_SECRET` → generar con `openssl rand -hex 32`
- `REDIS_PASSWORD` → generar con `openssl rand -hex 32`
- `FRONTEND_URL` → `https://tu-dominio.com`

### Paso 4: Desplegar

```bash
chmod +x deploy.sh
./deploy.sh
```

Caddy obtendrá automáticamente un certificado HTTPS de Let's Encrypt.

### Paso 5: Instalar en tus dispositivos

**En tu teléfono (Android):**
1. Abre Chrome y ve a `https://tu-dominio.com`
2. Inicia sesión o regístrate
3. Chrome mostrará un banner "Agregar UniPlanner a pantalla de inicio"
4. O toca el menú (⋮) → "Agregar a pantalla de inicio"
5. UniPlanner aparecerá como una app en tu teléfono

**En tu teléfono (iPhone):**
1. Abre Safari y ve a `https://tu-dominio.com`
2. Toca el botón de Compartir (□↑)
3. Selecciona "Agregar a pantalla de inicio"
4. UniPlanner aparecerá como una app

**En tu computadora (Chrome/Edge):**
1. Ve a `https://tu-dominio.com`
2. Haz clic en el icono de instalación (⊕) en la barra de direcciones
3. O ve a Menú → "Instalar UniPlanner"
4. Se abrirá como una ventana independiente (sin barra de navegador)

## Opción B: Servicios Cloud (sin administrar servidor)

Si prefieres no manejar un VPS, puedes usar servicios gestionados:

| Componente | Servicio | Costo |
|---|---|---|
| Frontend | Vercel o Netlify | Gratis |
| Backend | Railway o Render | Gratis / ~$5/mes |
| PostgreSQL | Neon o Supabase | Gratis (0.5 GB) |
| Redis | Upstash | Gratis (10K cmd/día) |

### Pasos generales:

1. Crear cuenta en Railway/Render
2. Conectar tu repositorio de GitHub
3. Configurar las variables de entorno (las mismas de `.env.production`)
4. Railway/Render desplegará automáticamente en cada push

## Cómo funciona la sincronización

1. **Login unificado**: Inicias sesión con la misma cuenta en ambos dispositivos
2. **Datos centralizados**: Todo se guarda en PostgreSQL en el servidor
3. **Tiempo real**: Al abrir la app en cualquier dispositivo, los datos se cargan frescos del servidor
4. **Offline**: Si pierdes conexión, la PWA muestra datos en caché (últimos 5 minutos)
5. **Actualizaciones automáticas**: El Service Worker se actualiza automáticamente cuando hay cambios

## Mantenimiento

```bash
# Ver logs en tiempo real
docker compose -f docker-compose.prod.yml logs -f

# Reiniciar servicios
docker compose -f docker-compose.prod.yml restart

# Actualizar a nueva versión
git pull
./deploy.sh

# Backup de la base de datos
docker exec uniplanner-db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql

# Restaurar backup
cat backup.sql | docker exec -i uniplanner-db psql -U $POSTGRES_USER $POSTGRES_DB
```

## Solución de problemas

| Problema | Solución |
|---|---|
| No aparece opción de instalar | Asegúrate de usar HTTPS y Chrome/Safari |
| La app no carga offline | Abre la app al menos una vez con conexión |
| Los datos no se sincronizan | Verifica que ambos dispositivos usen la misma cuenta |
| Certificado SSL falla | Verifica que el DNS apunte a tu VPS y el puerto 443 esté abierto |

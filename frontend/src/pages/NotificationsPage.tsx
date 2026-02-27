import { BellAlertIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { api, getErrorMessage } from "../lib/api";
import type { Notification, PaginatedResponse, PaginationMeta } from "../lib/types";
import { Alert, Badge, Button, Card, EmptyState, PageTitle, SelectInput, Skeleton } from "../components/UI";

const NOTIFICATIONS_FILTERS_KEY = "uniplanner_notifications_filters_v1";
const NOTIFICATIONS_PAGE_KEY = "uniplanner_notifications_page_v1";

type NotificationFilters = {
  unreadOnly: boolean;
  type: "" | "EXAM" | "ASSIGNMENT" | "MILESTONE" | "SYSTEM";
  sortBy: "createdAt" | "read" | "type";
  sortDir: "asc" | "desc";
  limit: number;
};

const defaultFilters: NotificationFilters = {
  unreadOnly: false,
  type: "",
  sortBy: "createdAt",
  sortDir: "desc",
  limit: 20,
};

const defaultPagination: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

function loadSavedFilters(): NotificationFilters {
  if (typeof window === "undefined") return defaultFilters;
  const raw = localStorage.getItem(NOTIFICATIONS_FILTERS_KEY);
  if (!raw) return defaultFilters;

  try {
    return {
      ...defaultFilters,
      ...(JSON.parse(raw) as Partial<NotificationFilters>),
    };
  } catch {
    return defaultFilters;
  }
}

function loadSavedPage(): number {
  if (typeof window === "undefined") return 1;
  const value = Number(localStorage.getItem(NOTIFICATIONS_PAGE_KEY));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

type NotificationsResponse = PaginatedResponse<Notification> & {
  unreadCount: number;
};

function notificationTone(type: Notification["type"]): "brand" | "warning" | "success" | "default" {
  if (type === "EXAM") return "warning";
  if (type === "ASSIGNMENT") return "brand";
  if (type === "MILESTONE") return "success";
  return "default";
}

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filters, setFilters] = useState<NotificationFilters>(loadSavedFilters);
  const [page, setPage] = useState<number>(loadSavedPage);
  const [pagination, setPagination] = useState<PaginationMeta>(defaultPagination);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const response = await api.get<NotificationsResponse>("/notifications", {
      params: {
        unreadOnly: filters.unreadOnly ? true : undefined,
        type: filters.type || undefined,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        limit: filters.limit,
        page,
      },
    });
    setNotifications(response.data.items);
    setUnreadCount(response.data.unreadCount);
    setPagination(response.data.pagination);
    setLoading(false);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(NOTIFICATIONS_FILTERS_KEY, JSON.stringify(filters));
      localStorage.setItem(NOTIFICATIONS_PAGE_KEY, String(page));
    }
  }, [filters, page]);

  useEffect(() => {
    void load().catch((err) => {
      setLoading(false);
      setError(getErrorMessage(err));
    });
  }, [filters, page]);

  function updateFilters(next: Partial<NotificationFilters>) {
    setFilters((prev) => ({ ...prev, ...next }));
    setPage(1);
  }

  async function markRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function markAll() {
    try {
      await api.patch("/notifications/read-all");
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Inbox"
        title="Notificaciones"
        subtitle="Controla alertas in-app por prioridad, tipo y estado de lectura."
        action={
          <Button type="button" variant="subtle" onClick={() => void markAll()} disabled={unreadCount === 0}>
            Marcar todas como leidas
          </Button>
        }
      />

      {error && <Alert tone="error" message={error} />}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BellAlertIcon className="size-5 text-brand-700" />
            <p className="text-sm font-semibold text-ink-700">
              Sin leer: <span className="text-brand-700">{unreadCount}</span>
            </p>
          </div>
          <Badge tone={filters.unreadOnly ? "warning" : "default"}>
            {filters.unreadOnly ? "Solo no leidas" : "Todas"}
          </Badge>
        </div>

        <div className="rounded-2xl border border-ink-200 bg-ink-50/35 p-3">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-300">
              <input
                type="checkbox"
                checked={filters.unreadOnly}
                onChange={(event) => updateFilters({ unreadOnly: event.target.checked })}
              />
              Solo no leidas
            </label>
            <SelectInput value={filters.type} onChange={(event) => updateFilters({ type: event.target.value as NotificationFilters["type"] })}>
              <option value="">Todos los tipos</option>
              <option value="EXAM">Examen</option>
              <option value="ASSIGNMENT">Tarea</option>
              <option value="MILESTONE">Milestone</option>
              <option value="SYSTEM">Sistema</option>
            </SelectInput>
            <SelectInput value={filters.sortBy} onChange={(event) => updateFilters({ sortBy: event.target.value as NotificationFilters["sortBy"] })}>
              <option value="createdAt">Ordenar por fecha</option>
              <option value="read">Ordenar por lectura</option>
              <option value="type">Ordenar por tipo</option>
            </SelectInput>
            <SelectInput value={filters.sortDir} onChange={(event) => updateFilters({ sortDir: event.target.value as NotificationFilters["sortDir"] })}>
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </SelectInput>
            <SelectInput value={String(filters.limit)} onChange={(event) => updateFilters({ limit: Number(event.target.value) })}>
              <option value="10">10 por pagina</option>
              <option value="20">20 por pagina</option>
              <option value="50">50 por pagina</option>
            </SelectInput>
          </div>
        </div>

        <p className="text-xs text-ink-500">
          Mostrando {notifications.length} de {pagination.total} resultados
        </p>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            title="Sin notificaciones"
            description="No hay alertas para los filtros seleccionados."
            action={
              <Button type="button" variant="ghost" onClick={() => updateFilters(defaultFilters)}>
                Limpiar filtros
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={
                  notification.read
                    ? "rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-700 dark:bg-[var(--surface)]"
                    : "rounded-2xl border border-brand-100 bg-brand-50/50 p-4 dark:border-brand-700/40 dark:bg-brand-700/15"
                }
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink-900 dark:text-ink-100">{notification.title}</h3>
                  <div className="flex items-center gap-2">
                    <Badge tone={notificationTone(notification.type)}>{notification.type}</Badge>
                    {!notification.read && <Badge tone="brand">Nueva</Badge>}
                  </div>
                </div>
                <p className="text-sm text-ink-700 dark:text-ink-300">{notification.message}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </p>
                  {!notification.read && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void markRead(notification.id)}>
                      Marcar leida
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">
            Pagina {pagination.page} de {Math.max(1, pagination.totalPages)}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={!pagination.hasPrev} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
              Anterior
            </Button>
            <Button type="button" variant="ghost" disabled={!pagination.hasNext} onClick={() => setPage((prev) => prev + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

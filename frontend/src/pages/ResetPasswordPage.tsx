import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { Alert, Button, Field, TextInput } from "../components/UI";
import { useAuth } from "../context/AuthContext";

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await resetPassword(token, password);
      setMessage(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <AuthCard
        title="Restablecer password"
        subtitle="Pega el token recibido o abre el enlace de recuperacion para completar el cambio."
        footer={
          <p>
            Volver a{" "}
            <Link className="font-semibold text-brand-700" to="/login">
              iniciar sesion
            </Link>
          </p>
        }
      >
        <form className="grid gap-3" onSubmit={onSubmit}>
          <Field label="Token" htmlFor="token">
            <TextInput id="token" value={token} onChange={(event) => setToken(event.target.value)} required />
          </Field>
          <Field label="Nuevo password" htmlFor="password">
            <TextInput
              id="password"
              type="password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          {message && <Alert tone="success" message={message} />}
          {error && <Alert tone="error" message={error} />}

          <Button type="submit" disabled={loading}>
            {loading ? "Guardando..." : "Actualizar password"}
          </Button>
        </form>
      </AuthCard>
    </div>
  );
}

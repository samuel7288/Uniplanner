import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { Alert, Button, Field, TextInput } from "../components/UI";
import { useAuth } from "../context/AuthContext";

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await forgotPassword(email);
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
        title="Recuperar password"
        subtitle="Te enviaremos un enlace o token temporal para restablecer acceso."
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
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          {message && <Alert tone="success" message={message} />}
          {error && <Alert tone="error" message={error} />}

          <Button type="submit" disabled={loading}>
            {loading ? "Enviando..." : "Enviar instrucciones"}
          </Button>
        </form>
      </AuthCard>
    </div>
  );
}

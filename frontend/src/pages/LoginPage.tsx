import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthCard } from "../components/AuthCard";
import { Alert, Button, Field, TextInput } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/api";

const loginSchema = z.object({
  email: z.string().email("Ingresa un email valido"),
  password: z.string().min(8, "Debe tener al menos 8 caracteres").max(72, "No puede exceder 72 caracteres"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    try {
      await login(values.email, values.password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  return (
    <div className="min-h-screen px-4 py-10">
      <AuthCard
        title="Inicia sesion"
        subtitle="Organiza tareas, examenes y proyectos con una vista central de todo tu semestre."
        footer={
          <p>
            No tienes cuenta?{" "}
            <Link className="font-semibold text-brand-700 dark:text-brand-400" to="/register">
              Registrate
            </Link>
          </p>
        }
      >
        <form className="grid gap-3" onSubmit={onSubmit} noValidate>
          <Field label="Email" htmlFor="email" error={errors.email?.message?.toString()}>
            <TextInput
              id="email"
              type="email"
              {...register("email")}
              autoComplete="email"
              aria-invalid={!!errors.email}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message?.toString()}>
            <TextInput
              id="password"
              type="password"
              {...register("password")}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
            />
          </Field>

          {error && <Alert tone="error" message={error} />}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </Button>

          <Link className="text-sm font-medium text-brand-700 dark:text-brand-400" to="/forgot-password">
            Olvide mi password
          </Link>
        </form>
      </AuthCard>
    </div>
  );
}

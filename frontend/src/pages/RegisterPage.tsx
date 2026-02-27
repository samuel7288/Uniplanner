import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AuthCard } from "../components/AuthCard";
import { Alert, Button, Field, TextInput } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/api";

const registerSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Ingresa un email valido"),
  password: z
    .string()
    .min(8, "Debe tener al menos 8 caracteres")
    .max(72, "No puede exceder 72 caracteres"),
  career: z.string().optional(),
  university: z.string().optional(),
  timezone: z.string().optional(),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerUser } = useAuth();
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      password: "",
      career: "",
      university: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

  const passwordValue = watch("password") ?? "";

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    try {
      await registerUser({
        name: values.name.trim(),
        email: values.email,
        password: values.password,
        career: values.career?.trim() || undefined,
        university: values.university?.trim() || undefined,
        timezone: values.timezone,
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  return (
    <div className="min-h-screen px-4 py-10">
      <AuthCard
        title="Crear cuenta"
        subtitle="Empieza a planificar tu vida universitaria con un flujo de trabajo diario."
        footer={
          <p>
            Ya tienes cuenta?{" "}
            <Link className="font-semibold text-brand-700 dark:text-brand-400" to="/login">
              Inicia sesion
            </Link>
          </p>
        }
      >
        <form className="grid gap-3" onSubmit={onSubmit} noValidate>
          <Field label="Nombre completo" htmlFor="name" error={errors.name?.message?.toString()}>
            <TextInput id="name" {...register("name")} aria-invalid={!!errors.name} placeholder="Tu nombre" />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message?.toString()}>
            <TextInput
              id="email"
              type="email"
              {...register("email")}
              aria-invalid={!!errors.email}
              placeholder="tu@email.com"
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password?.message?.toString()}
            helper={!errors.password ? `${passwordValue.length}/8+ caracteres` : undefined}
          >
            <TextInput
              id="password"
              type="password"
              {...register("password")}
              aria-invalid={!!errors.password}
              placeholder="********"
            />
          </Field>
          <Field label="Carrera" htmlFor="career">
            <TextInput
              id="career"
              {...register("career")}
              placeholder="Ej: Ingenieria en Sistemas"
            />
          </Field>
          <Field label="Universidad" htmlFor="university">
            <TextInput id="university" {...register("university")} placeholder="Ej: UES" />
          </Field>

          {error && <Alert tone="error" message={error} />}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creando..." : "Crear cuenta"}
          </Button>
        </form>
      </AuthCard>
    </div>
  );
}

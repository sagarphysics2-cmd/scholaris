import { z } from "zod";
import { email, password } from "./common";

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: "Password is required." }).max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(200),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { error: "Passwords do not match.", path: ["confirmPassword"] });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Current password is required." }),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { error: "Passwords do not match.", path: ["confirmPassword"] })
  .refine((d) => d.password !== d.currentPassword, { error: "Choose a password you have not used here.", path: ["password"] });

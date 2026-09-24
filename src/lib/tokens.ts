import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const VIGENCIA_INVITACION_HORAS = 72;

/** Token de invitación: 32 bytes aleatorios. Solo se guarda su hash. */
export function generarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

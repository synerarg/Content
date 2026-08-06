import { redirect } from "next/navigation";

export default function RootPage() {
  // Middleware sends unauthenticated visitors to /login, so anyone reaching
  // here has a session and belongs in the app proper.
  redirect("/contenido");
}

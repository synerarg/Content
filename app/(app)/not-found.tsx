import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { Button } from "@/components/ui/button";

/*
  Rendered when a page under the app shell calls notFound().

  Reached in two ways that are indistinguishable by design: the row genuinely
  does not exist, or it belongs to another workspace and RLS filtered it out.
  The copy therefore never claims the thing exists — saying "no tenés acceso"
  would confirm the id to someone probing for it.
*/
export default function AppNotFound() {
  return (
    <>
      <div className="border-b border-border px-6 py-5 md:px-8">
        <h1 className="text-lg font-semibold tracking-tight">No encontrado</h1>
      </div>
      <EmptyState
        icon={FileQuestion}
        title="Esto no existe"
        description="El enlace puede estar viejo, o el contenido pertenece a otro espacio de trabajo."
        action={
          <Button asChild>
            <Link href="/contenido">Volver a Contenido</Link>
          </Button>
        }
      />
    </>
  );
}

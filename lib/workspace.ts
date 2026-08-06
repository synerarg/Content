import { createClient } from "@/lib/supabase/server";

/**
 * The caller's workspace.
 *
 * RLS already scopes this select to workspaces the user belongs to, so the
 * result is trustworthy without any additional filter. One workspace per user
 * today; when invites land, this becomes an explicit selection rather than a
 * `limit(1)`.
 *
 * Every mutation derives workspace_id from here rather than accepting it from
 * the client. A client-supplied workspace_id would be rejected by RLS anyway,
 * but not accepting it in the first place means there is no path to test.
 */
export async function requireWorkspaceId(): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo resolver el espacio de trabajo: ${error.message}`);
  }
  if (!data) {
    throw new Error("Tu usuario no tiene un espacio de trabajo asignado.");
  }

  return data.id;
}

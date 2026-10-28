import { useAuth } from "../auth/AuthProvider";
import { isAdmin } from "../data/api";
import { useLoad } from "../lib/hooks";

/** Whether the signed-in user is listed in admins/{uid}. `loading` is true until we know. */
export function useIsAdmin(): { admin: boolean; loading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const { data, loading } = useLoad(() => (uid ? isAdmin(uid) : Promise.resolve(false)), uid);
  return { admin: data === true, loading };
}

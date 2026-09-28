// The role the signed-in user chose to act as, sent to the API on every call.
// Kept per browser; storage can be unavailable (private mode), so failures
// just mean "use all my roles".
const KEY = "board-acting-role";

export function getActingRole(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActingRole(role: string | null) {
  try {
    if (role) localStorage.setItem(KEY, role);
    else localStorage.removeItem(KEY);
  } catch {
    // Ignore: the choice just won't be remembered.
  }
}

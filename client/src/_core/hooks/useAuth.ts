import { auth } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";
import { onIdTokenChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FirebaseSession = { user: FirebaseUser | null; tokenVerified: boolean };

// Tracks the Firebase Auth session; `undefined` until Firebase has restored it.
// Verification is read from the ID token itself, because the server checks the
// token's `email_verified` claim and `reload()` updates the user object before
// a fresh token exists.
function useFirebaseSession() {
  const [session, setSession] = useState<FirebaseSession | undefined>(undefined);
  useEffect(() => onIdTokenChanged(auth, async user => {
    const claims = user ? (await user.getIdTokenResult()).claims : null;
    setSession({ user, tokenVerified: claims?.email_verified === true });
  }), []);
  return session;
}

export function useAuth() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const session = useFirebaseSession();
  const firebaseUser = session?.user;
  const firebaseReady = session !== undefined;
  const verified = Boolean(session?.tokenVerified);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: firebaseReady && verified,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Re-resolve the app user whenever the signed-in account or its verification
  // state changes; reset() drops the previous answer so it never flashes.
  const sessionKey = firebaseReady ? `${firebaseUser?.uid ?? ""}:${verified}` : null;
  const previousSessionKey = useRef(sessionKey);
  useEffect(() => {
    const previous = previousSessionKey.current;
    previousSessionKey.current = sessionKey;
    if (previous !== null && sessionKey !== previous) void utils.auth.me.reset();
  }, [sessionKey, utils]);

  const logout = useCallback(async () => {
    await signOut(auth);
    // Drop every cached response so the next account never sees this one's data.
    queryClient.clear();
  }, [queryClient]);

  // Reloads the Firebase profile (e.g. after the user clicks the verification
  // link) and forces a fresh ID token carrying the new `email_verified` claim.
  const refresh = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    await utils.auth.me.invalidate();
  }, [utils]);

  const state = useMemo(() => {
    const user = verified ? meQuery.data ?? null : null;
    return {
      user,
      firebaseUser: firebaseUser ?? null,
      needsEmailVerification: Boolean(firebaseUser && !verified),
      loading: !firebaseReady || (verified && meQuery.isLoading),
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(user),
    };
  }, [firebaseUser, firebaseReady, verified, meQuery.data, meQuery.error, meQuery.isLoading]);

  return { ...state, refresh, logout };
}

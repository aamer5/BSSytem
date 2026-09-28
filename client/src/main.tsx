import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getActingRole } from "./lib/actingRole";
import { getIdToken } from "./lib/firebase";
import "./index.css";

const queryClient = new QueryClient();

// A rejected session (e.g. revoked Firebase token) refreshes auth.me so the
// workspace shell falls back to its sign-in screen.
const refreshAuthIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (error.message !== UNAUTHED_ERR_MSG) return;
  void queryClient.invalidateQueries({ queryKey: [["auth", "me"]] });
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    refreshAuthIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    refreshAuthIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      // Empty when the API shares the website's origin; set VITE_API_URL when
      // the API runs elsewhere (e.g. https://board-secretariat-api.onrender.com).
      url: `${(import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")}/api/trpc`,
      transformer: superjson,
      async headers() {
        const token = await getIdToken();
        const actingRole = getActingRole();
        return {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(actingRole ? { "x-acting-role": actingRole } : {}),
        };
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

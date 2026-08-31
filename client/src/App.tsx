import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { Route, Switch } from "wouter";
import Home from "@/pages/Home";
import Requests from "@/pages/Requests";
import NewRequest from "@/pages/NewRequest";
import RequestDetail from "@/pages/RequestDetail";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/NotFound";
export default function App() { return <ErrorBoundary><LocaleProvider><Toaster /><WorkspaceShell><Switch><Route path="/" component={Home} /><Route path="/requests" component={Requests} /><Route path="/requests/new" component={NewRequest} /><Route path="/requests/:id" component={RequestDetail} /><Route path="/admin" component={Admin} /><Route component={NotFound} /></Switch></WorkspaceShell></LocaleProvider></ErrorBoundary>; }

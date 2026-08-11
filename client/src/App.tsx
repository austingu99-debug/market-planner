import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AIAssistant from "./pages/AIAssistant";
import AIImport from "./pages/AIImport";
import Home from "./pages/Home";
import Resources from "./pages/Resources";
import Settings from "./pages/Settings";
import Timeline from "./pages/Timeline";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <AppShell>
          <Home />
        </AppShell>
      </Route>
      <Route path="/timeline">
        <AppShell>
          <Timeline />
        </AppShell>
      </Route>
      <Route path="/resources">
        <AppShell>
          <Resources />
        </AppShell>
      </Route>
      <Route path="/ai">
        <AppShell>
          <AIAssistant />
        </AppShell>
      </Route>
      <Route path="/ai-import">
        <AppShell>
          <AIImport />
        </AppShell>
      </Route>
      <Route path="/settings">
        <AppShell>
          <Settings />
        </AppShell>
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

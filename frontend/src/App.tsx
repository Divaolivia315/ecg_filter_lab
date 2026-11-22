import { AppProvider } from "./state";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}

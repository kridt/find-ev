import {
  Routes,
  Route,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import Home from "./pages/Home.jsx";
import EventDetails from "./pages/EventDetails.jsx";
import OddsLive from "./pages/OddsLive.tsx";
import EventOdds from "./pages/EventOdds.jsx";

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const showBack = location.pathname !== "/";
  return (
    <header className="sticky top-0 z-10 backdrop-blur bg-slate-900/70 border-b border-slate-800">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
          >
            ← Back
          </button>
        )}
        <Link to="/" className="text-lg font-semibold tracking-wide">
          League Event Count
        </Link>
        <Link
          to="/live"
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
        >
          + Live (WS) +{" "}
        </Link>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-full">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/events/:eventId" element={<EventDetails />} />
          <Route path="/live" element={<OddsLive />} />
          <Route path="/events/:eventId/odds" element={<EventOdds />} />
        </Routes>
      </main>
    </div>
  );
}

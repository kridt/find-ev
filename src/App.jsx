import { Routes, Route } from "react-router-dom";
import Shell from "./layouts/Shell.jsx";
import Home from "./pages/Home.jsx";
import EventOdds from "./pages/EventOdds.jsx";
import MyBets from "./pages/MyBets.jsx";

function NotFound() {
  return (
    <div className="py-10 text-center text-slate-300">
      <div className="text-2xl font-semibold">404</div>
      <div className="mt-2">Siden blev ikke fundet.</div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Alt indhold rendres inde i Shell (som har top-navigation + container) */}
      <Route element={<Shell />}>
        <Route path="/" element={<Home />} />
        <Route path="/events/:id/odds" element={<EventOdds />} />
        <Route path="/my-bets" element={<MyBets />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

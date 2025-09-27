import { Outlet } from "react-router-dom";
import NavBar from "../components/NavBar.jsx";

export default function Shell() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NavBar />
      {/* Centrér alt indhold, max bredde */}
      <main className="mx-auto w-full max-w-5xl px-3 md:px-6 py-4">
        <Outlet />
      </main>
    </div>
  );
}

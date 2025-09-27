import { useState } from "react";
import { NavLink, Link } from "react-router-dom";

const linkBase =
  "block px-3 py-2 rounded-md text-sm font-medium transition-colors";
const linkActive = "bg-emerald-600 text-white";
const linkIdle =
  "text-slate-200 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700";

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <div className="mx-auto max-w-5xl px-3 md:px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-600" />
            <div className="font-semibold tracking-wide">EV Betting</div>
          </Link>

          {/* Desktop menu */}
          <nav className="hidden md:flex items-center gap-2">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              Ligaer
            </NavLink>
            <NavLink
              to="/my-bets"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkIdle}`
              }
            >
              My Bets
            </NavLink>
          </nav>

          {/* Burger */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-200 hover:bg-slate-800"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div className="md:hidden pb-3">
            <nav className="space-y-1">
              <NavLink
                to="/"
                end
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `${linkBase} ${isActive ? linkActive : linkIdle}`
                }
              >
                Ligaer
              </NavLink>
              <NavLink
                to="/my-bets"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `${linkBase} ${isActive ? linkActive : linkIdle}`
                }
              >
                My Bets
              </NavLink>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

import { useLocation, useParams } from "react-router-dom";
import { useMemo } from "react";

export default function EventDetails() {
  const { eventId } = useParams();
  const location = useLocation();
  const event = location.state?.event; // kan være undefined ved direkte besøg

  const href = useMemo(() => window.location.href, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Event</h1>

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-sm">
          <span className="opacity-70">Event ID:</span>{" "}
          <code>{String(eventId)}</code>
        </div>
        <div className="text-sm mt-2">
          <span className="opacity-70">URL:</span>{" "}
          <span className="break-all">{href}</span>
        </div>
      </div>

      {event ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="font-semibold mb-2">
            Event data (fra forrige side):
          </div>
          <pre className="text-xs whitespace-pre-wrap break-all">
            {JSON.stringify(event, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="text-sm opacity-80">
          Ingen event-data blev sendt med. Du kan bruge <code>eventId</code>{" "}
          direkte i dine egne kald/WS.
        </div>
      )}
    </div>
  );
}

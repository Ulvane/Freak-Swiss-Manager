import type { VisitorTelemetry } from "@/lib/anti-abuse";

export function BannedScreen({
  telemetry,
}: {
  telemetry: Partial<VisitorTelemetry> & { ip: string };
}) {
  const location = [telemetry.city, telemetry.region, telemetry.country]
    .filter(Boolean)
    .join(", ");

  const coordinates =
    telemetry.latitude && telemetry.longitude
      ? `${telemetry.latitude}, ${telemetry.longitude}`
      : telemetry.latitude || telemetry.longitude || null;

  return (
    <div className="banned-screen min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-8 bg-zinc-950 text-zinc-100 font-mono select-none">
      <div className="w-full max-w-lg border border-red-700/60 bg-zinc-900/90 rounded-lg shadow-2xl p-6 sm:p-8 space-y-6 text-center">
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 bg-red-950/80 border border-red-800 text-red-400 text-xs font-bold uppercase tracking-widest rounded">
            Security Enforcement
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-red-500 tracking-tight uppercase">
            YOU ARE BANNED
          </h1>
          <p className="text-sm sm:text-base text-zinc-300">
            Your access to this site has been blocked.
          </p>
        </div>

        <div className="bg-black/60 border border-zinc-800 rounded p-4 text-left space-y-2 text-xs sm:text-sm">
          <div className="flex justify-between border-b border-zinc-800/80 pb-1">
            <span className="text-zinc-500">Current IP:</span>
            <span className="font-semibold text-zinc-200">{telemetry.ip}</span>
          </div>
          {location ? (
            <div className="flex justify-between border-b border-zinc-800/80 pb-1">
              <span className="text-zinc-500">Location:</span>
              <span className="text-zinc-300">{location}</span>
            </div>
          ) : null}
          {coordinates ? (
            <div className="flex justify-between border-b border-zinc-800/80 pb-1">
              <span className="text-zinc-500">Coordinates:</span>
              <span className="text-zinc-300 font-mono">{coordinates}</span>
            </div>
          ) : null}
          {telemetry.path ? (
            <div className="flex justify-between border-b border-zinc-800/80 pb-1">
              <span className="text-zinc-500">Path:</span>
              <span className="text-zinc-300 truncate max-w-[240px]">
                {telemetry.path}
              </span>
            </div>
          ) : null}
          {telemetry.userAgent ? (
            <div className="pt-1">
              <span className="text-zinc-500 block text-xs">Client:</span>
              <span className="text-zinc-400 text-xs break-all line-clamp-2">
                {telemetry.userAgent}
              </span>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-zinc-500 leading-relaxed">
          Security information may be retained and shared with authorities where legally required.
        </p>
      </div>
    </div>
  );
}

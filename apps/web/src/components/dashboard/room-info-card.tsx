import type { RoomInfo } from "@/lib/highrise-webapi";

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

export function RoomInfoCard({ room, roomId }: { room: RoomInfo | null; roomId: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-paper/10 bg-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-paper">Room</h2>
        {room && (
          <span className="inline-flex items-center gap-1.5 font-ui-mono text-xs text-dust">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-400" />
            {room.numConnected} {room.numConnected === 1 ? "person" : "people"} online now
          </span>
        )}
      </div>

      {room ? (
        <div className="mt-3">
          <p className="font-display text-lg text-paper">{room.name}</p>
          {room.description && (
            <p className="mt-1 text-sm text-dust">{room.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-ui-mono text-xs text-dust uppercase tracking-[0.1em]">
            <span>{humanize(room.category)}</span>
            <span>{humanize(room.accessPolicy)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-dust">
          Couldn&apos;t load room details from Highrise right now — the bot
          still runs off room ID{" "}
          <span className="font-ui-mono text-paper">{roomId}</span> regardless.
        </p>
      )}
    </div>
  );
}

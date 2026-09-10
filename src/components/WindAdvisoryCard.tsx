import type { SoundingRecord } from "@/lib/types";

interface WindAdvisoryCardProps {
  sounding: SoundingRecord | null;
}

export default function WindAdvisoryCard({ sounding }: WindAdvisoryCardProps) {
  if (!sounding?.onshoreFlowNearInversion) return null;

  return (
    <div className="w-full max-w-xs rounded-lg border border-sky-200 bg-sky-50/95 p-2.5 text-xs text-sky-900 shadow-md backdrop-blur dark:border-sky-800 dark:bg-sky-950/95 dark:text-sky-200">
      Onshore flow near the inversion top may be pushing the marine layer higher on windward ridges
      than this flat-plane estimate shows.
    </div>
  );
}

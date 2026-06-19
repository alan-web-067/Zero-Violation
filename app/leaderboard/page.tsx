import dynamic from "next/dynamic";
const LeaderboardClient = dynamic(() => import("./LeaderboardClient"), { ssr: false });
export default function Page() { return <LeaderboardClient />; }

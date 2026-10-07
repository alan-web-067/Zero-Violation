"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const LeaderboardClient = dynamic(() => import("./LeaderboardClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <LeaderboardClient />; }

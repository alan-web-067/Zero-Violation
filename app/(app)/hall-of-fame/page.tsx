"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const HallOfFameClient = dynamic(() => import("./HallOfFameClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <HallOfFameClient />; }

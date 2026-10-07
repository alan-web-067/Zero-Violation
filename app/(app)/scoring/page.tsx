"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const ScoringClient = dynamic(() => import("./ScoringClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <ScoringClient />; }

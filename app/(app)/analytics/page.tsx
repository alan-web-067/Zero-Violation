"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const AnalyticsClient = dynamic(() => import("./AnalyticsClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <AnalyticsClient />; }

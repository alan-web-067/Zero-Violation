"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const ReportsClient = dynamic(() => import("./ReportsClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <ReportsClient />; }

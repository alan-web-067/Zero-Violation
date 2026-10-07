"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const DashboardClient = dynamic(() => import("./DashboardClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <DashboardClient />; }

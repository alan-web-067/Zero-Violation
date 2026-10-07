"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const AdminClient = dynamic(() => import("./AdminClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <AdminClient />; }

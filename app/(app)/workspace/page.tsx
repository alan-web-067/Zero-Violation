"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const WorkspaceClient = dynamic(() => import("./WorkspaceClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <WorkspaceClient />; }

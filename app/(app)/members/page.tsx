"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const MembersClient = dynamic(() => import("./MembersClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <MembersClient />; }

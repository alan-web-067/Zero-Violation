"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const BlockProfileClient = dynamic(() => import("./BlockProfileClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <BlockProfileClient />; }

"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const LookupClient = dynamic(() => import("./LookupClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <LookupClient />; }

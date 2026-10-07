"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const EventsClient = dynamic(() => import("./EventsClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <EventsClient />; }

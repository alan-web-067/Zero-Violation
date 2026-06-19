"use client";
import dynamic from "next/dynamic";
const EventsClient = dynamic(() => import("./EventsClient"), { ssr: false });
export default function Page() { return <EventsClient />; }

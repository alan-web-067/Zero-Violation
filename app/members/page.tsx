"use client";
import dynamic from "next/dynamic";
const MembersClient = dynamic(() => import("./MembersClient"), { ssr: false });
export default function Page() { return <MembersClient />; }

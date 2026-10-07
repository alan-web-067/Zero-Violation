"use client";
import dynamic from "next/dynamic";
const ScoringClient = dynamic(() => import("./ScoringClient"), { ssr: false });
export default function Page() { return <ScoringClient />; }

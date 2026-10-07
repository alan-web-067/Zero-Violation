"use client";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const CertificateClient = dynamic(() => import("./CertificateClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <Suspense fallback={<PageSkeleton />}><CertificateClient /></Suspense>; }

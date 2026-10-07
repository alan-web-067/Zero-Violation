"use client";
import dynamic from "next/dynamic";
import PageSkeleton from "@/components/PageSkeleton";
const UserManagementClient = dynamic(() => import("./UserManagementClient"), { ssr: false, loading: () => <PageSkeleton /> });
export default function Page() { return <UserManagementClient />; }

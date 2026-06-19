import dynamic from "next/dynamic";
const WorkspaceClient = dynamic(() => import("./WorkspaceClient"), { ssr: false });
export default function Page() { return <WorkspaceClient />; }

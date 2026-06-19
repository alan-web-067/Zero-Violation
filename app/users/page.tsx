import dynamic from "next/dynamic";
const UserManagementClient = dynamic(() => import("./UserManagementClient"), { ssr: false });
export default function Page() { return <UserManagementClient />; }

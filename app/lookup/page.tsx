import dynamic from "next/dynamic";
const LookupClient = dynamic(() => import("./LookupClient"), { ssr: false });
export default function Page() { return <LookupClient />; }

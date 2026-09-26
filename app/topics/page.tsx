import Link from "next/link";
import { getPublicTopics } from "@/publications/public-query";
export default async function TopicsPage() { const topics = await getPublicTopics(); return <main className="shell"><header className="masthead"><p className="eyebrow">Dispatch archive</p><h1>Topics</h1></header><ul className="topic-list">{topics.map((topic) => <li key={topic}><Link href={`/topics/${encodeURIComponent(topic)}`}>{topic}</Link></li>)}</ul></main>; }

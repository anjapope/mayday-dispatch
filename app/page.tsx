import { browsePublications } from "@/publications/public-query";
import { DispatchMapExperience } from "./dispatch-map-experience";

export default async function HomePage() {
  const publications = await browsePublications();

  return (
    <main className="shell public-home">
      {publications.length > 0 && <DispatchMapExperience publications={publications} />}
    </main>
  );
}

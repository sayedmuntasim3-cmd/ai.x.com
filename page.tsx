import type { Metadata } from "next";
import Landing from "./src/landing";

export const metadata: Metadata = {
  title: "Zupona AI — Create your own documentary",
  description:
    "Turn your ideas into stunning, cinematic documentaries in minutes. Describe an idea or bring your own voiceover, then shape the length, audience, style and music.",
  alternates: { canonical: "https://ai.zupona.com" },
};

export default function ZuponaAiLandingPage() {
  return <Landing />;
}

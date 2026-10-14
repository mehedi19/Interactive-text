import ArgonHero from "@/components/ArgonHero";

export default function HomePage() {
  return (
    <main className="min-h-screen w-full overflow-hidden bg-[#010926]">
      <ArgonHero
        initialText="AI"
        initialDistortion={1.2}
        initialFrostiness={1.08}
        initialGrain={1}
        initialParticles={190}
      />
    </main>
  );
}

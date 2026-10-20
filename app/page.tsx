import { notFound } from "next/navigation";
import { FinalCta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Navbar } from "@/components/landing/navbar";
import { PhoneMockup } from "@/components/landing/phone-mockup";
import { Pricing } from "@/components/landing/pricing";
import { ValueStrip } from "@/components/landing/value-strip";
import { getPublicTenant, listTenantSummaries } from "@/lib/data/tenants";

export default function LandingPage() {
  const examples = listTenantSummaries();
  const featured = getPublicTenant(examples[0]?.slug ?? "");
  if (!featured) notFound();

  return (
    <>
      <Navbar />
      <main>
        <Hero phone={<PhoneMockup tenant={featured} />} examples={examples} />
        <ValueStrip />
        <HowItWorks examples={examples} />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

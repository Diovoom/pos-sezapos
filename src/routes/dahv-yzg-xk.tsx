import { createFileRoute } from "@tanstack/react-router";
import heroAsset from "@/assets/dahv-hero.png.asset.json";
import avaAsset from "@/assets/dahv-ava.png.asset.json";
import collageAsset from "@/assets/dahv-collage.png.asset.json";
import "./dahv-yzg-xk.css";

export const Route = createFileRoute("/dahv-yzg-xk")({
  head: () => ({
    meta: [
      { title: "Kijan pou resevwa cheve gratis — Keyy Beauty" },
      {
        name: "description",
        content: "Gid Keyy Beauty pou Amazon wig reviews ak kolaborasyon.",
      },
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { property: "og:title", content: "Kijan pou resevwa cheve gratis — Keyy Beauty" },
      {
        property: "og:description",
        content: "Gid Keyy Beauty pou Amazon wig reviews ak kolaborasyon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KeyyBeautyGuide,
});

function Heart({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={`dahv-heart absolute ${className}`}>
      ♥
    </span>
  );
}

function KeyyBeautyGuide() {
  return (
    <main className="dahv-page w-full overflow-x-hidden font-sans">
      <section className="dahv-dark dahv-hero relative isolate min-h-[100svh] overflow-hidden">
        <Heart className="dahv-float left-[7%] top-[66%] text-4xl" />
        <Heart className="dahv-float-delayed right-[9%] top-[12%] text-2xl" />
        <div className="mx-auto grid min-h-[100svh] max-w-[1280px] items-center gap-8 px-6 py-12 sm:px-12 lg:grid-cols-[0.9fr_1.1fr] lg:px-[7%]">
          <div className="relative z-10 flex flex-col items-start">
            <p className="dahv-kicker text-sm font-semibold uppercase sm:text-base">WIG REVIEWS</p>
            <h1 className="mt-9 max-w-[620px] text-[clamp(3.4rem,10vw,6.7rem)] font-bold leading-[1.08] tracking-[0] lg:mt-20">
              Kijan pou<br />resevwa cheve<br />gratis
            </h1>
            <p className="dahv-pill mt-12 rounded-full px-5 py-2 text-[clamp(1.45rem,4vw,2.4rem)] font-bold lg:mt-20">
              By: Keyy beauty
            </p>
          </div>
          <img
            src={heroAsset.url}
            alt="Koleksyon perik nan ton mawon, blond ak nwa"
            className="mx-auto hidden max-h-[82svh] w-full max-w-[560px] object-contain lg:block"
          />
        </div>
      </section>

      <section className="dahv-light flex min-h-[72svh] items-center px-5 py-16 sm:px-10 lg:min-h-[720px]">
        <div className="mx-auto w-full max-w-[1120px] text-center">
          <h2 className="text-3xl font-bold tracking-[0] sm:text-4xl">introduction</h2>
          <p className="mx-auto mt-5 max-w-5xl text-xl leading-relaxed sm:text-2xl">
            Byenvini nan gid sa a ki pral montre w egzakteman kijan ou ka vinn tounen<br className="hidden md:block" /> reviewer epi kòmanse resevwa wigs,bundles<br className="hidden md:block" /> ak lòt pwodwi cheve gratis pou selman yon kòmantè sou Amazon.
          </p>
          <h3 className="mx-auto mt-8 max-w-4xl text-[clamp(2.35rem,6vw,4rem)] font-bold leading-tight tracking-[0]">
            Amazon pa bay pwodwi gratis<br className="hidden sm:block" /> dirèkteman.sa ki pase a se:
          </h3>
          <ul className="mx-auto mt-7 max-w-5xl list-disc space-y-2 pl-7 text-left text-xl leading-relaxed sm:text-2xl">
            <li>Seller yo bezwen review oswa videyo pou vann plis</li>
            <li>Yo chèche moun pou yo kapab fè yon kolaborasyon yap baw pwodwi a gratis pou yon kòmantè</li>
          </ul>
        </div>
      </section>

      <section className="dahv-dark relative overflow-hidden px-5 py-14 sm:px-10 lg:min-h-[720px]">
        <Heart className="dahv-float right-[3%] top-8 text-5xl" />
        <div className="mx-auto max-w-[1220px]">
          <h2 className="text-center text-[clamp(3rem,7vw,5.2rem)] font-bold leading-none tracking-[0]">komanse la</h2>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-center">
            <div className="text-lg leading-relaxed sm:text-xl">
              <h3 className="mb-4 font-bold">kijan pou resevwa cheve gratis?</h3>
              <ul className="list-disc space-y-1 pl-7">
                <li>kijan pou w resevwa pwodwi gratis pou yon kòmantè</li>
                <li>kijan pou ekri mesaj ki fè yo reponn ou</li>
                <li>Horaire seller yo kilè yo travay</li>
                <li>ki policy seller yo mande sak bon ak sa ki pa bon</li>
                <li>kijan pouw fè review</li>
                <li>wap jwenn plus ke 160 Amazon wig seller pou kolaborasyon</li>
              </ul>
              <p className="mt-4">pouw resevwa cheve gratis ak lot pwodwi ou dwe gen 4 applikasyon sa yo</p>
              <p className="mt-2 text-xl sm:text-2xl">1-Instagram&nbsp; 2-Amazon&nbsp; 3-Paypal&nbsp; 4-Chat Gpt</p>
              <ul className="mt-4 list-disc space-y-1 pl-7">
                <li>instagram se seller mwen pral baw ou yo avec mesaj pouw ekri seller yo epi lè yo reponn pouw kapab fè kolaboration e achte pwodui yo sou Amazon.</li>
                <li>Amazon se pouw kapab resevwa pwodwi a epou seller a ka few achte nan store li a</li>
                <li>Paypal se pouw kapab resevwa lajan seller a pral revoye pou an e gras ak email ou pral kreye lan se li wap bay selman</li>
                <li>Chat Gpt se pouw kapab utilize google traduction siw pa pale anglais</li>
              </ul>
            </div>
            <figure className="mx-auto w-full max-w-[340px] rounded-[22px] border-2 border-current p-4 sm:p-5">
              <figcaption className="py-3 text-center text-2xl font-bold">Ava</figcaption>
              <img src={avaAsset.url} alt="Ava, beauty influencer" className="mt-3 aspect-square w-full rounded-[18px] object-cover" />
              <p className="px-2 py-7 text-center text-lg leading-snug">Beauty Influencer and Stylist at<br />Chic Wigs</p>
            </figure>
          </div>
        </div>
      </section>

      <section className="dahv-light flex min-h-[720px] items-center px-5 py-16 sm:px-10">
        <div className="mx-auto w-full max-w-[1250px] text-center">
          <h2 className="text-[clamp(2.6rem,6vw,4.2rem)] font-bold leading-tight tracking-[0]">kijan pouw kontakte seller yo ?</h2>
          <p className="mx-auto mt-14 max-w-5xl text-[clamp(1.4rem,3vw,2rem)] font-bold leading-snug">
            ou kapab kontakte seller yo sou instagram avek lis seller mwen<br className="hidden md:block" /> pral voye pou ou yo wap kontakte seller yo ak&nbsp; mesaj sa👇
          </p>
          <div className="mx-auto mt-14 max-w-[1240px] text-[clamp(1.25rem,2.4vw,1.8rem)] leading-[1.35]">
            <p>Hello,</p>
            <p>My name is (mete non w) and I am a hair and Amazon wig reviewer based in the United States,I<br className="hidden lg:block" /> came across your wigs and truly love their quality and style.</p>
            <p>Iwould be existed to collaborate with your brand. Ican provide honest 5-star reviews,create<br className="hidden lg:block" /> high-quality video content,and take professional photos showcasing your products.</p>
            <p>I believe this partnership woul be beneficial for both of us by increasing visibility and sales for<br className="hidden lg:block" /> your brand.</p>
            <p>thank you for considering my request.Ilook forward to the opportunity to work together.</p>
          </div>
        </div>
      </section>

      <section className="dahv-dark flex min-h-[720px] items-center px-5 py-14 sm:px-10">
        <div className="mx-auto grid w-full max-w-[1220px] gap-10 lg:grid-cols-[1.35fr_0.65fr]">
          <div>
            <h2 className="text-[clamp(3rem,7vw,5rem)] font-bold leading-none tracking-[0]">Horraire seller yo</h2>
            <p className="mt-10 text-center text-[clamp(1.4rem,3vw,2rem)] leading-relaxed">
              seller yo ap viv en chine e se chinois yo ye sa<br className="hidden sm:block" /> vle di kisa?<br /> yo pa gen menm l’heure avec nou yo gen 12h<br className="hidden sm:block" /> de temps en plus nou
            </p>
            <h3 className="mt-12 text-center text-[clamp(1.8rem,4vw,2.5rem)] font-bold">kile ou kapab kontakte seller yo?</h3>
            <p className="mt-10 text-center text-[clamp(1.35rem,3vw,1.85rem)] leading-relaxed">
              Seller yo komanse travay Dimanch swa yo plis online a 8h sa vle di 8h nan aswè pou ou e 8h nan matin pou seller yo lèw ekri yo nan matin nan lè USA a yo ka pa reponn paske c lè yap domi.
            </p>
          </div>
          <div className="flex flex-col justify-between gap-10">
            <p className="mx-auto max-w-[350px] text-lg leading-tight">Join us for exclusive wig reviews<br />and collaborations that celebrate<br />beauty and confidence in every<br />style.</p>
            <img src={collageAsset.url} alt="Kolaj modèl ak diferan koulè perik" className="w-full rounded-[18px] object-cover" />
          </div>
        </div>
      </section>

      <section className="dahv-light flex min-h-[720px] items-center px-5 py-16 sm:px-10">
        <div className="mx-auto w-full max-w-[1250px]">
          <h2 className="text-[clamp(4rem,9vw,6rem)] font-bold leading-none tracking-[0]">policy</h2>
          <p className="mt-12 text-[clamp(1.4rem,3vw,2rem)]">Mwen pral moutrew ki seller pou w dako ak policy l yo</p>
          <div className="mt-28 text-[clamp(1.4rem,3vw,2rem)] leading-relaxed sm:ml-5">
            <p>Half refund after Shipping✅ half after review✅</p>
            <p>Full refund after review❌</p>
            <p>Full refund after order number✅</p>
            <p>Full refund after Shipping✅</p>
            <p className="mt-2 max-w-5xl text-center">Si ou ta achte yon cheve seller a fe 1 semaine ou pa janm tandel return cheve a</p>
          </div>
        </div>
      </section>

    </main>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "./dahv-yzg-xk.css";

const heroImage = "/keyy-beauty/pink-front.jpg";
const blondeImage = "/keyy-beauty/blonde-glam.jpg";
const middlePartImage = "/keyy-beauty/middle-part.jpg";
const curlyImage = "/keyy-beauty/curly-side.jpg";
const straightImage = "/keyy-beauty/straight-pony.jpg";
const curlyFrontalImage = "/keyy-beauty/curly-frontal.jpg";
const volumeCurlsImage = "/keyy-beauty/volume-curls.jpg";

export const Route = createFileRoute("/dahv-yzg-xk")({
  head: () => ({
    meta: [
      { title: "Gid Kolaborasyon Perik — Keyy Beauty" },
      {
        name: "description",
        content:
          "Yon gid an kreyòl pou kontakte seller yo, konprann kolaborasyon an, ak suiv etap yo pou resevwa cheve.",
      },
      { name: "robots", content: "noindex, nofollow, noarchive, nosnippet" },
      { property: "og:title", content: "Gid Kolaborasyon Perik — Keyy Beauty" },
      {
        property: "og:description",
        content:
          "Yon gid an kreyòl pou kontakte seller yo, konprann kolaborasyon an, ak suiv etap yo pou resevwa cheve.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#fff2f8" },
    ],
    links: [{ rel: "canonical", href: "https://keyybeauty.sezapos.com/" }],
  }),
  component: KeyyBeautyGuide,
});

function FloatingHeart({ className = "", children = "♥" }: { className?: string; children?: string }) {
  return (
    <span aria-hidden="true" className={`dahv-heart dahv-float absolute select-none ${className}`}>
      {children}
    </span>
  );
}

function SectionBadge({ children }: { children: ReactNode }) {
  return <span className="dahv-badge">{children}</span>;
}

export function KeyyBeautyGuide() {
  return (
    <main className="dahv-page">
      <section className="dahv-hero-section">
        <FloatingHeart className="left-[5%] top-[10%] text-4xl sm:text-5xl" />
        <FloatingHeart className="right-[8%] top-[14%] text-3xl sm:text-4xl">♡</FloatingHeart>
        <FloatingHeart className="bottom-[7%] left-[10%] text-3xl">✦</FloatingHeart>

        <div className="dahv-shell dahv-hero-grid">
          <div className="relative z-10 dahv-hero-copy">
            <SectionBadge>KEYY BEAUTY • BESTIE GUIDE</SectionBadge>

            <h1 className="dahv-display mt-7">
              Kijan pou resevwa
              <br />
              cheve gratis
            </h1>

            <p className="dahv-lead mt-7 max-w-2xl">
              Tout sa ou bezwen konnen pou kontakte seller yo, prezante tèt ou byen,
              epi suiv etap kolaborasyon an san w pa konfonn.
            </p>

            <div className="mt-8 inline-flex items-center gap-3 rounded-full bg-white px-5 py-3 shadow-sm">
              <span className="text-2xl">💗</span>
              <span className="font-semibold text-pink-700">By: Keyy Beauty</span>
            </div>
          </div>

          <div className="relative dahv-hero-visual">
            <div className="dahv-photo-frame dahv-hero-photo">
              <img src={heroImage} alt="Perik woz ak boukl" className="h-full w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      <section className="dahv-lookbook">
        <div className="dahv-shell">
          <div className="dahv-lookbook-heading">
            <div>
              <SectionBadge>KEYY BEAUTY</SectionBadge>
              <h2 className="dahv-heading mt-5">Bèl cheve. Bèl kontni. Bèl kolaborasyon.</h2>
            </div>
            <p className="dahv-body">
              Lè w prezante tèt ou byen epi w suiv etap seller la, tout bagay vin pi fasil.
            </p>
          </div>
          <div className="dahv-editorial-grid mt-10">
            <img src={blondeImage} alt="Cheve blond ondile" />
            <img src={middlePartImage} alt="Cheve nwa ak raie nan mitan" />
            <img src={curlyImage} alt="Cheve nwa boukle" />
            <img src={volumeCurlsImage} alt="Cheve ak gwo boukl" />
          </div>
        </div>
      </section>

      <section className="dahv-section dahv-section-pink">
        <div className="dahv-shell">
          <div className="text-center">
            <SectionBadge>MESAJ POU SELLER</SectionBadge>
            <h2 className="dahv-heading mt-5">Premye bagay la: ekri seller yo</h2>
            <p className="dahv-body mx-auto mt-5 max-w-3xl">
              Pran mesaj sa a menm jan an, kopye li, epi voye li bay seller yo.
            </p>
          </div>

          <div className="dahv-message mt-9">
            <p>Hello,</p>
            <p>
              My name is <strong>(mete non w)</strong> and I am a hair and Amazon wig reviewer
              based in the United States. I came across your wigs and truly love their quality and style.
            </p>
            <p>
              I would be excited to collaborate with your brand. I can provide honest reviews,
              create high-quality video content, and take professional photos showcasing your products.
            </p>
            <p>
              I believe this partnership would be beneficial for both of us by increasing visibility
              and sales for your brand.
            </p>
            <p>
              Thank you for considering my request. I look forward to the opportunity to work together.
            </p>
          </div>
        </div>
      </section>

      <section className="dahv-section dahv-section-white">
        <div className="dahv-shell max-w-6xl">
          <div className="text-center">
            <SectionBadge>ENPÒTAN</SectionBadge>
            <h2 className="dahv-heading mt-5">Men kijan sa konn pase apre yo reponn ou</h2>
          </div>

          <div className="dahv-important-steps mt-10">
            <div className="dahv-step-card">
              <div className="dahv-step-number">1</div>
              <p>
                Premye bagay pou w fè se ekri seller yo ak mesaj mwen te ba ou a. Jis kopye mesaj la epi voye l bay seller yo. Pi bon lè pou kontakte yo se anviwon <strong>8è oswa 9è nan aswè, lè Etazini</strong>.
              </p>
            </div>

            <div className="dahv-step-card">
              <div className="dahv-step-number">2</div>
              <p>
                Lè seller la reponn ou, premye bagay li ka mande w se <strong>pwofil Amazon ou</strong> pou li ka verifye l epi deside si li kapab kolabore avè w.
              </p>
            </div>

            <div className="dahv-step-card">
              <div className="dahv-step-number">3</div>
              <p>
                Apre sa, seller la ap eksplike w kondisyon kolaborasyon an. Pa egzanp, li ka di w li fè <strong>mwatye peman an apre pwodwi a fin ekspedye</strong>. Li ka voye yon <strong>mo kle (keyword)</strong> ba ou pou w al chèche cheve li vle voye a sou Amazon. <strong>Anvan ou pase kòmann lan</strong>, voye foto oswa lyen pwodwi ou jwenn lan bay seller la pou li konfime se bon cheve a.
              </p>
            </div>

            <div className="dahv-step-card">
              <div className="dahv-step-number">4</div>
              <p>
                Lè w fin pase kòmann lan, voye <strong>nimewo kòmann lan</strong> ba li. Lè pwodwi a fin ekspedye, sa k ap pase apre sa ap depann de kondisyon nou te dakò sou yo. Si peman an dwe fèt atravè PayPal, seller la ka mande w <strong>adrès imèl PayPal ou</strong> pou li kapab voye peman an ba ou.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="dahv-visual-break">
        <div className="dahv-shell dahv-visual-break-grid">
          <div className="dahv-collage">
            <img className="dahv-collage-main" src={curlyFrontalImage} alt="Cheve nwa boukle ak frontal" />
            <img className="dahv-collage-small dahv-collage-small-one" src={straightImage} alt="Cheve long dwat" />
            <img className="dahv-collage-small dahv-collage-small-two" src={heroImage} alt="Cheve woz" />
          </div>
          <div className="dahv-visual-copy">
            <span className="dahv-script">Bestie, sonje sa ♡</span>
            <h2 className="dahv-heading mt-4">Toujou verifye pwodwi a anvan ou pase kòmann lan.</h2>
            <p className="dahv-body mt-6">
              Lè seller la voye keyword la, chèche cheve a sou Amazon epi voye foto oswa lyen an ba li pou li konfime se bon pwodwi a.
            </p>
          </div>
        </div>
      </section>

      <section className="dahv-section dahv-section-white">
        <div className="dahv-shell max-w-6xl">
          <div className="text-center">
            <SectionBadge>KONDISYON</SectionBadge>
            <h2 className="dahv-heading mt-5">Li kondisyon seller la byen anvan ou kontinye</h2>
            <p className="dahv-body mx-auto mt-5 max-w-4xl">
              Chak seller ka gen fason pa li pou fè kolaborasyon an. Men sa pou w veye pandan konvèsasyon an.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <article className="dahv-policy-card dahv-policy-good">
              <div className="text-3xl">💗</div>
              <h3>Sa seller la ka mande</h3>
              <ul>
                <li>Yo verifye pwofil Amazon ou anvan yo deside si yo ka kolabore avè w.</li>
                <li>Yo ka voye mo kle a (keyword) pou w chèche pwodwi a.</li>
                <li>Yo ka mande w voye foto pwodwi a anvan ou pase kòmann lan, pou yo verifye si se li.</li>
                <li>Yo ka mande nimewo kòmann lan apre ou fin pase kòmann lan.</li>
                <li>Yo ka mande imèl PayPal la selon kondisyon yo te ba ou.</li>
              </ul>
            </article>

            <article className="dahv-policy-card dahv-policy-bad">
              <div className="text-3xl">🎀</div>
              <h3>Sa pou w sonje</h3>
              <ul>
                <li>Li mesaj seller la byen pou w ka konprann kondisyon li bay yo.</li>
                <li>Toujou voye pwodwi a tounen ba li nan chat la pou verifye si se menm cheve a.</li>
                <li>Kenbe screenshot tout sa yo di w nan konvèsasyon an.</li>
                <li>Si yo mande imèl PayPal ou, voye bon adrès imèl la san fot.</li>
                <li>Suiv etap yo youn apre lòt pou pa fè erè pandan kolaborasyon an.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="dahv-finale">
        <FloatingHeart className="left-[8%] top-[18%] text-4xl" />
        <FloatingHeart className="right-[10%] bottom-[20%] text-5xl">♡</FloatingHeart>
        <div className="dahv-shell max-w-4xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-pink-500">FINI 💕</p>
          <h2 className="dahv-display mt-6 text-pink-800">
            Mèsi paske ou li
            <br />
            epi ou konprann
            <br />
            tout sa ki ekri
          </h2>
          <p className="mt-8 text-3xl font-bold text-pink-600 sm:text-4xl">BESTIE 💗💗💗💗💗</p>
        </div>
      </section>
    </main>
  );
}

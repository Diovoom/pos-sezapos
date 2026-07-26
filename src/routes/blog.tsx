import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { Newspaper } from "lucide-react";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog  -  SEZA POS" },
      {
        name: "description",
        content:
          "Product updates, release notes, and articles for independent retailers from the SEZA POS team.",
      },
      { property: "og:title", content: "SEZA POS  -  Blog" },
      {
        property: "og:description",
        content: "Product updates and articles for independent retailers.",
      },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  return (
    <MarketingShell>
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 grid place-items-center">
          <Newspaper className="h-6 w-6 text-primary" />
        </div>
        <p className="mt-4 text-sm font-medium text-primary uppercase tracking-wide">Blog</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">
          Product updates and retail insights.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Our blog is launching soon. We'll publish product release notes, guides for independent
          retailers, and behind-the-scenes engineering notes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Button asChild>
            <Link to="/signup">Start free trial</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/contact">Get notified at launch</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}

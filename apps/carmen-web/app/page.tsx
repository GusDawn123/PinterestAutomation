import Link from "next/link";
import { ArrowRight, CalendarClock, ImageIcon, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

const features = [
  {
    icon: Sparkles,
    title: "Claude-drafted blog posts",
    body: "Trending keyword research, SEO-ready drafts, and affiliate blocks in one click.",
  },
  {
    icon: ImageIcon,
    title: "Pin composition studio",
    body: "Upload visuals, pick copy variations, and ship them to Pinterest with alt-text ready.",
  },
  {
    icon: CalendarClock,
    title: "Smart scheduling",
    body: "Best posting times inferred from real board analytics — never post into the void.",
  },
];

export default function Home() {
  return (
    <>
      <div className="relative isolate overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl"
          >
            <div
              className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary/40 to-primary/10 opacity-40 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
              style={{
                clipPath:
                  "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
              }}
            />
          </div>

          <div className="mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24 lg:px-8 lg:pt-32">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                Pinterest automation, calmed down
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                Pinterest Cockpit
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                Carmen&apos;s workflow control center. Draft, compose, and schedule — with
                a Claude pilot at every step and you in the approval chair.
              </p>
              <div className="mt-10 flex items-center justify-center gap-4">
                <Button asChild size="lg" className="gap-2">
                  <Link href="/dashboard">
                    Open dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
              {features.map((f) => (
                <Card key={f.title} className="bg-card/60 backdrop-blur">
                  <CardContent className="flex flex-col items-start gap-3 py-6">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <f.icon className="h-4 w-4" />
                    </span>
                    <h3 className="text-base font-semibold">{f.title}</h3>
                    <p className="text-sm text-muted-foreground">{f.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
    </>
  );
}

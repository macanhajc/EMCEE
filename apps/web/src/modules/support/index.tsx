import { useTranslations } from "next-intl";
import { Button } from "@/components/UI/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/UI/accordion";
import { SiteFooter } from "@/components/Elements/site-footer";
import { SiteNav } from "@/components/Elements/site-nav";

const SUPPORT_EMAIL = "support@botmarket.app";

type FaqEntry = { question: string; answer: string };

export function SupportTemplate() {
  const t = useTranslations("support");
  const faq = t.raw("faq") as FaqEntry[];

  return (
    <div className="flex flex-1 flex-col bg-ink font-marquee-body">
      <SiteNav />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <p className="font-ui-mono text-xs tracking-[0.2em] text-marquee uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 font-display text-3xl text-paper sm:text-4xl">{t("title")}</h1>
          <p className="mt-4 max-w-xl font-marquee-body text-sm leading-relaxed text-dust">
            {t("intro")}
          </p>

          <section className="mt-10 rounded-2xl border border-paper/10 bg-panel/40 p-8">
            <h2 className="font-display text-xl text-paper">{t("contact.heading")}</h2>
            <p className="mt-2 font-marquee-body text-sm leading-relaxed text-dust">
              {t("contact.body")}
            </p>
            <Button asChild className="mt-5 bg-marquee text-ink hover:bg-marquee/85">
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </Button>
            <p className="mt-4 font-ui-mono text-xs text-dust">{t("contact.tip")}</p>
          </section>

          <h2 className="mt-14 font-display text-xl text-paper">{t("faqHeading")}</h2>
          <Accordion type="single" collapsible className="mt-2">
            {faq.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

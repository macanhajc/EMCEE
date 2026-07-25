"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/UI/tabs";
import { BOT_ROADMAP } from "@/lib/roadmap";
import { StatusLog } from "./status-log";
import { BotTokenUpdate } from "./bot-token-update";
import { BotDangerZone } from "./bot-danger-zone";
import { RegularsTable } from "./regulars-table";
import { BanByUsername } from "./ban-by-username";
import { ActivationMessageCard } from "./activation-message-card";
import { ActivityLog } from "./activity-log";
import { AnchorSpotCard } from "./anchor-spot-card";
import { AntiSpamCard } from "./anti-spam-card";
import { DefaultOutfitCard } from "./default-outfit-card";
import { EmoteAllCard } from "./emote-all-card";
import { EmoteOnSayCard } from "./emote-on-say-card";
import { ExemptionsCard } from "./exemptions-card";
import { FarewellCard } from "./farewell-card";
import { FilterCard } from "./filter-card";
import { GeneralCard } from "./general-card";
import { IdleEmoteLoopCard } from "./idle-emote-loop-card";
import { ListCommandCard } from "./list-command-card";
import { LoopCard } from "./loop-card";
import { ModCommandsCard } from "./mod-commands-card";
import { OutfitCloneCard } from "./outfit-clone-card";
import { OutfitPresetsCard } from "./outfit-presets-card";
import { ReactionBackCard } from "./reaction-back-card";
import { StrikeEscalationCard } from "./strike-escalation-card";
import { VipCard } from "./vip-card";
import { WelcomeCard } from "./welcome-card";

const STATUS_TAB_KEY = "status";
const ACTIVITY_TAB_KEY = "activity";
const AVATAR_TAB_KEY = "avatar";
const MODERATION_TAB_KEY = "warden";
const GREETER_TAB_KEY = "concierge";
const EMOTE_TAB_KEY = "emote";

const tabTriggerClassname = "rounded-full hover:border-marquee hover:text-white border cursor-pointer border-paper/15 bg-transparent px-4 py-1.5 text-dust data-active:border-marquee data-active:bg-marquee data-active:text-ink data-active:shadow-none"

/**
 * Module-tabbed config UI. Every module (Emote, Greeter, Moderation, Avatar)
 * is a set of hand-written cards, each owning its own query/mutate/save —
 * this component only owns the tab switcher itself (Activity and Status
 * included) and hands `instanceId` down for each card to fetch and save its
 * own section with. See docs/decisions.md, 2026-07-24 (Avatar) through
 * 2026-07-24 (Emote) for the module-by-module migration off the earlier
 * schema-auto-rendered `SectionCard`/shared-`<form>` design this replaced.
 */
export function InstanceConfig({ instanceId }: { instanceId: string }) {
  const [activeModule, setActiveModule] = useState<string>(EMOTE_TAB_KEY);
  const t = useTranslations("instanceDetail.config");
  const tBot = useTranslations("bot");

  return (
    <div className="mt-10">
      <h2 className="font-display text-xl text-paper">{t("heading")}</h2>

      <Tabs
        value={activeModule}
        onValueChange={setActiveModule}
        className="mt-4 gap-5 relative"
      >
        <TabsList className="h-auto flex-wrap justify-start gap-1.5 bg-transparent p-0">
          <TabsTrigger
            value={EMOTE_TAB_KEY}
            className={tabTriggerClassname}
          >
            {tBot(`features.emote.name`)}
          </TabsTrigger>

          <TabsTrigger
            value={GREETER_TAB_KEY}
            className={tabTriggerClassname}
          >
            {tBot(`features.concierge.name`)}
          </TabsTrigger>

          <TabsTrigger
            value={MODERATION_TAB_KEY}
            className={tabTriggerClassname}
          >
            {tBot(`features.warden.name`)}
          </TabsTrigger>

          <TabsTrigger
            value={AVATAR_TAB_KEY}
            className={tabTriggerClassname}
          >
            {tBot(`features.avatar.name`)}
          </TabsTrigger>

          <TabsTrigger
            value="music\"
            disabled
            className="rounded-full border border-dashed border-paper/10 bg-transparent px-4 py-1.5 text-dust/50"
          >
            {tBot(`roadmap.music.name`)}
            <span className="font-ui-mono text-[9px] mt-1 tracking-wide text-dust/50 uppercase">
              {t("soon")}
            </span>
          </TabsTrigger>

          <div className="flex gap-1.5">
            <div className="border-r h-8 ml-4 mr-3 border-paper/10" />

            <TabsTrigger
              value={ACTIVITY_TAB_KEY}
              className={tabTriggerClassname}
            >
              {t("activityTab")}
            </TabsTrigger>

            <TabsTrigger
              value={STATUS_TAB_KEY}
              className={tabTriggerClassname}
            >
              {t("settingsTab")}
            </TabsTrigger>
          </div>
        </TabsList>

        {BOT_ROADMAP.map((mod) => (
          <TabsContent key={mod.key} value={mod.key}>
            <div className="rounded-2xl border border-dashed border-paper/15 bg-transparent p-8 text-center">
              <p className="font-ui-mono text-[11px] tracking-[0.15em] text-marquee uppercase">
                {tBot(`roadmap.${mod.key}.role`)}
              </p>
              <p className="mt-2 font-display text-lg text-paper">
                {t("comingSoon", { name: tBot(`roadmap.${mod.key}.name`) })}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-dust">
                {tBot(`roadmap.${mod.key}.body`)}
              </p>
            </div>
          </TabsContent>
        ))}

        <TabsContent value={EMOTE_TAB_KEY} className="flex flex-col gap-6">
          <EmoteOnSayCard instanceId={instanceId} />
          <EmoteAllCard instanceId={instanceId} />
          <ListCommandCard instanceId={instanceId} />
          <LoopCard instanceId={instanceId} />
        </TabsContent>

        <TabsContent value={GREETER_TAB_KEY} className="flex flex-col gap-6">
          <ActivationMessageCard instanceId={instanceId} />
          <WelcomeCard instanceId={instanceId} />
          <VipCard instanceId={instanceId} />
          <FarewellCard instanceId={instanceId} />
        </TabsContent>

        <TabsContent value={MODERATION_TAB_KEY} className="flex flex-col gap-6">
          <FilterCard instanceId={instanceId} />
          <AntiSpamCard instanceId={instanceId} />
          <StrikeEscalationCard instanceId={instanceId} />
          <ExemptionsCard instanceId={instanceId} />
          <ModCommandsCard instanceId={instanceId} />
        </TabsContent>

        <TabsContent value={AVATAR_TAB_KEY} className="flex flex-col gap-6">
          <AnchorSpotCard instanceId={instanceId} />
          <IdleEmoteLoopCard instanceId={instanceId} />
          <ReactionBackCard instanceId={instanceId} />
          <DefaultOutfitCard instanceId={instanceId} />
          <OutfitPresetsCard instanceId={instanceId} />
          <OutfitCloneCard instanceId={instanceId} />
        </TabsContent>

        <TabsContent value={ACTIVITY_TAB_KEY} className="flex flex-col gap-6">
          <RegularsTable instanceId={instanceId} />
          <BanByUsername instanceId={instanceId} />
          <ActivityLog />
        </TabsContent>

        <TabsContent value={STATUS_TAB_KEY} className="flex flex-col gap-6">
          <GeneralCard instanceId={instanceId} />
          <BotTokenUpdate instanceId={instanceId} />
          <StatusLog instanceId={instanceId} />
          <BotDangerZone instanceId={instanceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

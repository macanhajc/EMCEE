import Link from "next/link";
import { notFound } from "next/navigation";
import emoteSchemaV1 from "@botmarket/schemas/emote/v1";
import { auth } from "@/auth";
import { getOwnedInstance } from "@/db/instances";
import { getActiveSubscriptionForInstance } from "@/db/billing";
import { sectionsFromSchema } from "@/lib/schema-form";
import { openBillingPortal } from "@/app/checkout/actions";
import { replaceToken, updateConfig } from "./actions";

const SCHEMAS: Record<string, object> = { emote: emoteSchemaV1 };

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "Too many attempts — try again in a few minutes.",
  bad_token: "That token doesn't look right.",
};

export default async function InstancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; checkout?: string }>;
}) {
  const { id } = await params;
  const { error, saved, checkout } = await searchParams;
  const session = await auth(); // proxy.ts guarantees a session on this route
  const instance = await getOwnedInstance(session!.user.id, id);
  if (!instance) notFound();

  const subscription = await getActiveSubscriptionForInstance(id);

  const schema = SCHEMAS[instance.catalogBotSlug];
  const sections = sectionsFromSchema(schema);
  const config = instance.config as Record<string, Record<string, unknown>>;

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", display: "grid", gap: 24 }}>
      <h1>{instance.catalogBotSlug}</h1>
      <p>
        Room: {instance.roomId}
        <br />
        Bot status: {instance.status}
        <br />
        {subscription ? (
          <>
            Subscription: {subscription.status}{" "}
            <form action={openBillingPortal} style={{ display: "inline" }}>
              <button type="submit">Manage billing</button>
            </form>
          </>
        ) : (
          <>
            Subscription: none —{" "}
            <Link href={`/checkout?instance=${instance.id}`}>Subscribe</Link>
          </>
        )}
      </p>

      {checkout === "success" && (
        <p role="status">
          Thanks! Your subscription is starting — this page will reflect it shortly.
        </p>
      )}
      {error && <p role="alert">{ERROR_MESSAGES[error] ?? decodeURIComponent(error)}</p>}
      {saved && <p role="status">Saved.</p>}

      <form action={updateConfig.bind(null, instance.id)} style={{ display: "grid", gap: 20 }}>
        {sections.map((section) => (
          <fieldset key={section.key} style={{ display: "grid", gap: 8 }}>
            <legend>{section.title}</legend>
            {section.description && <p style={{ fontSize: 12, opacity: 0.6 }}>{section.description}</p>}

            {section.fields.map((field) => {
              const value = config[section.key]?.[field.key];
              const name = `${section.key}.${field.key}`;
              return (
                <div key={field.key}>
                  <label htmlFor={name}>{field.title}</label>
                  {field.kind === "boolean" && (
                    <input id={name} name={name} type="checkbox" defaultChecked={Boolean(value)} />
                  )}
                  {field.kind === "integer" && (
                    <input
                      id={name}
                      name={name}
                      type="number"
                      min={field.minimum}
                      max={field.maximum}
                      defaultValue={typeof value === "number" ? value : undefined}
                      style={{ display: "block", width: "100%" }}
                    />
                  )}
                  {field.kind === "enum" && (
                    <select id={name} name={name} defaultValue={typeof value === "string" ? value : ""}>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}
                  {field.kind === "string-array" && (
                    <textarea
                      id={name}
                      name={name}
                      defaultValue={Array.isArray(value) ? value.join("\n") : ""}
                      placeholder="One per line"
                      style={{ display: "block", width: "100%" }}
                    />
                  )}
                  {field.description && <p style={{ fontSize: 12, opacity: 0.6 }}>{field.description}</p>}
                </div>
              );
            })}
          </fieldset>
        ))}
        <button type="submit">Save config</button>
      </form>

      <form action={replaceToken.bind(null, instance.id)} style={{ display: "grid", gap: 8 }}>
        <label htmlFor="token">Replace bot token (currently ending …{instance.tokenLast4})</label>
        <input id="token" name="token" type="password" autoComplete="off" />
        <button type="submit">Replace token</button>
      </form>
    </main>
  );
}

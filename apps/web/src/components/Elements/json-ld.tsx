// Escaping "<" keeps a "</script"-shaped substring in the data from ever
// closing the tag early — see Next.js's own JSON-LD docs for this pattern.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

// Placeholder — middleware guarantees an admin-role session by the time this renders.
// Mandatory 2FA for admin (specs/05-security.md) is not yet implemented — TODO before
// this surface handles anything sensitive.
export default function AdminPage() {
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto" }}>
      <h1>Admin</h1>
      <p>Coming soon.</p>
    </main>
  );
}

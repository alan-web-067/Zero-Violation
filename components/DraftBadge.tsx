// Shown to admins when the numbers on screen include an unpublished draft —
// viewers still see the last published version.
export default function DraftBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="badge badge-good"
      title="You're seeing draft numbers. Viewers see the last published version until you click Publish on Admin / Edit."
    >
      ✏️ Draft — not published
    </span>
  );
}

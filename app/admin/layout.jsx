export default function AdminLayout({
  children,
}) {
  /*
   * Do not put authentication redirects or dashboard rendering
   * in this layout. /admin and /admin/dashboard must stay separate.
   */
  return children
}

export default function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layout doesn't enforce auth - let individual pages handle it
  // This prevents redirect loops on the login page
  return <>{children}</>;
}

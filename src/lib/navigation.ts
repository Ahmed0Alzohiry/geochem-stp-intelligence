export function withServiceQuery(href: string, service?: string | null): string {
  const code = service?.trim();
  if (!code) return href;
  const [path, existing] = href.split("?");
  const params = new URLSearchParams(existing ?? "");
  params.set("service", code);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function navItemIsActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

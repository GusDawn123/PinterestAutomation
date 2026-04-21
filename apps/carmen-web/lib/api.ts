const BASE = process.env.NEXT_PUBLIC_PINTEREST_SVC_URL ?? "http://localhost:3001";

export async function fetchSvc<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`pinterest-svc ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

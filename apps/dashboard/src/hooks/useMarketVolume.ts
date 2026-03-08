import { useQuery } from '@tanstack/react-query';

const TOKEN_ID = import.meta.env.VITE_TOKEN_ID as string;
const EVENT_SLUG = 'what-price-will-bitcoin-hit-before-2027';

interface GammaMarket {
  id: string;
  clobTokenIds: string;
  volumeNum?: number;
  volumeClob?: number;
}

interface GammaEvent {
  id: string;
  markets: GammaMarket[];
}

export function useMarketVolume() {
  return useQuery({
    queryKey: ['marketVolume', EVENT_SLUG, TOKEN_ID],
    queryFn: async () => {
      const res = await fetch(
        `/proxy/gamma/events?slug=${EVENT_SLUG}`
      );
      if (!res.ok) throw new Error(`Gamma API error: ${res.status}`);
      const events: GammaEvent[] = await res.json();
      const event = events[0];
      if (!event?.markets) return null;
      const market = event.markets.find((m) => {
        try {
          const ids = JSON.parse(m.clobTokenIds || '[]') as string[];
          return ids.includes(TOKEN_ID);
        } catch {
          return false;
        }
      });
      const vol = market?.volumeNum ?? market?.volumeClob ?? 0;
      return vol;
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

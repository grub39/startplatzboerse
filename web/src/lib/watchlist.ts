import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase() {
    if (!supabaseInstance) {
        supabaseInstance = createClient(
            import.meta.env.PUBLIC_SUPABASE_URL,
            import.meta.env.PUBLIC_SUPABASE_ANON_KEY
        );
    }
    return supabaseInstance;
}

let cachedIds: Set<string> | null = null;
let cacheUserId: string | null = null;

export function invalidateWatchlistCache() {
    cachedIds = null;
    cacheUserId = null;
}

export async function loadWatchlistIds(): Promise<Set<string>> {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        cachedIds = new Set();
        cacheUserId = null;
        return cachedIds;
    }

    if (cachedIds && cacheUserId === user.id) {
        return cachedIds;
    }

    const { data, error } = await supabase
        .from('watchlist')
        .select('listing_id')
        .eq('user_id', user.id);

    if (error) {
        console.error('Watchlist laden fehlgeschlagen:', error.message);
        return new Set();
    }

    cachedIds = new Set((data ?? []).map((row) => row.listing_id as string));
    cacheUserId = user.id;
    return cachedIds;
}

export async function toggleWatchlist(listingId: string): Promise<{ saved: boolean; requiresLogin: boolean }> {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { saved: false, requiresLogin: true };
    }

    const ids = await loadWatchlistIds();
    const wasSaved = ids.has(listingId);

    if (wasSaved) {
        const { error } = await supabase
            .from('watchlist')
            .delete()
            .eq('user_id', user.id)
            .eq('listing_id', listingId);
        if (error) throw error;
        ids.delete(listingId);
    } else {
        const { error } = await supabase
            .from('watchlist')
            .insert({ user_id: user.id, listing_id: listingId });
        if (error) throw error;
        ids.add(listingId);
    }

    window.dispatchEvent(new CustomEvent('watchlist:changed', { detail: { count: ids.size } }));
    return { saved: !wasSaved, requiresLogin: false };
}

export function syncHeartButtons(ids: Set<string>, root: ParentNode = document) {
    root.querySelectorAll<HTMLElement>('[data-watchlist-id]').forEach((btn) => {
        const id = btn.dataset.watchlistId;
        if (!id) return;
        const saved = ids.has(id);
        btn.classList.toggle('is-saved', saved);
        btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
        btn.setAttribute('aria-label', saved ? 'Aus Merkliste entfernen' : 'Merken');
    });
}

export const HEART_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="heart-icon" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>`;

export function heartButtonHtml(listingId: string): string {
    const safeId = String(listingId).replace(/"/g, '');
    return `<button type="button" class="heart-corner heart-btn" data-watchlist-id="${safeId}" aria-label="Merken" aria-pressed="false">${HEART_ICON_SVG}</button>`;
}

let delegationBound = false;

export function bindWatchlistDelegation(root: Document | HTMLElement = document) {
    if (delegationBound) return;
    delegationBound = true;

    root.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLElement>('[data-watchlist-id]');
        if (!btn || btn.hasAttribute('disabled')) return;

        e.preventDefault();
        e.stopPropagation();

        const listingId = btn.dataset.watchlistId;
        if (!listingId) return;

        btn.setAttribute('disabled', 'true');

        try {
            const result = await toggleWatchlist(listingId);

            if (result.requiresLogin) {
                const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
                window.location.href = `/login?redirect=${returnTo}`;
                return;
            }

            const ids = await loadWatchlistIds();
            syncHeartButtons(ids);
        } catch (err) {
            console.error('Merkliste Fehler:', err);
        } finally {
            btn.removeAttribute('disabled');
        }
    });
}

export async function initWatchlistUi(root?: ParentNode) {
    bindWatchlistDelegation();
    const ids = await loadWatchlistIds();
    syncHeartButtons(ids, root ?? document);
    return ids;
}

export function updateWatchlistCountDisplay(count: number) {
    const el = document.getElementById('watchlist-count');
    if (el) el.textContent = String(count);
}

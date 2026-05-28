import { getSupabase } from './watchlist';

export type DeleteAccountResult = {
    ok: boolean;
    error?: string;
};

export async function deleteAccount(): Promise<DeleteAccountResult> {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        return { ok: false, error: 'Nicht angemeldet.' };
    }

    const { data, error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
        body: {},
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    const payload = data as { ok?: boolean; error?: string } | null;
    if (!payload?.ok) {
        return { ok: false, error: payload?.error ?? 'Konto konnte nicht gelöscht werden.' };
    }

    return { ok: true };
}

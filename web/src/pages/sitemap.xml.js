import { createClient } from '@supabase/supabase-js';
import { getCollection } from 'astro:content'; // NEU: Astro's Content-API laden

export async function GET() {
    // 1. Supabase Verbindung aufbauen
    const supabase = createClient(
        import.meta.env.PUBLIC_SUPABASE_URL,
        import.meta.env.PUBLIC_SUPABASE_ANON_KEY
    );

    // 2. Alle aktuellen Inserat-IDs aus der Datenbank holen
    const { data: listings, error } = await supabase
        .from('listings')
        .select('id');

    if (error) {
        console.error('Sitemap DB Error:', error);
    }

    // 3. Deine echte Domain
    const baseUrl = 'https://startplatzboerse.com'; 

    // 4. Deine statischen Seiten
    const staticPages = [
        '',             
        '/suche',       
        '/ueber-uns',   
        '/kontakt',
        '/ratgeber'     // NEU: Die Ratgeber-Übersichtsseite direkt mit indexieren
    ];

    // 5. XML für statische Seiten generieren
    const staticUrls = staticPages.map((page) => {
        return `
    <url>
        <loc>${baseUrl}${page}</loc>
        <changefreq>${page === '' ? 'daily' : 'weekly'}</changefreq>
        <priority>${page === '' ? '1.0' : '0.8'}</priority>
    </url>`;
    }).join('');

    // 6. XML für alle dynamischen Inserate generieren
    const listingUrls = (listings || []).map((item) => {
        return `
    <url>
        <loc>${baseUrl}/listing/${item.id}</loc>
        <changefreq>weekly</changefreq>
        <priority>0.9</priority>
    </url>`;
    }).join('');

    // 7. NEU: XML für alle Ratgeber-Artikel generieren
    let articleUrls = '';
    try {
        // Holt alle Markdown-Dateien aus der Collection (wir gehen davon aus, sie heißt "ratgeber")
        // Falls dein Ordner unter src/content anders heißt, passe [PLATZHALTER_COLLECTION_NAME] an
        const articles = await getCollection('ratgeber'); 
        
        articleUrls = articles.map((entry) => {
            // Nutzt deinen im Frontmatter definierten Slug oder automatisch den Dateinamen
            const targetSlug = entry.data.slug || entry.slug;
            
            return `
    <url>
        <loc>${baseUrl}/ratgeber/${targetSlug}</loc>
        <changefreq>monthly</changefreq>
        <priority>0.8</priority>
    </url>`;
        }).join('');
    } catch (err) {
        console.error('Sitemap: Keine Ratgeber-Artikel gefunden', err);
    }

    // 8. Alles zum fertigen XML-Dokument zusammenbauen
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${listingUrls}
${articleUrls}
</urlset>`;

    // 9. Die Sitemap an den Browser/Google ausliefern
    return new Response(sitemap, {
        headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=3600' 
        }
    });
}
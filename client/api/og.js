export default async function handler(req, res) {
  // Allow CORS if needed, though Vercel handles this for same-origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Extract the episode ID from the query parameter (populated by vercel.json rewrite)
  const { id } = req.query;
  
  try {
    // Determine the actual episode number (handles both '5' and 'episode-5')
    const episodeNumber = id ? (id.startsWith('episode-') ? id.replace('episode-', '') : id) : null;
    
    if (!episodeNumber) {
      return res.redirect('/');
    }

    // 1. Fetch episode data from the backend API
    const API_URL = process.env.VITE_API_URL || 'https://api.descienceosclub.com'; // Fallback to production API URL if env var is missing
    let data = null;
    try {
      const apiRes = await fetch(`${API_URL}/api/episodes/${episodeNumber}`);
      data = await apiRes.json();
    } catch (e) {
      console.error('Failed to fetch episode data from backend:', e);
    }
    
    // 2. Fetch the base index.html from the live frontend deployment
    // We use req.headers.host to get the current Vercel deployment URL
    const host = req.headers.host || 'osf.descienceosclub.com';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    let htmlRes;
    try {
      htmlRes = await fetch(`${protocol}://${host}/index.html`);
    } catch (e) {
      console.error('Failed to fetch base HTML:', e);
      // Fallback: If we can't fetch our own HTML, just serve a basic HTML that redirects immediately
      return res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/register/${id}"></head><body>Redirecting...</body></html>`);
    }
    
    let html = await htmlRes.text();
    
    // 3. Inject the dynamic OG tags if we successfully fetched the episode
    if (data && data.success && data.episode) {
      const ep = data.episode;
      
      const title = `Episode ${ep.episode_number}: ${ep.title} | Open Source Friday`;
      
      // Strip HTML tags from description if they used the rich text editor
      const rawDescription = ep.description ? ep.description.replace(/<[^>]*>?/gm, '') : '';
      let description = ep.meta_description || rawDescription.substring(0, 160);
      if (!ep.meta_description && rawDescription.length > 160) description += '...';
      
      // Set image URL to the new dynamic backend endpoint that serves the binary image
      // Fallback to the wide logo to force large image preview on WhatsApp
      let imageUrl = 'https://osf.descienceosclub.com/Open_Source_Fridays_logo.png';
      if (ep.cover_photo_url) {
        imageUrl = `${API_URL}/api/episodes/${ep.episode_number}/cover`;
      } else if (ep.presenter_photo_url) {
        // Fallback to presenter photo if they have one but no cover
        imageUrl = ep.presenter_photo_url.startsWith('data:image') 
          ? 'https://osf.descienceosclub.com/Open_Source_Fridays_logo.png' 
          : ep.presenter_photo_url;
      }
      
      // String replace the meta tags
      html = html.replace(/<title>.*?<\/title>/g, `<title>${title}</title>`);
      html = html.replace(/<meta name="title" content=".*?" \/>/g, `<meta name="title" content="${title}" />`);
      html = html.replace(/<meta name="description" content=".*?" \/>/g, `<meta name="description" content="${description}" />`);
      
      html = html.replace(/<meta property="og:title" content=".*?" \/>/g, `<meta property="og:title" content="${title}" />`);
      html = html.replace(/<meta property="og:description" content=".*?" \/>/g, `<meta property="og:description" content="${description}" />`);
      html = html.replace(/<meta property="og:image" content=".*?" \/>/g, `<meta property="og:image" content="${imageUrl}" />\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />`);
      
      // Insert twitter card tag if not present
      if (!html.includes('<meta name="twitter:card"')) {
        html = html.replace('</head>', `  <meta name="twitter:card" content="summary_large_image" />\n</head>`);
      } else {
        html = html.replace(/<meta name="twitter:card" content=".*?" \/>/g, `<meta name="twitter:card" content="summary_large_image" />`);
      }

      html = html.replace(/<meta property="twitter:title" content=".*?" \/>/g, `<meta property="twitter:title" content="${title}" />`);
      html = html.replace(/<meta property="twitter:description" content=".*?" \/>/g, `<meta property="twitter:description" content="${description}" />`);
      html = html.replace(/<meta property="twitter:image" content=".*?" \/>/g, `<meta property="twitter:image" content="${imageUrl}" />`);
    }
    
    // 4. Return the modified HTML
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate'); // Cache for 60 seconds at the edge
    res.status(200).send(html);
    
  } catch (error) {
    console.error('OG Tag Injection Error:', error);
    // On unexpected error, just redirect the user to the SPA route
    res.redirect(`/register/${req.query.id || ''}`);
  }
}

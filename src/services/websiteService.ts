import axios from 'axios';

export interface WebsiteMetadata {
    description: string;
    favicon: string;
    domain: string;
    screenshot: string;
    content: string;
}

export class WebsiteService {
    static async extractMetadata(url: string): Promise<WebsiteMetadata> {
        try {
            console.log('Extracting metadata from URL:', url);
            const domain = new URL(url).hostname;
            console.log('Domain extracted:', domain);

            // Use Jina Reader API to fetch clean content and metadata
            // Endpoint: https://r.jina.ai/http://example.com -> returns cleaned article text
            const readerUrl = `https://r.jina.ai/${url}`;
            console.log('Using Jina Reader API:', readerUrl);
            
            const response = await axios.get(readerUrl, { timeout: 15000 });
            const text = (response.data as string) || '';
            console.log('Jina Reader response length:', text.length);
            console.log('Jina Reader response preview:', text.substring(0, 200));

            // Basic metadata fetch via HEAD/GET for favicon and description (best effort)
            let description = text.substring(0, 200);
            let favicon = `https://${domain}/favicon.ico`;

            try {
                console.log('Fetching HTML metadata...');
                const htmlResp = await axios.get(url, { timeout: 8000 });
                const html = htmlResp.data as string;
                console.log('HTML response length:', html.length);
                
                const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
                                  html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i);
                if (descMatch && descMatch[1]) {
                    description = descMatch[1].trim();
                    console.log('Description extracted from HTML:', description);
                }
                
                const favMatch = html.match(/<link[^>]*rel=["'](?:shortcut icon|icon)["'][^>]*href=["']([^"']*)["'][^>]*>/i);
                if (favMatch && favMatch[1]) {
                    favicon = favMatch[1].startsWith('http') ? favMatch[1] : `https://${domain}/${favMatch[1].replace(/^\//, '')}`;
                    console.log('Favicon extracted:', favicon);
                }
            } catch (htmlError) {
                console.log('HTML metadata extraction failed (non-critical):', htmlError);
                // ignore metadata fallback errors
            }

            // Screenshot functionality removed
            const screenshot = '';

            const result = {
                description,
                favicon,
                domain,
                screenshot,
                content: text.substring(0, 8000)
            };
            
            console.log('Metadata extraction completed successfully');
            console.log('Final description length:', description.length);
            console.log('Final content length:', result.content.length);
            console.log('Screenshot functionality disabled');
            
            return result;
        } catch (error) {
            console.error('Error extracting website metadata:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);
                console.error('Error stack:', error.stack);
            }
            const domain = new URL(url).hostname;
            return {
                description: 'Content could not be extracted',
                favicon: `https://${domain}/favicon.ico`,
                domain,
                screenshot: '',
                content: ''
            };
        }
    }

    static async validateUrl(url: string): Promise<boolean> {
        try {
            new URL(url);
            const response = await axios.head(url, { timeout: 5000 });
            return response.status >= 200 && response.status < 400;
        } catch {
            return false;
        }
    }
}


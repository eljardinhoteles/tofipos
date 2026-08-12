const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // POST /upload-url -> Genera la URL pública o maneja subida directa
      if (request.method === 'POST' && url.pathname === '/upload-url') {
        const body = await request.json();

        const { fileName, organizationId, registroId } = body;
        if (!fileName || !organizationId) {
          return new Response(
            JSON.stringify({ error: 'fileName y organizationId son requeridos' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `comprobantes/${organizationId}/${registroId || 'general'}-${Date.now()}-${safeFileName}`;

        const workerHost = url.origin;
        const uploadUrl = `${workerHost}/upload/${key}`;

        const publicBase = env.PUBLIC_DOMAIN
          ? env.PUBLIC_DOMAIN.replace(/\/$/, '')
          : workerHost;
        const publicUrl = `${publicBase}/file/${key}`;

        return new Response(
          JSON.stringify({ uploadUrl, publicUrl, key }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // PUT /upload/* -> Recibe el archivo directamente con R2 Native Binding
      if (request.method === 'PUT' && url.pathname.startsWith('/upload/')) {
        const key = url.pathname.replace('/upload/', '');
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

        await env.MY_BUCKET.put(key, request.body, {
          httpMetadata: { contentType },
        });

        return new Response(JSON.stringify({ ok: true, key }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // DELETE /file/* o /delete/* -> Elimina un archivo directamente en Cloudflare R2
      if (request.method === 'DELETE' && (url.pathname.startsWith('/file/') || url.pathname.startsWith('/delete/'))) {
        const key = url.pathname.replace('/file/', '').replace('/delete/', '');
        await env.MY_BUCKET.delete(key);
        return new Response(JSON.stringify({ ok: true, key }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // GET /file/* -> Sirve el archivo público desde R2
      if (request.method === 'GET' && url.pathname.startsWith('/file/')) {
        const key = url.pathname.replace('/file/', '');
        const object = await env.MY_BUCKET.get(key);

        if (!object) {
          return new Response('Archivo no encontrado', { status: 404, headers: corsHeaders });
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);

        return new Response(object.body, { headers });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || 'Error interno en Cloudflare Worker' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};

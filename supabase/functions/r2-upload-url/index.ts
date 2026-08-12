import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@^3.500.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@^3.500.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  fileName: string;
  fileType: string;
  organizationId: string;
  registroId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucketName = Deno.env.get("R2_BUCKET_NAME") || "tofipos";
    const publicDomain = Deno.env.get("R2_PUBLIC_DOMAIN"); // ej: https://pub-xxx.r2.dev o dominio propio

    const missingVars = [];
    if (!accountId) missingVars.push("R2_ACCOUNT_ID");
    if (!accessKeyId) missingVars.push("R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missingVars.push("R2_SECRET_ACCESS_KEY");

    if (missingVars.length > 0) {
      return new Response(
        JSON.stringify({ error: `Cloudflare R2 env vars missing: ${missingVars.join(", ")}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json()) as RequestBody;
    const { fileName, fileType, organizationId, registroId } = body;

    if (!fileName || !organizationId) {
      return new Response(
        JSON.stringify({ error: "fileName and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `comprobantes/${organizationId}/${registroId || "general"}-${Date.now()}-${safeFileName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: fileType || "application/octet-stream",
    });

    // Firma válida por 15 minutos (900 segundos)
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

    const baseUrl = publicDomain
      ? publicDomain.replace(/\/$/, "")
      : `https://${accountId}.r2.cloudflarestorage.com/${bucketName}`;
    const publicUrl = `${baseUrl}/${key}`;

    return new Response(
      JSON.stringify({ uploadUrl, publicUrl, key }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

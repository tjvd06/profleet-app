import { createClient as createServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // 1. Authenticate the requesting user
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { filePath, bucket } = await request.json();

    if (
      !filePath ||
      typeof filePath !== "string" ||
      !bucket ||
      typeof bucket !== "string"
    ) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    // Reject path traversal
    if (filePath.includes("..")) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    // Only allow known buckets
    const allowedBuckets = ["tender-config-files"];
    if (!allowedBuckets.includes(bucket)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Verify the user has permission to access this file.
    //
    //    Access paths in priority order:
    //    a) Owner of the file (path starts with own user ID)
    //    b) Buyer of the tender for an offer file (offers/{dealer_id}/{tender_id}/...)
    //    c) Dealer with role='anbieter' for a tender config file from an ACTIVE
    //       tender. Config-File-Pfad ist {buyer_id}/{vehicle_id}/{filename} und
    //       liegt in tender_vehicles.config_file_path. Aktive Tender sind im
    //       Marketplace eh public sichtbar, daher Download für jeden Dealer ok.
    const isOwnFile =
      filePath.startsWith(`${user.id}/`) ||
      filePath.startsWith(`offers/${user.id}/`);
    let hasAccess = isOwnFile;

    if (!hasAccess && filePath.startsWith("offers/")) {
      // Path format: offers/{dealer_id}/{tender_id}/{vehicle_id}/{filename}
      const parts = filePath.split("/");
      const tenderId = parts[2];

      if (tenderId) {
        const { data: tender } = await supabase
          .from("tenders")
          .select("buyer_id")
          .eq("id", tenderId)
          .single();

        hasAccess = tender?.buyer_id === user.id;
      }
    }

    if (!hasAccess && !filePath.startsWith("offers/")) {
      // Path format: {buyer_id}/{vehicle_id}/{filename} — tender config file.
      // Allowed for any active dealer; we verify role + tender.status='active'.
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "anbieter") {
        const parts = filePath.split("/");
        const vehicleId = parts[1];

        if (vehicleId) {
          const { data: vehicle } = await supabase
            .from("tender_vehicles")
            .select("tenders!inner(status)")
            .eq("id", vehicleId)
            .single();

          const tenderStatus = (vehicle?.tenders as { status?: string } | null)?.status;
          hasAccess = tenderStatus === "active";
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Generate signed URL with service role (bypasses RLS)
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(filePath, 60);

    if (error) {
      return NextResponse.json(
        { error: "Failed to generate URL", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error("[signed-url] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 },
    );
  }
}

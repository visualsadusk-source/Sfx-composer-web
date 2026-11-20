import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/auth.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/admin-content\/?/, '').replace(/\/$/, '');

  // 1. Verify Admin Authentication & Role
  const authResult = await verifyAdminRequest(req);
  if (!authResult.authorized) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'UNAUTHORIZED',
      message: authResult.error || 'Admin authorization required.'
    }), {
      status: authResult.statusCode || 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ── 1. GET ALL VIDEOS & SECTIONS ──
    if (req.method === 'GET' || path === 'list') {
      const { data: videos, error: vErr } = await supabase
        .from('sfx_videos')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (vErr) throw vErr;

      const { data: sections, error: sErr } = await supabase
        .from('sfx_section_content')
        .select('*');

      if (sErr) throw sErr;

      const videoList = videos || [];
      const stats = {
        total: videoList.length,
        published: videoList.filter(v => v.status === 'published').length,
        draft: videoList.filter(v => v.status === 'draft').length,
        by_section: {
          tutorials: videoList.filter(v => v.section === 'tutorials').length,
          homepage_tutorials: videoList.filter(v => v.section === 'homepage_tutorials').length,
          live_demo: videoList.filter(v => v.section === 'live_demo').length,
          product_demo: videoList.filter(v => v.section === 'product_demo').length
        }
      };

      return new Response(JSON.stringify({
        ok: true,
        admin_email: authResult.user?.email || 'admin',
        stats,
        videos: videoList,
        sections: sections || []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 2. SAVE VIDEO (CREATE OR UPDATE) ──
    if (req.method === 'POST' && (path === 'save-video' || path === 'video')) {
      const body = await req.json().catch(() => ({}));
      const {
        id,
        title,
        description = '',
        youtube_url,
        youtube_id,
        custom_thumbnail_url = null,
        thumbnail_url,
        section = 'tutorials',
        display_order = 0,
        is_featured = false,
        status = 'published',
        category = 'General',
        duration = ''
      } = body;

      if (!title || !youtube_url || !youtube_id) {
        return new Response(JSON.stringify({
          ok: false,
          message: 'Title, YouTube URL, and extracted YouTube Video ID are required.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const finalThumb = custom_thumbnail_url || thumbnail_url || `https://img.youtube.com/vi/${youtube_id}/hqdefault.jpg`;

      const videoPayload: any = {
        title: title.trim(),
        description: (description || '').trim(),
        youtube_url: youtube_url.trim(),
        youtube_id: youtube_id.trim(),
        thumbnail_url: finalThumb,
        custom_thumbnail_url: custom_thumbnail_url ? custom_thumbnail_url.trim() : null,
        section,
        display_order: parseInt(String(display_order), 10) || 0,
        is_featured: Boolean(is_featured),
        status: status === 'draft' ? 'draft' : 'published',
        category: (category || 'General').trim(),
        duration: (duration || '').trim(),
        updated_at: new Date().toISOString()
      };

      let result;
      if (id) {
        // Update existing
        const { data, error } = await supabase
          .from('sfx_videos')
          .update(videoPayload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        result = data;
      } else {
        // Insert new
        videoPayload.created_at = new Date().toISOString();
        const { data, error } = await supabase
          .from('sfx_videos')
          .insert(videoPayload)
          .select()
          .single();
        if (error) throw error;
        result = data;
      }

      return new Response(JSON.stringify({
        ok: true,
        action: id ? 'updated' : 'created',
        video: result
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 3. DELETE VIDEO ──
    if (req.method === 'POST' && (path === 'delete-video' || path === 'delete')) {
      const body = await req.json().catch(() => ({}));
      const { id } = body;

      if (!id) {
        return new Response(JSON.stringify({ ok: false, message: 'Video ID is required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { error } = await supabase
        .from('sfx_videos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, deleted_id: id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 4. SAVE SECTION CONTENT ──
    if (req.method === 'POST' && (path === 'save-section' || path === 'section')) {
      const body = await req.json().catch(() => ({}));
      const {
        section_key,
        kicker = '',
        title,
        description = '',
        featured_video_id = null
      } = body;

      if (!section_key || !title) {
        return new Response(JSON.stringify({ ok: false, message: 'Section key and title are required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const sectionPayload: any = {
        section_key,
        kicker: (kicker || '').trim(),
        title: title.trim(),
        description: (description || '').trim(),
        featured_video_id: featured_video_id || null,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('sfx_section_content')
        .upsert(sectionPayload)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, section: data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 5. REORDER VIDEOS ──
    if (req.method === 'POST' && path === 'reorder') {
      const body = await req.json().catch(() => ({}));
      const { orders = [] } = body;

      for (const item of orders) {
        if (item.id && typeof item.display_order === 'number') {
          await supabase
            .from('sfx_videos')
            .update({ display_order: item.display_order, updated_at: new Date().toISOString() })
            .eq('id', item.id);
        }
      }

      return new Response(JSON.stringify({ ok: true, message: 'Display order updated successfully' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: false, message: 'Unknown endpoint' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('Unhandled admin-content error:', err);
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

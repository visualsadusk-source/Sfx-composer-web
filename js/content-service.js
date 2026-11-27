/**
 * SFX Composer — Public Content & Video Service
 * Loads published YouTube tutorials and section contents from Supabase.
 * Safe for anonymous public visitors using standard Supabase Anon Key.
 */
(function (window) {
  'use strict';

  var CONFIG = {
    SUPABASE_URL: 'https://wyjazmiihwjlrkggeeez.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh'
  };

  // Curated fallback tutorials in case Supabase is unreachable or cold-starting
  var FALLBACK_VIDEOS = [
    {
      id: 'fallback-1',
      title: 'Product Overview & Workflow Tour',
      description: 'Learn the end-to-end sound design pipeline inside Premiere Pro, from sound searching to timeline placement.',
      youtube_id: 'dQw4w9WgXcQ',
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      section: 'tutorials',
      category: 'Overview',
      duration: '4:20',
      display_order: 1
    },
    {
      id: 'fallback-2',
      title: 'Installation Guide (Windows Batch & CEP)',
      description: 'One-click installation and unlocking player debug mode for CEP extensions in Premiere Pro & After Effects.',
      youtube_id: 'dQw4w9WgXcQ',
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      section: 'tutorials',
      category: 'Setup',
      duration: '3:15',
      display_order: 2
    },
    {
      id: 'fallback-3',
      title: 'Essential Sound Studio Masterclass',
      description: 'Sculpting Dialogue, Music, Ambience & SFX using live BiquadFilters, bass shelves, and peak normalization.',
      youtube_id: 'dQw4w9WgXcQ',
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      section: 'tutorials',
      category: 'Audio Studio',
      duration: '6:45',
      display_order: 3
    },
    {
      id: 'fallback-4',
      title: 'Audio Tools: Trim, Fade & WAV Export',
      description: 'How to preview transients, apply smoothstep fades, and export clean 24-bit WAV samples directly to your timeline.',
      youtube_id: 'dQw4w9WgXcQ',
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumbnail_url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      section: 'tutorials',
      category: 'Tools',
      duration: '5:10',
      display_order: 4
    }
  ];

  var ContentService = {
    // Utility: Extract 11-char YouTube ID from any format
    extractYouTubeId: function (urlOrId) {
      if (!urlOrId) return '';
      var str = String(urlOrId).trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
        return str;
      }
      var regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;
      var match = str.match(regExp);
      return match ? match[1] : '';
    },

    // Fetch published videos for a section
    getPublishedVideos: async function (section) {
      try {
        var query = CONFIG.SUPABASE_URL + '/rest/v1/sfx_videos?status=eq.published&order=display_order.asc,created_at.desc';
        if (section) {
          query += '&section=eq.' + encodeURIComponent(section);
        }

        var res = await fetch(query, {
          method: 'GET',
          headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY
          }
        });

        if (!res.ok) {
          console.warn('ContentService: Failed to fetch videos from Supabase, using fallback.');
          return FALLBACK_VIDEOS;
        }

        var data = await res.json();
        return Array.isArray(data) && data.length > 0 ? data : FALLBACK_VIDEOS;
      } catch (err) {
        console.warn('ContentService error:', err);
        return FALLBACK_VIDEOS;
      }
    },

    // Fetch section content (headings, descriptions)
    getSectionContent: async function (sectionKey) {
      try {
        var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/sfx_section_content?section_key=eq.' + encodeURIComponent(sectionKey), {
          method: 'GET',
          headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY
          }
        });

        if (!res.ok) return null;
        var data = await res.json();
        return data && data.length > 0 ? data[0] : null;
      } catch (e) {
        return null;
      }
    }
  };

  window.SFX_CONTENT_SERVICE = ContentService;
})(window);

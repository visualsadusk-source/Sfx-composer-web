/*
 * SFX Box host runtime — generated file, do not edit.
 *
 * Built from src/host/ by scripts/build-host.mjs.
 * Version 2.2.0
 * Sources: 00-prelude.jsx, 10-json.jsx, 20-premiere.jsx, 30-aftereffects.jsx, 40-dispatch.jsx
 */

// ---- 00-prelude.jsx ----
/*
 * SFX Box — host runtime prelude.
 *
 * Everything in src/host/ runs inside ExtendScript, which is ECMAScript 3 with
 * Adobe extensions. That is not "old JavaScript with a few gaps" — it is a
 * meaningfully smaller language, and the differences bite silently:
 *
 *   - No `const`, `let`, arrow functions, template literals or shorthand
 *     properties. These are *parse* errors, and CEP reports a parse error as
 *     the opaque string "EvalScript error." with no line number.
 *   - No Array.prototype.forEach / map / filter / indexOf / some.
 *   - No Object.keys, Object.assign, Array.isArray.
 *   - No String.prototype.trim.
 *   - No JSON. (Polyfilled in 10-json.jsx.)
 *   - No Function.prototype.bind.
 *   - Trailing commas in object and array literals are a parse error.
 *
 * scripts/verify-host-bundle.mjs enforces all of the above against the built
 * bundle, because the only alternative is finding out inside a host application
 * with no debugger attached.
 *
 * The whole runtime hangs off one global, `SFXBox`, to avoid colliding with
 * other panels sharing the same ExtendScript engine — in After Effects every
 * CEP extension shares one global scope, so a bare `function import()` from
 * another vendor's panel really can break ours.
 */

// eslint-disable-next-line no-var
var SFXBox = (function (existing) {
  var ns = existing || {};

  /** Version of the host bundle; replaced at build time from package.json. */
  ns.VERSION = '2.2.0';

  /** Must match REPLY_MAGIC in src/shared/protocol/envelope.ts. */
  ns.REPLY_MAGIC = '@@SFXBOX_REPLY@@';

  /** Protocol version this runtime understands. */
  ns.PROTOCOL_VERSION = 1;

  return ns;
})(typeof SFXBox === 'undefined' ? null : SFXBox);

/**
 * Small ES3-safe helpers used across the runtime.
 *
 * Kept deliberately minimal. Each one exists because the ES5 equivalent is
 * absent, not because a helper felt tidier.
 */
SFXBox.u = (function () {
  var u = {};

  /** Array.isArray, which ES3 lacks. */
  u.isArray = function (value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  };

  /** String.prototype.trim, which ES3 lacks. */
  u.trim = function (value) {
    return String(value).replace(/^[\s ]+|[\s ]+$/g, '');
  };

  /** Object.keys, which ES3 lacks. */
  u.keys = function (obj) {
    var out = [];
    var key;
    for (key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        out[out.length] = key;
      }
    }
    return out;
  };

  /** Array.prototype.indexOf for strings and numbers, which ES3 lacks. */
  u.indexOf = function (arr, needle) {
    var i;
    for (i = 0; i < arr.length; i += 1) {
      if (arr[i] === needle) {
        return i;
      }
    }
    return -1;
  };

  /** Clamps `value` into [min, max]. NaN collapses to `min`. */
  u.clamp = function (value, min, max) {
    var n = Number(value);
    if (isNaN(n)) {
      return min;
    }
    if (n < min) {
      return min;
    }
    if (n > max) {
      return max;
    }
    return n;
  };

  /** Lower-case file extension without the dot; empty string when there is none. */
  u.extensionOf = function (path) {
    var clean = String(path).replace(/\\/g, '/');
    var slash = clean.lastIndexOf('/');
    var name = slash === -1 ? clean : clean.substring(slash + 1);
    var dot = name.lastIndexOf('.');
    if (dot <= 0) {
      return '';
    }
    return name.substring(dot + 1).toLowerCase();
  };

  /** File name including extension. */
  u.baseNameOf = function (path) {
    var clean = String(path).replace(/\\/g, '/');
    var slash = clean.lastIndexOf('/');
    return slash === -1 ? clean : clean.substring(slash + 1);
  };

  /**
   * Rounds `seconds` down onto a frame boundary.
   *
   * Down rather than nearest: a sound effect placed one frame *before* the
   * playhead is a cut point the editor can trim, whereas one placed a frame
   * after leaves a gap that reads as a mistake.
   */
  u.snapToFrame = function (seconds, frameRate) {
    if (!frameRate || frameRate <= 0) {
      return seconds;
    }
    return Math.floor(seconds * frameRate + 1e-6) / frameRate;
  };

  /**
   * Converts decibels to a linear amplitude ratio.
   * -Infinity dB is not representable here; callers clamp before calling.
   */
  u.dbToLinear = function (db) {
    return Math.pow(10, Number(db) / 20);
  };

  return u;
})();

/**
 * Structured errors.
 *
 * Host APIs throw a mixture of Error objects, bare strings and — in Premiere's
 * case — sometimes nothing at all while still failing. Every command wraps its
 * work and converts whatever comes out into one of the codes declared in
 * src/shared/protocol/envelope.ts. The panel switches on the code; `detail`
 * carries the raw text for the log.
 */
SFXBox.fail = function (code, message, detail) {
  return {
    __sfxboxError: true,
    code: code,
    message: message,
    detail: detail === undefined || detail === null ? '' : String(detail)
  };
};

/** True when `value` came from {@link SFXBox.fail}. */
SFXBox.isFailure = function (value) {
  return !!value && value.__sfxboxError === true;
};

/**
 * Normalises anything thrown by a host API into a failure payload.
 * ExtendScript Error objects expose `.message`, `.line` and `.fileName`; bare
 * strings expose none of those.
 */
SFXBox.describeThrown = function (thrown) {
  if (SFXBox.isFailure(thrown)) {
    return thrown;
  }
  var detail;
  if (thrown && typeof thrown === 'object' && thrown.message !== undefined) {
    detail = String(thrown.message);
    if (thrown.line !== undefined) {
      detail += ' (line ' + String(thrown.line) + ')';
    }
  } else {
    detail = String(thrown);
  }
  return SFXBox.fail('host/unknown', 'The host reported an unexpected error.', detail);
};

// ---- 10-json.jsx ----
/*
 * SFX Box — JSON for ExtendScript.
 *
 * ExtendScript has no JSON object. Rather than patch the global (which would
 * leak into every other panel sharing the After Effects engine, and would fight
 * any panel that installs its own json2), SFX Box keeps a private
 * implementation at SFXBox.json.
 *
 * `parse` follows the json2 strategy: validate the text against a grammar
 * regex, then hand it to `eval`. That is safe precisely *because* of the
 * validation — the regex rejects anything that is not literal JSON, so there is
 * no expression left for eval to execute. Writing a hand-rolled recursive
 * descent parser here would be slower in ExtendScript and no more correct.
 *
 * `stringify` is written out rather than borrowed so its behaviour on the types
 * this protocol actually carries is pinned down: no replacer, no indentation,
 * `undefined` and functions dropped from objects, and NaN/Infinity written as
 * null (matching the ES5 spec, and matching what the panel's JSON.parse
 * expects to receive).
 */

SFXBox.json = (function () {
  var json = {};

  // Characters that must be escaped inside a JSON string. Written entirely as
  // \u escapes rather than as literal characters: several of them (U+2028 and
  // U+2029 especially) are line terminators to a JavaScript parser, so pasting
  // them literally into a regex literal ends the expression early and breaks
  // the file with a syntax error that points at the wrong place.
  var ESCAPABLE =
    /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

  var META = {
    '\b': '\\b',
    '\t': '\\t',
    '\n': '\\n',
    '\f': '\\f',
    '\r': '\\r',
    '"': '\\"',
    '\\': '\\\\'
  };

  function quote(string) {
    ESCAPABLE.lastIndex = 0;
    if (!ESCAPABLE.test(string)) {
      return '"' + string + '"';
    }
    return (
      '"' +
      string.replace(ESCAPABLE, function (a) {
        var c = META[a];
        if (typeof c === 'string') {
          return c;
        }
        var code = a.charCodeAt(0).toString(16);
        while (code.length < 4) {
          code = '0' + code;
        }
        return '\\u' + code;
      }) +
      '"'
    );
  }

  function serialize(value) {
    var i;
    var parts;
    var key;
    var piece;

    if (value === null) {
      return 'null';
    }

    switch (typeof value) {
      case 'string':
        return quote(value);

      case 'number':
        return isFinite(value) ? String(value) : 'null';

      case 'boolean':
        return String(value);

      case 'undefined':
      case 'function':
        return undefined;

      case 'object':
        break;

      default:
        return undefined;
    }

    // Date is the one host object worth special-casing; ExtendScript hands them
    // back from File.modified and they would otherwise serialise as "{}".
    if (value instanceof Date) {
      return quote(isoDate(value));
    }

    if (SFXBox.u.isArray(value)) {
      parts = [];
      for (i = 0; i < value.length; i += 1) {
        piece = serialize(value[i]);
        parts[parts.length] = piece === undefined ? 'null' : piece;
      }
      return '[' + parts.join(',') + ']';
    }

    parts = [];
    for (key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        piece = serialize(value[key]);
        if (piece !== undefined) {
          parts[parts.length] = quote(key) + ':' + piece;
        }
      }
    }
    return '{' + parts.join(',') + '}';
  }

  function pad(n) {
    return n < 10 ? '0' + String(n) : String(n);
  }

  function isoDate(date) {
    return (
      String(date.getUTCFullYear()) +
      '-' +
      pad(date.getUTCMonth() + 1) +
      '-' +
      pad(date.getUTCDate()) +
      'T' +
      pad(date.getUTCHours()) +
      ':' +
      pad(date.getUTCMinutes()) +
      ':' +
      pad(date.getUTCSeconds()) +
      'Z'
    );
  }

  /**
   * Serialises `value` to JSON text.
   * Returns the string "null" for values with no JSON representation, so the
   * function never returns undefined into the reply channel.
   */
  json.stringify = function (value) {
    var text = serialize(value);
    return text === undefined ? 'null' : text;
  };

  /**
   * Parses JSON text.
   * Throws a plain Error on malformed input; callers convert that into a
   * structured failure.
   */
  json.parse = function (text) {
    var source = String(text);

    // json2's four-step validation. Order matters: escapes are neutralised
    // first so that a string containing "]" cannot be mistaken for structure.
    var stripped = source
      .replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
      .replace(
        /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
        ']'
      )
      .replace(/(?:^|:|,)(?:\s*\[)+/g, '');

    if (!/^[\],:{}\s]*$/.test(stripped)) {
      throw new Error('Malformed JSON input.');
    }

    // eslint-disable-next-line no-eval
    return eval('(' + source + ')');
  };

  return json;
})();

// ---- 20-premiere.jsx ----
/*
 * SFX Box — Premiere Pro host adapter.
 *
 * Premiere's ExtendScript API is documented thinly and behaves differently
 * across versions, so this file is defensive by policy: every host call that
 * has ever been observed to be absent is feature-detected rather than assumed,
 * and anything unexpected becomes a structured failure instead of a thrown
 * string.
 *
 * The import strategy, and why it is what it is:
 *
 *   1. Reuse an existing project item when the file is already imported.
 *      Importing the same whoosh forty times in an edit would otherwise leave
 *      forty identical bins entries, which editors rightly hate.
 *   2. Find an audio track that is *free* across the clip's whole duration and
 *      place with `overwriteClip`. `insertClip` ripples everything downstream —
 *      catastrophic in a locked-picture edit, and not what "drop a sound at the
 *      playhead" means to anyone.
 *   3. Only create a new track when no existing one has room. Track creation
 *      needs QE, Premiere's undocumented internal API, so it is attempted
 *      inside a guard and its failure is reported honestly rather than being
 *      allowed to look like success.
 */

SFXBox.premiere = (function () {
  var api = {};

  /** Premiere's internal time unit: ticks per second. */
  var TICKS_PER_SECOND = 254016000000;

  /**
   * Premiere's audio Level parameter is normalised to [0, 1] where 1.0 is the
   * maximum boost of +15 dB. The mapping is a straight amplitude ratio against
   * that ceiling, so normalised = 10^((dB - 15) / 20). Sanity check: 0 dB gives
   * 0.17783, which is the value Premiere itself reports for a unity clip.
   */
  var MAX_GAIN_DB = 15;
  var MIN_GAIN_DB = -96;

  function seconds(timeObject) {
    var value;
    if (!timeObject) {
      return 0;
    }
    if (timeObject.seconds !== undefined && timeObject.seconds !== null) {
      value = Number(timeObject.seconds);
      return isFinite(value) ? value : 0;
    }
    if (timeObject.ticks !== undefined) {
      value = Number(timeObject.ticks) / TICKS_PER_SECOND;
      return isFinite(value) ? value : 0;
    }
    return 0;
  }

  function activeSequence() {
    if (!app || !app.project) {
      return null;
    }
    var seq = app.project.activeSequence;
    return seq ? seq : null;
  }

  function sequenceFrameRate(seq) {
    try {
      var settings = seq.getSettings();
      if (settings && settings.videoFrameRate) {
        var frameDuration = seconds(settings.videoFrameRate);
        if (frameDuration > 0) {
          return 1 / frameDuration;
        }
      }
    } catch (e) {
      // Fall through to the timebase route below.
    }
    try {
      if (seq.timebase) {
        var ticksPerFrame = Number(seq.timebase);
        if (ticksPerFrame > 0) {
          return TICKS_PER_SECOND / ticksPerFrame;
        }
      }
    } catch (e2) {
      // Reported as 0 below; callers treat 0 as "do not snap".
    }
    return 0;
  }

  function playheadSeconds(seq) {
    try {
      if (typeof seq.getPlayerPosition === 'function') {
        return seconds(seq.getPlayerPosition());
      }
    } catch (e) {
      // Older builds throw rather than returning null.
    }
    return 0;
  }

  /* ---------------------------------------------------------------- *
   * Project item lookup and import
   * ---------------------------------------------------------------- */

  function findItemByPath(item, targetPath) {
    var i;
    var found;
    var mediaPath;

    if (!item) {
      return null;
    }

    if (item.children && item.children.numItems > 0) {
      for (i = 0; i < item.children.numItems; i += 1) {
        found = findItemByPath(item.children[i], targetPath);
        if (found) {
          return found;
        }
      }
      return null;
    }

    try {
      mediaPath = item.getMediaPath();
    } catch (e) {
      return null;
    }

    if (!mediaPath) {
      return null;
    }

    if (normalisePath(mediaPath) === normalisePath(targetPath)) {
      return item;
    }
    return null;
  }

  function normalisePath(path) {
    // Premiere reports Windows paths with backslashes and macOS paths with
    // forward slashes; comparison is case-insensitive because Windows and the
    // default macOS volume both are.
    return String(path).replace(/\\/g, '/').toLowerCase();
  }

  /*
   * Where a newly imported sound should land in the Project panel.
   *
   * `app.project.rootItem` drops everything at the top level, which is what a
   * beta tester objected to: an editor who has just made a "SFX" bin and
   * selected it expects the import to go there, and having to drag it in
   * afterwards defeats the point of a one-click import.
   *
   * Premiere offers `getInsertionBin()` for exactly this — it is the bin the
   * Project panel is currently showing or has selected. It arrived in Premiere
   * 14 and is absent before that, so this falls back to the root rather than
   * failing an import over a bin.
   */
  function destinationBin() {
    try {
      if (typeof app.project.getInsertionBin === 'function') {
        var bin = app.project.getInsertionBin();
        // A bin is type 2 (BIN). Anything else — a clip selected rather than a
        // folder — would make `importFiles` throw.
        if (bin && Number(bin.type) === 2) {
          return bin;
        }
      }
    } catch (e) {
      // Older build, or nothing selected. The root is always valid.
    }
    return app.project.rootItem;
  }

  function importOrReuse(path) {
    var existing = findItemByPath(app.project.rootItem, path);
    if (existing) {
      return existing;
    }

    var imported;
    try {
      imported = app.project.importFiles([path], true, destinationBin(), false);
    } catch (e) {
      return SFXBox.fail(
        'host/import-failed',
        'Premiere Pro refused to import the file.',
        SFXBox.describeThrown(e).detail
      );
    }

    if (imported === false) {
      return SFXBox.fail(
        'host/unsupported-media',
        'Premiere Pro could not read this audio file.',
        path
      );
    }

    var item = findItemByPath(app.project.rootItem, path);
    if (!item) {
      // importFiles reported success but nothing matching landed in the
      // project. Treated as a failure rather than guessing at the newest item,
      // which would place the wrong sound.
      return SFXBox.fail(
        'host/import-failed',
        'The file was imported but could not be located in the project.',
        path
      );
    }
    return item;
  }

  function itemDurationSeconds(item) {
    try {
      var outPoint = seconds(item.getOutPoint());
      var inPoint = seconds(item.getInPoint());
      var duration = outPoint - inPoint;
      if (duration > 0) {
        return duration;
      }
    } catch (e) {
      // Some codecs report no in/out until the item is opened. Handled below.
    }
    return 0;
  }

  /* ---------------------------------------------------------------- *
   * Trimming
   * ---------------------------------------------------------------- */

  /*
   * Premiere carries in and out points on the *project item*, not on the clip
   * being placed, so a trim is applied by moving the bin item's in/out, placing
   * from it, and putting them back.
   *
   * Restoring is not optional. `importOrReuse` deliberately reuses an item that
   * is already in the project, so leaving a trim behind would mean the next
   * drag of that sound from the bin — by any means, including the user's own
   * hands — silently comes out short. The restore therefore runs in a `finally`
   * at the call site.
   *
   * `setInPoint` takes a media type, and which constant is accepted has moved
   * between versions. Rather than guess, each candidate is tried in turn and
   * the first that does not throw wins; if none work the import proceeds
   * untrimmed and says so, because a full-length sound on the timeline is a
   * far better outcome than a failed import.
   */
  var MEDIA_TYPE_CANDIDATES = [4, 2, 1];

  function readPoints(item) {
    try {
      return { inSeconds: seconds(item.getInPoint()), outSeconds: seconds(item.getOutPoint()) };
    } catch (e) {
      return null;
    }
  }

  function writePoints(item, inSeconds, outSeconds) {
    var i;
    for (i = 0; i < MEDIA_TYPE_CANDIDATES.length; i += 1) {
      try {
        item.setInPoint(inSeconds, MEDIA_TYPE_CANDIDATES[i]);
        item.setOutPoint(outSeconds, MEDIA_TYPE_CANDIDATES[i]);
        return true;
      } catch (e) {
        // Wrong media type for this version or this item. Try the next.
      }
    }

    // Older builds accept the one-argument form.
    try {
      item.setInPoint(inSeconds);
      item.setOutPoint(outSeconds);
      return true;
    } catch (e2) {
      return false;
    }
  }

  /* ---------------------------------------------------------------- *
   * Track selection
   * ---------------------------------------------------------------- */

  function trackIsFree(track, start, end) {
    var i;
    var clip;
    var clipStart;
    var clipEnd;

    try {
      if (track.isLocked && track.isLocked()) {
        return false;
      }
    } catch (e) {
      // A track that cannot report its lock state is skipped rather than
      // risking a write into a locked track.
      return false;
    }

    if (!track.clips) {
      return true;
    }

    for (i = 0; i < track.clips.numItems; i += 1) {
      clip = track.clips[i];
      clipStart = seconds(clip.start);
      clipEnd = seconds(clip.end);
      // Touching end-to-start is fine; genuine overlap is not.
      if (clipStart < end - 1e-6 && clipEnd > start + 1e-6) {
        return false;
      }
    }
    return true;
  }

  function findFreeTrackIndex(seq, start, end, fromIndex) {
    var i;
    for (i = fromIndex > 0 ? fromIndex : 0; i < seq.audioTracks.numTracks; i += 1) {
      if (trackIsFree(seq.audioTracks[i], start, end)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Adds one audio track via QE.
   *
   * QE is Premiere's undocumented internal automation API. It is the only route
   * to track creation from ExtendScript, it is not guaranteed across versions,
   * and it is therefore isolated here behind a boolean rather than woven into
   * the import path.
   */
  function tryAddAudioTrack(seq) {
    try {
      if (typeof app.enableQE !== 'function') {
        return false;
      }
      app.enableQE();
      // eslint-disable-next-line no-undef
      if (typeof qe === 'undefined' || !qe.project) {
        return false;
      }
      // eslint-disable-next-line no-undef
      var qeSeq = qe.project.getActiveSequence();
      if (!qeSeq || typeof qeSeq.addTracks !== 'function') {
        return false;
      }
      qeSeq.addTracks(0, 0, 1, seq.audioTracks.numTracks, 0, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------------------------------------------------------- *
   * Gain
   * ---------------------------------------------------------------- */

  function findPlacedClip(track, start) {
    var i;
    var clip;
    for (i = 0; i < track.clips.numItems; i += 1) {
      clip = track.clips[i];
      if (Math.abs(seconds(clip.start) - start) < 1e-4) {
        return clip;
      }
    }
    return null;
  }

  function findDuplicatePlacement(seq, path, start) {
    var t;
    var c;
    var track;
    var clip;
    var wanted = normalisePath(path);
    var mediaPath;
    for (t = 0; t < seq.audioTracks.numTracks; t += 1) {
      track = seq.audioTracks[t];
      if (!track || !track.clips) continue;
      for (c = 0; c < track.clips.numItems; c += 1) {
        clip = track.clips[c];
        if (Math.abs(seconds(clip.start) - start) > 1e-3) continue;
        try {
          mediaPath = clip.projectItem && clip.projectItem.getMediaPath ? normalisePath(clip.projectItem.getMediaPath()) : '';
        } catch (e) {
          mediaPath = '';
        }
        if (mediaPath === wanted) return { trackIndex: t, clip: clip };
      }
    }
    return null;
  }

  function applyGain(clip, gainDb) {
    var i;
    var j;
    var component;
    var property;
    var normalised;

    if (gainDb === 0) {
      return true;
    }
    if (!clip || !clip.components) {
      return false;
    }

    var clamped = SFXBox.u.clamp(gainDb, MIN_GAIN_DB, MAX_GAIN_DB);
    normalised = SFXBox.u.clamp(Math.pow(10, (clamped - MAX_GAIN_DB) / 20), 0, 1);

    for (i = 0; i < clip.components.numItems; i += 1) {
      component = clip.components[i];
      var name;
      try {
        name = String(component.displayName);
      } catch (e) {
        continue;
      }
      if (name !== 'Volume') {
        continue;
      }
      for (j = 0; j < component.properties.numItems; j += 1) {
        property = component.properties[j];
        var propertyName;
        try {
          propertyName = String(property.displayName);
        } catch (e2) {
          continue;
        }
        if (propertyName === 'Level') {
          try {
            property.setValue(normalised, true);
            return true;
          } catch (e3) {
            return false;
          }
        }
      }
    }
    return false;
  }

  /* ---------------------------------------------------------------- *
   * Commands
   * ---------------------------------------------------------------- */

  api.appVersion = function () {
    try {
      return String(app.version);
    } catch (e) {
      return 'unknown';
    }
  };

  api.projectInfo = function () {
    var name = '';
    var path = '';
    try {
      name = String(app.project.name);
    } catch (e) {
      name = '';
    }
    try {
      path = app.project.path ? String(app.project.path) : '';
    } catch (e2) {
      path = '';
    }
    return { projectName: name, projectPath: path };
  };

  api.timelineInfo = function (params) {
    var seq = activeSequence();
    if (!seq) {
      return {
        present: false,
        name: '',
        playheadSeconds: 0,
        durationSeconds: 0,
        frameRate: 0,
        laneCount: 0,
        selectedClipName: ''
      };
    }

    var duration = 0;
    try {
      duration = seconds(seq.end);
    } catch (e) {
      duration = 0;
    }

    /*
     * Best-effort only: the AI SFX Assistant uses this as a hint, not a
     * requirement, so any failure here must never affect the rest of
     * timelineInfo. Reuses findSelectedAudioClip rather than walking tracks
     * a second time.
     */
    /*
     * IMPORTANT: the panel polls timeline.info every second to show the
     * playhead/sequence. Walking every audio clip on every poll made the host
     * so busy that real commands (sfx.import) timed out on big sequences. So
     * the selection scan only happens when the caller asks for it.
     */
    var selectedClipName = '';
    if (params && params.includeSelection === true) {
      try {
        var selection = findSelectedAudioClip(seq);
        if (selection && selection.found) {
          selectedClipName = String(selection.found.clip.name);
        }
      } catch (e) {
        selectedClipName = '';
      }
    }

    return {
      present: true,
      name: String(seq.name),
      playheadSeconds: playheadSeconds(seq),
      durationSeconds: duration,
      frameRate: sequenceFrameRate(seq),
      laneCount: seq.audioTracks ? seq.audioTracks.numTracks : 0,
      selectedClipName: selectedClipName
    };
  };

  /**
   * Full sequence structure for Scene Sound Designer (Premiere only).
   * Separate from timelineInfo (which is polled cheaply every second).
   */
  api.seqAnalysis = function () {
    var seq = activeSequence();
    if (!seq) {
      return {
        present: false,
        host: 'premiere',
        kind: 'sequence',
        name: '',
        durationSeconds: 0,
        frameRate: 0,
        width: 0,
        height: 0,
        playheadSeconds: 0,
        videoTracks: [],
        audioTracks: [],
        sequences: listSequenceNames()
      };
    }

    var duration = 0;
    try {
      duration = seconds(seq.end);
    } catch (e0) {
      duration = 0;
    }

    var width = 0;
    var height = 0;
    try {
      // frameSize is often available on the sequence settings
      if (seq.frameSizeHorizontal !== undefined) {
        width = Number(seq.frameSizeHorizontal);
        height = Number(seq.frameSizeVertical);
      }
    } catch (e1) {}

    function collectTrack(track, type, index) {
      var clips = [];
      var gaps = [];
      var c;
      var limit = track.clips ? track.clips.numItems : 0;
      if (limit > 80) limit = 80;
      for (c = 0; c < limit; c += 1) {
        try {
          var clip = track.clips[c];
          if (!clip) continue;
          var mediaPath = '';
          try {
            if (clip.projectItem && clip.projectItem.getMediaPath) {
              mediaPath = String(clip.projectItem.getMediaPath() || '');
            }
          } catch (eM) {}
          clips.push({
            name: String(clip.name || ''),
            startSeconds: seconds(clip.start),
            endSeconds: seconds(clip.end),
            durationSeconds: Math.max(0, seconds(clip.end) - seconds(clip.start)),
            mediaPath: mediaPath,
            type: type,
            trackId: type + '-' + String(index + 1),
            trackIndex: index
          });
        } catch (eC) {}
      }
      // Premiere normally returns clips in timeline order. Sort defensively so
      // gap reporting remains correct on builds that do not guarantee it.
      clips.sort(function (a, b) { return a.startSeconds - b.startSeconds; });
      var cursor = 0;
      var clipEnd;
      for (c = 0; c < clips.length; c += 1) {
        if (clips[c].startSeconds > cursor + 1e-4) {
          gaps.push({ startSeconds: cursor, endSeconds: clips[c].startSeconds, durationSeconds: clips[c].startSeconds - cursor });
        }
        clipEnd = clips[c].endSeconds;
        if (clipEnd > cursor) cursor = clipEnd;
      }
      if (duration > cursor + 1e-4) {
        gaps.push({ startSeconds: cursor, endSeconds: duration, durationSeconds: duration - cursor });
      }
      return {
        index: index,
        trackId: type + '-' + String(index + 1),
        name: String(track.name || (type === 'video' ? 'V' : 'A') + (index + 1)),
        clipCount: track.clips ? track.clips.numItems : 0,
        clips: clips,
        gaps: gaps
      };
    }

    var videoTracks = [];
    var audioTracks = [];
    var i;
    try {
      var vCount = seq.videoTracks ? seq.videoTracks.numTracks : 0;
      if (vCount > 16) vCount = 16;
      for (i = 0; i < vCount; i += 1) {
        videoTracks.push(collectTrack(seq.videoTracks[i], 'video', i));
      }
    } catch (eV) {}
    try {
      var aCount = seq.audioTracks ? seq.audioTracks.numTracks : 0;
      if (aCount > 16) aCount = 16;
      for (i = 0; i < aCount; i += 1) {
        audioTracks.push(collectTrack(seq.audioTracks[i], 'audio', i));
      }
    } catch (eA) {}

    // Flatten clip-like "layers" for shared scene segmenter (video clips as scene cues)
    var layers = [];
    var trackIndex;
    var clipIndex;
    var trackClips;
    for (trackIndex = 0; trackIndex < videoTracks.length; trackIndex += 1) {
      trackClips = videoTracks[trackIndex].clips || [];
      for (clipIndex = 0; clipIndex < trackClips.length; clipIndex += 1) {
        var cl = trackClips[clipIndex];
        layers.push({
          index: layers.length + 1,
          name: cl.name,
          inPoint: cl.startSeconds,
          outPoint: cl.endSeconds,
          startTime: cl.startSeconds,
          enabled: true,
          hasVideo: true,
          hasAudio: false,
          footagePath: cl.mediaPath || '',
          sourceName: cl.name
        });
      }
    }

    return {
      present: true,
      host: 'premiere',
      kind: 'sequence',
      name: String(seq.name),
      durationSeconds: duration,
      frameRate: sequenceFrameRate(seq),
      width: width,
      height: height,
      playheadSeconds: playheadSeconds(seq),
      videoTracks: videoTracks,
      audioTracks: audioTracks,
      layers: layers,
      layerCount: layers.length,
      sequences: listSequenceNames(),
      note: 'Premiere sequence analysis (clips + tracks). Pixel vision requires a separate frame-export pipeline.'
    };
  };


  api.setPlayhead = function (params) {
    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail('host/no-active-timeline', 'Open a sequence in Premiere Pro first.');
    }
    var t = Number(params && params.seconds);
    if (!isFinite(t) || t < 0) {
      return SFXBox.fail('host/bad-params', 'Playhead time must be a non-negative number of seconds.');
    }
    try {
      // Premiere uses ticks; setPlayerPosition accepts a Time object or encoded string depending on build.
      if (typeof seq.setPlayerPosition === 'function') {
        var ticks = Math.round(t * TICKS_PER_SECOND);
        seq.setPlayerPosition(String(ticks));
      } else {
        return SFXBox.fail('host/unsupported-here', 'This Premiere build does not expose setPlayerPosition.');
      }
    } catch (e) {
      return SFXBox.fail('host/command-failed', 'Could not move the playhead.', SFXBox.describeThrown(e).detail);
    }
    var now = playheadSeconds(seq);
    return { ok: true, playheadSeconds: now, sequenceName: String(seq.name) };
  };

  api.transport = function (params) {
    var action = params && params.action ? String(params.action) : '';
    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail('host/no-active-timeline', 'Open a sequence in Premiere Pro first.');
    }
    // Prefer QE DOM for transport when available
    try {
      if (typeof app.enableQE === 'function') app.enableQE();
    } catch (e0) {}
    try {
      if (typeof qe !== 'undefined' && qe.project) {
        var qeSeq = qe.project.getActiveSequence();
        if (qeSeq) {
          if (action === 'play' && typeof qeSeq.playerPlay === 'function') {
            qeSeq.playerPlay();
            return { ok: true, action: 'play', method: 'qe' };
          }
          if ((action === 'pause' || action === 'stop') && typeof qeSeq.playerStop === 'function') {
            qeSeq.playerStop();
            return { ok: true, action: action, method: 'qe' };
          }
        }
      }
    } catch (e1) {}
    return SFXBox.fail(
      'host/unsupported-here',
      'Playback transport is not available through the supported Premiere APIs on this build. Move the playhead instead.'
    );
  };

  function listSequenceNames() {
    var names = [];
    try {
      // Walk project for sequences — capped
      var visited = 0;
      function walk(item) {
        if (!item || visited > 500) return;
        visited += 1;
        try {
          if (item.type && String(item.type) === '2') {
            // Some builds use numeric type for bins; sequences are often isSequence
          }
        } catch (e) {}
        try {
          if (item.isSequence && item.isSequence()) {
            names.push(String(item.name));
            return;
          }
        } catch (e2) {}
        try {
          if (item.children && item.children.numItems) {
            var j;
            for (j = 0; j < item.children.numItems && names.length < 40; j += 1) {
              walk(item.children[j]);
            }
          }
        } catch (e3) {}
      }
      walk(app.project.rootItem);
    } catch (e) {}
    // Always include active sequence name
    try {
      var seq = activeSequence();
      if (seq) {
        var n = String(seq.name);
        var found = false;
        var k;
        for (k = 0; k < names.length; k += 1) {
          if (names[k] === n) found = true;
        }
        if (!found) names.unshift(n);
      }
    } catch (e4) {}
    return names;
  }

  /**
   * Finds the one selected audio clip, or explains why there is not one.
   *
   * "Exactly one" is deliberate. Replacing several clips with the same sound is
   * a plausible thing to want and a terrible thing to do by accident, so a
   * multiple selection is refused rather than guessed at.
   */
  function findSelectedAudioClip(seq) {
    var found = null;
    var count = 0;
    var t;
    var c;

    for (t = 0; t < seq.audioTracks.numTracks; t += 1) {
      var track = seq.audioTracks[t];
      for (c = 0; c < track.clips.numItems; c += 1) {
        var clip = track.clips[c];
        // `selected` is not a TrackItem property. The documented API is
        // isSelected(); retain the old field only for legacy hosts.
        if (clip && ((typeof clip.isSelected === 'function' && clip.isSelected()) || clip.selected === true)) {
          count += 1;
          if (found === null) {
            found = { clip: clip, trackIndex: t, track: track };
          }
        }
      }
    }

    if (count === 0) return { error: 'none' };
    if (count > 1) return { error: 'many', count: count };
    return { found: found };
  }

  /* Return actual timeline audio selection; do not confuse it with the
   * Project-panel selection or track targeting. */
  api.selectedAudioClips = function () {
    var seq = activeSequence();
    if (!seq) return { present: false, host: 'premiere', clips: [], count: 0,
      reason: 'No active sequence. Open the sequence containing the audio clip.' };
    var selected;
    try { selected = seq.getSelection(); } catch (e) {
      return { present: true, host: 'premiere', sequenceName: String(seq.name), clips: [], count: 0,
        frameRate: sequenceFrameRate(seq), reason: 'Premiere Pro could not read the timeline selection.' };
    }
    var rawCount = selected ? (selected.numItems !== undefined ? selected.numItems : selected.length) : 0;
    var clips = [];
    var i; var t; var c;
    for (i = 0; i < rawCount; i += 1) {
      var clip = selected[i];
      if (!clip) continue;
      var isAudio = false;
      try { isAudio = clip.mediaType === 'Audio' || Number(clip.type) === 2; } catch (eType) {}
      if (!isAudio) continue; // Linked video is ignored; its selected audio mate is included.
      var trackIndex = -1;
      var clipIndex = -1;
      // TrackItem does not expose its owning track. Locate it by identity/node
      // so this reports the clip's track, never a selected/targeted track.
      try {
        for (t = 0; t < seq.audioTracks.numTracks && trackIndex < 0; t += 1) {
          var track = seq.audioTracks[t];
          for (c = 0; c < track.clips.numItems; c += 1) {
            var candidate = track.clips[c];
            if (candidate === clip || (candidate && clip.nodeId !== undefined && candidate.nodeId === clip.nodeId)) {
              trackIndex = t; clipIndex = c; break;
            }
          }
        }
      } catch (eTrack) {}
      var mediaPath = '';
      try { mediaPath = String(clip.projectItem.getMediaPath() || ''); } catch (ePath) {}
      var playbackSpeed = 1;
      try { if (typeof clip.getSpeed === 'function') playbackSpeed = Number(clip.getSpeed()) || 1; } catch (eSpeed) {}

      var sourceIn = 0;
      var sourceOut = 0;
      try {
        if (clip.inPoint !== undefined && clip.inPoint !== null) sourceIn = seconds(clip.inPoint);
        else if (typeof clip.getInPoint === 'function') sourceIn = seconds(clip.getInPoint());
      } catch (eIn) {}
      try {
        if (clip.outPoint !== undefined && clip.outPoint !== null) sourceOut = seconds(clip.outPoint);
        else if (typeof clip.getOutPoint === 'function') sourceOut = seconds(clip.getOutPoint());
      } catch (eOut) {}

      var tlStart = seconds(clip.start);
      var tlEnd = seconds(clip.end);
      var tlDuration = Math.max(0, tlEnd - tlStart);
      if (sourceOut <= sourceIn) {
        sourceOut = sourceIn + tlDuration;
      }

      clips.push({
        name: String(clip.name || ''),
        trackIndex: trackIndex,
        trackNumber: trackIndex >= 0 ? trackIndex + 1 : 0,
        clipIndex: clipIndex,
        timelineStart: tlStart,
        timelineEnd: tlEnd,
        duration: tlDuration,
        sourceIn: sourceIn,
        sourceOut: sourceOut,
        sourceMediaPath: mediaPath,
        nodeId: String(clip.nodeId || ''),
        playbackSpeed: playbackSpeed
      });
    }
    return { present: true, host: 'premiere', sequenceName: String(seq.name),
      frameRate: sequenceFrameRate(seq), count: clips.length, clips: clips,
      reason: clips.length ? '' : 'No audio clips are selected in the active sequence.' };
  };

  /**
   * Ceiling on how many project items are walked.
   *
   * A feature-length project can hold thousands. This runs whenever the panel
   * wants to refresh its badges, and ExtendScript blocks the application while
   * it runs — so an unbounded walk would freeze Premiere for the length of it,
   * to decorate some tiles.
   */
  var USED_PATH_LIMIT = 4000;

  api.usedPaths = function () {
    var paths = [];
    var visited = 0;
    var truncated = false;

    function walk(item) {
      if (truncated || !item) return;

      visited += 1;
      if (visited > USED_PATH_LIMIT) {
        truncated = true;
        return;
      }

      if (item.children && item.children.numItems > 0) {
        var i;
        for (i = 0; i < item.children.numItems; i += 1) {
          walk(item.children[i]);
          if (truncated) return;
        }
        return;
      }

      try {
        var mediaPath = item.getMediaPath();
        if (mediaPath) {
          // Lower-cased and slash-normalised: Windows reports backslashes and
          // is case-insensitive, so a raw comparison marks the same file unused.
          paths.push(String(mediaPath).replace(/\\/g, '/').toLowerCase());
        }
      } catch (e) {
        // An item with no media path — a sequence, a title, an offline clip.
        // Not an error, and not a sound.
      }
    }

    try {
      walk(app.project.rootItem);
    } catch (e) {
      return SFXBox.fail(
        'host/project-unreadable',
        'The project could not be read.',
        SFXBox.describeThrown(e).detail
      );
    }

    return { paths: paths, truncated: truncated };
  };

  api.replaceSelected = function (params) {
    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail(
        'host/no-active-timeline',
        'Open a sequence in Premiere Pro before replacing a sound.'
      );
    }

    var target = null;
    var targetTrack = null;
    var targetTrackIndex = -1;

    // 1. If target was explicitly specified by Audio Tools, match by nodeId or trackIndex + timelineStart
    if (params && params.target) {
      var wantedNodeId = params.target.nodeId ? String(params.target.nodeId) : '';
      var wantedTrack = params.target.trackIndex !== undefined ? Number(params.target.trackIndex) : -1;
      var wantedStart = params.target.timelineStart !== undefined ? Number(params.target.timelineStart) : -1;
      var t; var c;
      if (wantedNodeId) {
        for (t = 0; t < seq.audioTracks.numTracks && !target; t += 1) {
          var candTrack = seq.audioTracks[t];
          for (c = 0; c < candTrack.clips.numItems; c += 1) {
            var candClip = candTrack.clips[c];
            if (candClip && String(candClip.nodeId || '') === wantedNodeId) {
              target = candClip;
              targetTrack = candTrack;
              targetTrackIndex = t;
              break;
            }
          }
        }
      }
      if (!target && wantedTrack >= 0 && wantedTrack < seq.audioTracks.numTracks && wantedStart >= 0) {
        var trk = seq.audioTracks[wantedTrack];
        for (c = 0; c < trk.clips.numItems; c += 1) {
          var cl = trk.clips[c];
          if (cl && Math.abs(seconds(cl.start) - wantedStart) < 0.05) {
            target = cl;
            targetTrack = trk;
            targetTrackIndex = wantedTrack;
            break;
          }
        }
      }
    }

    // 2. Fallback: match currently selected audio clip
    if (!target) {
      var selection = findSelectedAudioClip(seq);
      if (selection.found) {
        target = selection.found.clip;
        targetTrack = selection.found.track;
        targetTrackIndex = selection.found.trackIndex;
      } else if (selection.error === 'many') {
        return SFXBox.fail(
          'host/many-selected',
          'Select a single audio clip. ' +
            String(selection.count) +
            ' are selected.'
        );
      }
    }

    if (!target || !targetTrack) {
      return SFXBox.fail(
        'host/clip-changed',
        'The timeline clip loaded into Audio Tools could not be located on the timeline. Select the clip on the timeline and try again.'
      );
    }

    var startSeconds = seconds(target.start);
    var endSeconds = seconds(target.end);
    var oldLength = Math.max(0, endSeconds - startSeconds);
    var oldMediaPath = '';
    try { oldMediaPath = normalisePath(target.projectItem.getMediaPath()); } catch (ePath) {}

    var item = importOrReuse(params.path);
    if (!item || SFXBox.isFailure(item)) {
      return SFXBox.fail(
        'host/import-failed',
        'Premiere Pro could not import the processed audio.',
        params.path
      );
    }

    // Set item in/out to match timeline duration if needed
    try {
      if (typeof item.setInPoint === 'function') item.setInPoint(0, 4);
      if (typeof item.setOutPoint === 'function') item.setOutPoint(oldLength, 4);
    } catch (eTrim) {}

    // Overwrite at exact timeline position on the existing track
    try {
      targetTrack.overwriteClip(item, startSeconds);
    } catch (e) {
      return SFXBox.fail(
        'host/replace-failed',
        'Premiere Pro refused to place the replacement clip.',
        SFXBox.describeThrown(e).detail
      );
    }

    // Locate the newly placed clip at startSeconds
    var placed = findPlacedClip(targetTrack, startSeconds);
    var placedPath = '';
    try { placedPath = placed && placed.projectItem ? normalisePath(placed.projectItem.getMediaPath()) : ''; } catch (ePlaced) {}
    if (!placed || placedPath !== normalisePath(params.path)) {
      return SFXBox.fail('host/replace-unverified', 'Premiere Pro did not verify the replacement at the original clip position. The original clip was left untouched.');
    }

    // Clean up any remaining tail of the old clip if new length was shorter than old length
    var newLength = itemDurationSeconds(item);
    if (newLength > 0 && oldLength > newLength + 0.01) {
      try {
        var tail = findPlacedClip(targetTrack, startSeconds + newLength);
        if (tail && tail !== placed) {
          var tailPath = '';
          try { tailPath = tail.projectItem ? normalisePath(tail.projectItem.getMediaPath()) : ''; } catch (eTailPath) {}
          if (tailPath === oldMediaPath && typeof tail.remove === 'function') {
            tail.remove(false, false);
          }
        }
      } catch (eTail) {}
    }

    // Clean up original clip reference if it still exists and is distinct
    var removed = false;
    try {
      if (placed !== target && typeof target.remove === 'function') {
        target.remove(false, false);
        removed = true;
      }
    } catch (eRemove) {}

    var gainApplied = applyGain(placed, params.gainDb);

    return {
      startSeconds: startSeconds,
      timelineDuration: oldLength,
      laneIndex: targetTrackIndex,
      gainApplied: gainApplied,
      replaced: true,
      originalRemoved: removed || placed !== target,
      nodeId: placed.nodeId ? String(placed.nodeId) : ''
    };
  };

  api.importSfx = function (params) {
    /*
     * Import-only mode (used by the Browser tab's fallback): bring the file
     * into the project bin and stop. It deliberately does not need an open
     * sequence, so a file can still be imported when placement is impossible.
     */
    if (params.importOnly) {
      var onlyFile = new File(params.path);
      if (!onlyFile.exists) {
        return SFXBox.fail('host/file-not-found', 'That audio file is no longer on disk.', params.path);
      }
      var onlyItem = importOrReuse(params.path);
      if (SFXBox.isFailure(onlyItem)) {
        return onlyItem;
      }
      return {
        host: 'premiere',
        imported: true,
        placed: false,
        timelineName: '',
        startSeconds: 0,
        laneIndex: -1,
        appliedGainDb: 0,
        gainApplied: false,
        createdLane: false,
        trimApplied: false,
        placedDurationSeconds: 0
      };
    }

    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail(
        'host/no-active-timeline',
        'Open a sequence in Premiere Pro before importing a sound.'
      );
    }

    var file = new File(params.path);
    if (!file.exists) {
      return SFXBox.fail('host/file-not-found', 'That audio file is no longer on disk.', params.path);
    }

    var item = importOrReuse(params.path);
    if (SFXBox.isFailure(item)) {
      return item;
    }

    var frameRate = sequenceFrameRate(seq);
    var start = params.atPlayhead ? playheadSeconds(seq) : 0;
    // Marker Mode places at an explicit time instead of the playhead.
    if (params.startSeconds !== null && params.startSeconds !== undefined) {
      start = params.startSeconds;
    }
    if (params.snapToFrame) {
      start = SFXBox.u.snapToFrame(start, frameRate);
    }

    if (params.preventDuplicate) {
      var duplicate = findDuplicatePlacement(seq, params.path, start);
      if (duplicate) {
        return {
          host: 'premiere', imported: true, placed: false, duplicate: true,
          timelineName: String(seq.name), startSeconds: start, laneIndex: duplicate.trackIndex,
          appliedGainDb: 0, gainApplied: false, createdLane: false, trimApplied: false, placedDurationSeconds: 0
        };
      }
    }

    // Marker Mode can ask the search to begin at a higher track (A2, A3...)
    // so SFX stay clear of dialogue on A1. 0 = search from A1 as before.
    var fromIndex = params.firstTrack ? Math.floor(params.firstTrack) - 1 : 0;
    if (fromIndex < 0) {
      fromIndex = 0;
    }

    // Trim first: the placed length decides which track has room for it, so
    // asking about occupancy before applying the trim would reserve space for
    // audio that is not going to be there.
    var originalPoints = params.trim ? readPoints(item) : null;
    var trimApplied = false;

    if (params.trim) {
      trimApplied = writePoints(item, params.trim.inSeconds, params.trim.outSeconds);
    }

    var duration = trimApplied
      ? params.trim.outSeconds - params.trim.inSeconds
      : itemDurationSeconds(item);

    // A zero duration means Premiere could not report the media length. The
    // occupancy test then degenerates to "is this exact instant free", which is
    // the most conservative reading available without inventing a length.
    var end = start + (duration > 0 ? duration : 1e-3);

    try {
      var trackIndex = -1;
      var createdLane = false;

      /*
       * A named track is an instruction, not a hint.
       *
       * `params.trackNumber` counts from 1, the way Premiere labels tracks in
       * the interface — A1 is index 0. If the editor named a track and it is
       * occupied, this refuses rather than placing the sound on a different
       * one. Quietly using another track means the sound lands somewhere they
       * did not look, and they discover it three edits later with no idea how
       * it got there.
       */
      var requested = params.trackNumber;
      if (requested !== null && requested !== undefined) {
        var wanted = Math.floor(requested) - 1;

        if (wanted < 0 || wanted >= seq.audioTracks.numTracks) {
          return SFXBox.fail(
            'host/no-such-track',
            'This sequence has no audio track A' + String(Math.floor(requested)) + '.',
            'tracks=' + String(seq.audioTracks.numTracks)
          );
        }

        if (!trackIsFree(seq.audioTracks[wanted], start, end)) {
          return SFXBox.fail(
            'host/track-busy',
            'A' + String(Math.floor(requested)) + ' already has a clip at the playhead.',
            'track=' + String(wanted)
          );
        }

        trackIndex = wanted;
      } else {
        // If the sequence has fewer tracks than the requested starting track,
        // add tracks first (bounded) so the search has somewhere to look.
        var addGuard = 0;
        while (seq.audioTracks.numTracks <= fromIndex && addGuard < 8) {
          if (!tryAddAudioTrack(seq)) {
            break;
          }
          createdLane = true;
          seq = activeSequence();
          addGuard += 1;
        }

        trackIndex = findFreeTrackIndex(seq, start, end, fromIndex);

        if (trackIndex === -1) {
          if (tryAddAudioTrack(seq)) {
            createdLane = true;
            seq = activeSequence();
            trackIndex = findFreeTrackIndex(seq, start, end, fromIndex);
          }
        }

        if (trackIndex === -1) {
          return SFXBox.fail(
            'host/no-audio-track-available',
            'Every audio track is busy or locked at the playhead, and a new track could not be created.',
            'sequence=' + String(seq.name)
          );
        }
      }

      var track = seq.audioTracks[trackIndex];

      try {
        // overwriteClip, never insertClip: the target region is already known to
        // be empty, and insertClip would ripple every downstream clip.
        track.overwriteClip(item, start);
      } catch (e) {
        return SFXBox.fail(
          'host/import-failed',
          'Premiere Pro refused to place the clip on the timeline.',
          SFXBox.describeThrown(e).detail
        );
      }

      var placed = findPlacedClip(track, start);
      var gainApplied = applyGain(placed, params.gainDb);

      return {
        host: 'premiere',
        imported: true,
        placed: true,
        timelineName: String(seq.name),
        startSeconds: start,
        laneIndex: trackIndex,
        appliedGainDb: gainApplied ? SFXBox.u.clamp(params.gainDb, MIN_GAIN_DB, MAX_GAIN_DB) : 0,
        gainApplied: gainApplied,
        createdLane: createdLane,
        trimApplied: trimApplied,
        placedDurationSeconds: duration
      };
    } finally {
      // The bin item is shared. Leaving it trimmed would shorten every later
      // use of this sound, including ones SFX Box has nothing to do with.
      if (originalPoints) {
        writePoints(item, originalPoints.inSeconds, originalPoints.outSeconds);
      }
    }
  };

  /* ---------------------------------------------------------------- *
   * Downloaded assets (Browser > Downloads): video and image placement
   *
   * Audio never comes through here — it uses importSfx, the proven path.
   * ---------------------------------------------------------------- */

  /**
   * Imports a downloaded video/image and places it on a video track at the
   * playhead. Never creates tracks and never overwrites: if no video track is
   * free for the clip's whole length it says so and places nothing.
   */
  api.importAsset = function (params) {
    if (params.importOnly) {
      return api.importSfx(params);
    }

    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail('host/no-active-timeline', 'Open a sequence in Premiere Pro before placing a clip.');
    }

    var file = new File(params.path);
    if (!file.exists) {
      return SFXBox.fail('host/file-not-found', 'That file is no longer on disk.', params.path);
    }

    var item = importOrReuse(params.path);
    if (SFXBox.isFailure(item)) {
      return item;
    }

    var frameRate = sequenceFrameRate(seq);
    var start = SFXBox.u.snapToFrame(playheadSeconds(seq), frameRate);
    var duration = itemDurationSeconds(item);
    // Duration is unknown for some items until they are opened; probe a short
    // span so the "is this track free" test still means something.
    var span = duration > 0 ? duration : params.kind === 'image' ? 5 : 1;
    var end = start + span;

    /*
     * Video files usually carry audio, and Premiere may place that audio on
     * the first audio track as well. Refuse rather than risk overwriting
     * existing audio on A1 — import to the project and place by hand instead.
     */
    if (params.kind === 'video' && seq.audioTracks.numTracks > 0 && !trackIsFree(seq.audioTracks[0], start, end)) {
      return SFXBox.fail(
        'host/track-busy',
        'Audio track A1 is in use at that time, and this video\u2019s own audio could replace it. Use "Import to project" and place it by hand, or move the playhead.'
      );
    }

    var trackIndex = -1;
    var i;
    for (i = 0; i < seq.videoTracks.numTracks; i += 1) {
      if (trackIsFree(seq.videoTracks[i], start, end)) {
        trackIndex = i;
        break;
      }
    }
    if (trackIndex === -1) {
      return SFXBox.fail(
        'host/no-video-track-available',
        'Every video track is busy at the playhead for the length of this clip.'
      );
    }

    try {
      // overwriteClip, never insertClip: the region is known to be empty.
      seq.videoTracks[trackIndex].overwriteClip(item, start);
    } catch (e) {
      return SFXBox.fail(
        'host/import-failed',
        'Premiere Pro refused to place the clip on the timeline.',
        SFXBox.describeThrown(e).detail
      );
    }

    return {
      host: 'premiere',
      imported: true,
      placed: true,
      kind: params.kind,
      laneKind: 'video',
      timelineName: String(seq.name),
      startSeconds: start,
      laneIndex: trackIndex,
      createdLane: false
    };
  };

  /* ---------------------------------------------------------------- *
   * Markers (Marker Mode)
   * ---------------------------------------------------------------- */

  /*
   * A marker that has been placed is flagged by prefixing its comments with
   * this tag, so a second "Apply" run can recognise and skip it. The tag is
   * stripped whenever markers are read back out.
   */
  var PLACED_FLAG = '[sfx placed]';

  function textOf(value) {
    try {
      return value === undefined || value === null ? '' : String(value);
    } catch (e) {
      return '';
    }
  }

  function stripFlag(comments) {
    var text = textOf(comments);
    if (text.indexOf(PLACED_FLAG) === 0) {
      return { placed: true, text: SFXBox.u.trim(text.substring(PLACED_FLAG.length)) };
    }
    return { placed: false, text: text };
  }

  function markerSeconds(marker, which) {
    try {
      return seconds(which === 'end' ? marker.end : marker.start);
    } catch (e) {
      return 0;
    }
  }

  function collectMarkers(seq) {
    var out = [];
    var guard = 0;
    var coll;
    var m;
    try {
      coll = seq.markers;
    } catch (e) {
      return out;
    }
    if (!coll) {
      return out;
    }
    try {
      m = coll.getFirstMarker();
    } catch (e2) {
      return out;
    }
    while (m && guard < 5000) {
      out[out.length] = m;
      guard += 1;
      try {
        m = coll.getNextMarker(m);
      } catch (e3) {
        break;
      }
    }
    return out;
  }

  api.listMarkers = function () {
    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail('host/no-active-timeline', 'Open a sequence in Premiere Pro first.');
    }

    var markers = collectMarkers(seq);
    var list = [];
    var i;
    var m;
    var flag;

    for (i = 0; i < markers.length; i += 1) {
      m = markers[i];
      flag = stripFlag(m.comments);
      list[list.length] = {
        index: i,
        startSeconds: markerSeconds(m, 'start'),
        endSeconds: markerSeconds(m, 'end'),
        name: textOf(m.name),
        comments: flag.text,
        placed: flag.placed
      };
    }

    return {
      host: 'premiere',
      timelineName: String(seq.name),
      frameRate: sequenceFrameRate(seq),
      markers: list
    };
  };

  function findMarker(markers, item, used) {
    var i;
    var m;
    for (i = 0; i < markers.length; i += 1) {
      if (used[i]) {
        continue;
      }
      m = markers[i];
      if (Math.abs(markerSeconds(m, 'start') - item.startSeconds) > 5e-4) {
        continue;
      }
      if (textOf(m.name) !== item.name) {
        continue;
      }
      if (stripFlag(m.comments).text !== item.comments) {
        continue;
      }
      used[i] = true;
      return m;
    }
    return null;
  }

  /**
   * After a run: flag (and optionally colour green) or delete the markers
   * that were placed. Each item is {startSeconds, name, comments, action}.
   */
  api.markMarkers = function (params) {
    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail('host/no-active-timeline', 'Open a sequence in Premiere Pro first.');
    }

    var markers = collectMarkers(seq);
    var used = {};
    var toDelete = [];
    var flagged = 0;
    var deleted = 0;
    var notFound = 0;
    var colourFailed = 0;
    var i;
    var item;
    var m;
    var existing;

    for (i = 0; i < params.items.length; i += 1) {
      item = params.items[i];
      m = findMarker(markers, item, used);
      if (!m) {
        notFound += 1;
        continue;
      }

      if (item.action === 'delete') {
        toDelete[toDelete.length] = m;
        continue;
      }

      try {
        existing = textOf(m.comments);
        if (existing.indexOf(PLACED_FLAG) !== 0) {
          m.comments = PLACED_FLAG + (existing === '' ? '' : ' ' + existing);
        }
        flagged += 1;
      } catch (e) {
        notFound += 1;
        continue;
      }

      if (item.action === 'green') {
        try {
          // Colour index 0 is green in Premiere's marker palette.
          m.setColorByIndex(0);
        } catch (e2) {
          colourFailed += 1;
        }
      }
    }

    for (i = 0; i < toDelete.length; i += 1) {
      try {
        seq.markers.deleteMarker(toDelete[i]);
        deleted += 1;
      } catch (e3) {
        notFound += 1;
      }
    }

    return { flagged: flagged, deleted: deleted, notFound: notFound, colourFailed: colourFailed };
  };

  /**
   * Puts markers back (ones Marker Mode deleted) and removes the placed flag
   * from ones it flagged. Used by "Undo last run".
   */
  api.restoreMarkers = function (params) {
    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail('host/no-active-timeline', 'Open a sequence in Premiere Pro first.');
    }

    var recreated = 0;
    var unflagged = 0;
    var i;
    var item;
    var created;
    var markers;
    var used = {};
    var m;
    var flag;

    for (i = 0; i < params.recreate.length; i += 1) {
      item = params.recreate[i];
      try {
        created = seq.markers.createMarker(item.startSeconds);
        created.name = item.name;
        created.comments = item.comments;
        recreated += 1;
      } catch (e) {
        // Counted by omission; the panel compares against what it asked for.
      }
    }

    markers = collectMarkers(seq);
    for (i = 0; i < params.unflag.length; i += 1) {
      item = params.unflag[i];
      m = null;
      var j;
      for (j = 0; j < markers.length; j += 1) {
        if (used[j]) {
          continue;
        }
        if (
          Math.abs(markerSeconds(markers[j], 'start') - item.startSeconds) <= 5e-4 &&
          textOf(markers[j].name) === item.name
        ) {
          used[j] = true;
          m = markers[j];
          break;
        }
      }
      if (!m) {
        continue;
      }
      try {
        flag = stripFlag(m.comments);
        if (flag.placed) {
          m.comments = flag.text;
          unflagged += 1;
        }
      } catch (e2) {
        // Leave it flagged; harmless.
      }
    }

    return { recreated: recreated, unflagged: unflagged };
  };

  function clipMatchesPath(clip, path) {
    var wanted = String(path).replace(/\\/g, '/').toLowerCase();
    var wantedName = SFXBox.u.baseNameOf(path).toLowerCase();
    var mediaPath = '';
    var clipName = '';

    try {
      if (clip.projectItem && typeof clip.projectItem.getMediaPath === 'function') {
        mediaPath = String(clip.projectItem.getMediaPath()).replace(/\\/g, '/').toLowerCase();
      }
    } catch (e) {
      mediaPath = '';
    }
    if (mediaPath !== '') {
      return mediaPath === wanted;
    }

    try {
      clipName = String(clip.name).toLowerCase();
    } catch (e2) {
      return false;
    }
    if (clipName === wantedName) {
      return true;
    }
    var dot = wantedName.lastIndexOf('.');
    return dot > 0 && clipName === wantedName.substring(0, dot);
  }

  /**
   * Removes clips a Marker Mode run placed. Premiere has no way to tag a
   * clip, so each one is found by track + start time + source file, and left
   * alone if anything about it no longer matches (the editor may have moved
   * or replaced it).
   */
  api.removePlacements = function (params) {
    var seq = activeSequence();
    if (!seq) {
      return SFXBox.fail('host/no-active-timeline', 'Open the sequence the run was applied to first.');
    }

    var removed = 0;
    var missing = 0;
    var i;
    var j;
    var p;
    var track;
    var clip;
    var found;

    for (i = 0; i < params.placements.length; i += 1) {
      p = params.placements[i];
      track = null;
      try {
        track = seq.audioTracks[p.laneIndex];
      } catch (e) {
        track = null;
      }
      if (!track || !track.clips) {
        missing += 1;
        continue;
      }

      found = null;
      for (j = 0; j < track.clips.numItems; j += 1) {
        clip = track.clips[j];
        if (Math.abs(seconds(clip.start) - p.startSeconds) < 1e-3 && clipMatchesPath(clip, p.path)) {
          found = clip;
          break;
        }
      }

      if (!found) {
        missing += 1;
        continue;
      }

      try {
        found.remove(false, false);
        removed += 1;
      } catch (e2) {
        missing += 1;
      }
    }

    return { removed: removed, missing: missing };
  };

  return api;
})();

// ---- 30-aftereffects.jsx ----
/*
 * SFX Box — After Effects host adapter.
 *
 * After Effects has no audio tracks. A composition is an ordered layer stack,
 * and an imported sound becomes a layer at index 1 with a `startTime`. That
 * makes the import far simpler than Premiere's — there is no occupancy problem
 * to solve, because layers may freely overlap — but it changes what the result
 * means, which is why `laneIndex` is documented as "layer index" for this host
 * and "track index" for Premiere.
 *
 * Two things here matter more than they look:
 *
 *   - Every mutation is wrapped in an undo group. Without one, After Effects
 *     records the import and the gain change as two separate steps, so a user
 *     pressing Cmd-Z once undoes the volume and leaves the layer behind.
 *   - Footage is reused when the same file is already in the project. Repeatedly
 *     importing the same effect otherwise fills the project panel with
 *     duplicates that all point at one file.
 */

SFXBox.aftereffects = (function () {
  var api = {};

  /** After Effects clamps audio levels to this range in the Levels property. */
  var MIN_GAIN_DB = -48;
  var MAX_GAIN_DB = 48;

  function activeComp() {
    try {
      var item = app.project.activeItem;
      if (item && item instanceof CompItem) {
        return item;
      }
    } catch (e) {
      // Falls through to null; reported as no-active-timeline.
    }
    return null;
  }

  function findFootageByPath(path) {
    var i;
    var item;
    var target = String(path).replace(/\\/g, '/').toLowerCase();

    for (i = 1; i <= app.project.numItems; i += 1) {
      item = app.project.item(i);
      if (!(item instanceof FootageItem)) {
        continue;
      }
      if (!item.file) {
        continue;
      }
      var fsName;
      try {
        fsName = String(item.file.fsName).replace(/\\/g, '/').toLowerCase();
      } catch (e) {
        continue;
      }
      if (fsName === target) {
        return item;
      }
    }
    return null;
  }

  function importOrReuse(path) {
    var existing = findFootageByPath(path);
    if (existing) {
      return existing;
    }

    var file = new File(path);
    if (!file.exists) {
      return SFXBox.fail('host/file-not-found', 'That audio file is no longer on disk.', path);
    }

    var footage;
    try {
      var options = new ImportOptions(file);
      footage = app.project.importFile(options);
    } catch (e) {
      return SFXBox.fail(
        'host/unsupported-media',
        'After Effects could not read this audio file.',
        SFXBox.describeThrown(e).detail
      );
    }

    if (!footage) {
      return SFXBox.fail('host/import-failed', 'After Effects returned no footage item.', path);
    }
    return footage;
  }

  function applyGain(layer, gainDb) {
    if (gainDb === 0) {
      return true;
    }
    try {
      var audioGroup = layer.property('ADBE Audio Group');
      if (!audioGroup) {
        return false;
      }
      var levels = audioGroup.property('ADBE Audio Levels');
      if (!levels) {
        return false;
      }
      var clamped = SFXBox.u.clamp(gainDb, MIN_GAIN_DB, MAX_GAIN_DB);
      levels.setValue([clamped, clamped]);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------------------------------------------------------- *
   * Commands
   * ---------------------------------------------------------------- */

  api.appVersion = function () {
    try {
      return String(app.version);
    } catch (e) {
      return 'unknown';
    }
  };

  api.projectInfo = function () {
    var name = 'Untitled Project';
    var path = '';
    try {
      if (app.project.file) {
        name = String(app.project.file.name);
        path = String(app.project.file.fsName);
      }
    } catch (e) {
      // Unsaved project; the defaults above are correct.
    }
    return { projectName: name, projectPath: path };
  };

  /**
   * Layer names whose in/out range overlaps a small window around a given
   * time. Bounded to LIMIT results and a single pass over the layer list, so
   * this stays cheap even on comps with a few hundred layers — nothing like
   * the project-wide walk usedPaths does.
   */
  function nearbyLayerNames(comp, centerSeconds, windowSeconds) {
    var LIMIT = 8;
    var names = [];
    var lo = centerSeconds - windowSeconds;
    var hi = centerSeconds + windowSeconds;
    var i;
    var layer;

    try {
      for (i = 1; i <= comp.numLayers && names.length < LIMIT; i += 1) {
        layer = comp.layer(i);
        if (!layer) continue;
        if (Number(layer.outPoint) >= lo && Number(layer.inPoint) <= hi) {
          names.push(String(layer.name));
        }
      }
    } catch (e) {
      // Best effort — whatever was collected before the failure is fine.
    }
    return names;
  }

  api.timelineInfo = function (params) {
    var comp = activeComp();
    if (!comp) {
      return {
        present: false,
        name: '',
        playheadSeconds: 0,
        durationSeconds: 0,
        frameRate: 0,
        laneCount: 0,
        selectedLayerName: '',
        nearbyLayerNames: []
      };
    }

    // Cheap by default: the panel polls this every second. Layer context is
    // only gathered when the caller asks for it (the AI SFX Assistant does).
    var wantContext = !!params && Number(params.contextWindowSeconds) > 0;
    var windowSeconds = wantContext ? Number(params.contextWindowSeconds) : 2;

    var selectedLayerName = '';
    if (wantContext) {
      try {
        var selected = comp.selectedLayers;
        if (selected && selected.length > 0) {
          selectedLayerName = String(selected[0].name);
        }
      } catch (e) {
        selectedLayerName = '';
      }
    }

    return {
      present: true,
      name: String(comp.name),
      playheadSeconds: Number(comp.time),
      durationSeconds: Number(comp.duration),
      frameRate: Number(comp.frameRate),
      laneCount: Number(comp.numLayers),
      selectedLayerName: selectedLayerName,
      nearbyLayerNames: wantContext ? nearbyLayerNames(comp, Number(comp.time), windowSeconds) : []
    };
  };

  // Keep Audio Tools' existing After Effects workflow intact while Premiere
  // gets its dedicated timeline-clip implementation above.
  api.selectedAudioClips = function () {
    var comp = activeComp();
    if (!comp) return { present: false, host: 'aftereffects', clips: [], count: 0,
      reason: 'No active composition. Open the composition containing the audio layer.' };
    var layers = comp.selectedLayers || [];
    var clips = [];
    var i;
    for (i = 0; i < layers.length; i += 1) {
      var layer = layers[i];
      if (!layer || !layer.hasAudio) continue;
      var mediaPath = '';
      try { if (layer.source && layer.source.file) mediaPath = String(layer.source.file.fsName || ''); } catch (ePath) {}
      clips.push({ name: String(layer.name || ''), trackIndex: Number(layer.index) - 1,
        trackNumber: Number(layer.index), clipIndex: Number(layer.index) - 1,
        timelineStart: Number(layer.inPoint), timelineEnd: Number(layer.outPoint),
        duration: Math.max(0, Number(layer.outPoint) - Number(layer.inPoint)),
        sourceIn: 0, sourceOut: Math.max(0, Number(layer.outPoint) - Number(layer.inPoint)),
        sourceMediaPath: mediaPath, nodeId: String(layer.index) });
    }
    return { present: true, host: 'aftereffects', sequenceName: String(comp.name),
      frameRate: Number(comp.frameRate), count: clips.length, clips: clips,
      reason: clips.length ? '' : 'No audio layers are selected in the active composition.' };
  };

  api.importSfx = function (params) {
    /*
     * Import-only mode (used by the Browser tab's fallback): add the file to
     * the project panel and stop. No composition is required.
     */
    if (params.importOnly) {
      var onlyUndo = false;
      try {
        app.beginUndoGroup('SFX Composer: import ' + SFXBox.u.baseNameOf(params.path));
        onlyUndo = true;
        var onlyFootage = importOrReuse(params.path);
        if (SFXBox.isFailure(onlyFootage)) {
          return onlyFootage;
        }
        return {
          host: 'aftereffects',
          imported: true,
          placed: false,
          timelineName: '',
          startSeconds: 0,
          laneIndex: -1,
          appliedGainDb: 0,
          gainApplied: false,
          createdLane: false,
          trimApplied: false,
          placedDurationSeconds: 0
        };
      } finally {
        if (onlyUndo) {
          app.endUndoGroup();
        }
      }
    }

    var comp = activeComp();
    if (!comp) {
      return SFXBox.fail(
        'host/no-active-timeline',
        'Open a composition in After Effects before importing a sound.'
      );
    }

    var undoOpen = false;
    try {
      app.beginUndoGroup('SFX Box: import ' + SFXBox.u.baseNameOf(params.path));
      undoOpen = true;

      var footage = importOrReuse(params.path);
      if (SFXBox.isFailure(footage)) {
        return footage;
      }

      var start = params.atPlayhead ? Number(comp.time) : 0;
      // Marker Mode places at an explicit time instead of the playhead.
      if (params.startSeconds !== null && params.startSeconds !== undefined) {
        start = params.startSeconds;
      }
      if (params.snapToFrame) {
        start = SFXBox.u.snapToFrame(start, Number(comp.frameRate));
      }

      var layer;
      try {
        layer = comp.layers.add(footage);
      } catch (e) {
        return SFXBox.fail(
          'host/import-failed',
          'After Effects refused to add the audio layer.',
          SFXBox.describeThrown(e).detail
        );
      }

      layer.startTime = start;

      // Marker Mode tags every layer it places so "Undo last run" can find
      // exactly those layers again, however the stack has changed since.
      if (params.runId) {
        try {
          layer.comment = 'SFXBox run ' + params.runId;
        } catch (e0) {
          // Untagged layers just can't be auto-removed; placement still stands.
        }
      }

      /*
       * Trimming an After Effects layer.
       *
       * `inPoint` and `outPoint` are composition times, not source times, and
       * `startTime` is where source-time zero sits on the composition timeline.
       * So placing source seconds [a, b] at composition time T means pushing
       * the layer's origin back by `a` and then cutting at T and T + (b - a):
       *
       *     startTime = T - a
       *     inPoint   = T
       *     outPoint  = T + (b - a)
       *
       * Setting `startTime` first is required — After Effects clamps inPoint
       * and outPoint against the source extent as it currently sits, so doing
       * it the other way round silently truncates the region.
       */
      var trimApplied = false;
      var placedDuration = Number(layer.outPoint) - Number(layer.inPoint);

      if (params.trim) {
        var length = params.trim.outSeconds - params.trim.inSeconds;
        try {
          layer.startTime = start - params.trim.inSeconds;
          layer.inPoint = start;
          layer.outPoint = start + length;
          trimApplied = true;
          placedDuration = length;
        } catch (e) {
          // Put the layer back to the untrimmed placement rather than leaving
          // it half-adjusted, and report the full length honestly.
          try {
            layer.startTime = start;
            layer.inPoint = start;
          } catch (e2) {
            // Nothing further to do; the layer is on the timeline either way.
          }
          placedDuration = Number(layer.outPoint) - Number(layer.inPoint);
        }
      }

      var gainApplied = applyGain(layer, params.gainDb);

      return {
        host: 'aftereffects',
        imported: true,
        placed: true,
        timelineName: String(comp.name),
        startSeconds: start,
        laneIndex: Number(layer.index),
        appliedGainDb: gainApplied ? SFXBox.u.clamp(params.gainDb, MIN_GAIN_DB, MAX_GAIN_DB) : 0,
        gainApplied: gainApplied,
        createdLane: false,
        trimApplied: trimApplied,
        placedDurationSeconds: placedDuration
      };
    } finally {
      if (undoOpen) {
        // Closing the group inside `finally` matters: an early return above
        // would otherwise leave After Effects recording every subsequent user
        // action into an SFX Box undo step.
        app.endUndoGroup();
      }
    }
  };

  /**
   * Downloaded video/image (Browser > Downloads): add as a layer at the
   * current time of the active composition. Existing layers are untouched.
   * Audio uses importSfx instead.
   */
  api.importAsset = function (params) {
    if (params.importOnly) {
      return api.importSfx(params);
    }

    var comp = activeComp();
    if (!comp) {
      return SFXBox.fail('host/no-active-timeline', 'Open a composition in After Effects before placing a clip.');
    }

    var undoOpen = false;
    try {
      app.beginUndoGroup('SFX Composer: add ' + SFXBox.u.baseNameOf(params.path));
      undoOpen = true;

      var footage = importOrReuse(params.path);
      if (SFXBox.isFailure(footage)) {
        return footage;
      }

      var start = SFXBox.u.snapToFrame(Number(comp.time), Number(comp.frameRate));
      var layer;
      try {
        layer = comp.layers.add(footage);
      } catch (e) {
        return SFXBox.fail(
          'host/import-failed',
          'After Effects could not add this file to the composition.',
          SFXBox.describeThrown(e).detail
        );
      }

      layer.startTime = start;
      if (params.kind === 'image') {
        // A still would otherwise run past the end of the composition.
        try {
          if (Number(comp.duration) > start) {
            layer.outPoint = Number(comp.duration);
          }
        } catch (e2) {
          // Leave the default length.
        }
      }

      return {
        host: 'aftereffects',
        imported: true,
        placed: true,
        kind: params.kind,
        laneKind: 'layer',
        timelineName: String(comp.name),
        startSeconds: start,
        laneIndex: Number(layer.index),
        createdLane: false
      };
    } finally {
      if (undoOpen) {
        app.endUndoGroup();
      }
    }
  };

  /**
   * Full composition structure for Scene Sound Designer.
   * Layer timing + footage paths. ExtendScript cannot cheaply sample pixels
   * without a render queue, so this is structural analysis (not vision).
   */
  api.compAnalysis = function () {
    var comp = activeComp();
    if (!comp) {
      return {
        present: false,
        host: 'aftereffects',
        name: '',
        durationSeconds: 0,
        frameRate: 0,
        width: 0,
        height: 0,
        playheadSeconds: 0,
        layers: []
      };
    }

    var layers = [];
    var i;
    var max = Number(comp.numLayers);
    var limit = max > 200 ? 200 : max;
    for (i = 1; i <= limit; i += 1) {
      try {
        var layer = comp.layer(i);
        var entry = {
          index: Number(layer.index),
          name: String(layer.name),
          inPoint: Number(layer.inPoint),
          outPoint: Number(layer.outPoint),
          startTime: Number(layer.startTime),
          enabled: layer.enabled !== false,
          locked: layer.locked === true,
          solo: layer.solo === true,
          hasVideo: false,
          hasAudio: false,
          isNull: false,
          isText: false,
          isCamera: false,
          isLight: false,
          footagePath: '',
          sourceName: ''
        };
        try {
          entry.hasVideo = layer.hasVideo === true;
          entry.hasAudio = layer.hasAudio === true;
        } catch (e0) {}
        try {
          entry.isNull = layer.nullLayer === true;
        } catch (e1) {}
        try {
          if (layer instanceof TextLayer) entry.isText = true;
        } catch (e2) {}
        try {
          if (layer instanceof CameraLayer) entry.isCamera = true;
        } catch (e3) {}
        try {
          if (layer instanceof LightLayer) entry.isLight = true;
        } catch (e4) {}
        try {
          var src = layer.source;
          if (src) {
            entry.sourceName = String(src.name || '');
            if (src instanceof FootageItem && src.file) {
              try {
                entry.footagePath = String(src.file.fsName);
              } catch (e5) {}
            }
          }
        } catch (e6) {}
        layers.push(entry);
      } catch (eLayer) {}
    }

    var width = 0;
    var height = 0;
    try {
      width = Number(comp.width);
      height = Number(comp.height);
    } catch (eWH) {}

    return {
      present: true,
      host: 'aftereffects',
      kind: 'composition',
      name: String(comp.name),
      durationSeconds: Number(comp.duration),
      frameRate: Number(comp.frameRate),
      width: width,
      height: height,
      playheadSeconds: Number(comp.time),
      layerCount: max,
      layersTruncated: max > limit,
      layers: layers
    };
  };


  api.setPlayhead = function (params) {
    var comp = activeComp();
    if (!comp) {
      return SFXBox.fail('host/no-active-timeline', 'Open a composition in After Effects first.');
    }
    var t = Number(params && params.seconds);
    if (!isFinite(t) || t < 0) {
      return SFXBox.fail('host/bad-params', 'Playhead time must be a non-negative number of seconds.');
    }
    try {
      var maxT = Number(comp.duration);
      if (isFinite(maxT) && t > maxT) t = maxT;
      comp.time = t;
    } catch (e) {
      return SFXBox.fail('host/command-failed', 'Could not set composition time.', SFXBox.describeThrown(e).detail);
    }
    return { ok: true, playheadSeconds: Number(comp.time), compositionName: String(comp.name) };
  };

  api.transport = function (params) {
    // After Effects has no reliable public “press spacebar” API from ExtendScript.
    return SFXBox.fail(
      'host/unsupported-here',
      'After Effects does not expose play/pause to this extension. The playhead can be moved with set_playhead; press Space in AE to preview.'
    );
  };

  /* ---------------------------------------------------------------- *
   * Markers (Marker Mode) — composition markers
   *
   * After Effects markers carry one text field (the comment). It is reported
   * as `name`; `comments` is always empty so both hosts return the same shape.
   * ---------------------------------------------------------------- */

  var PLACED_FLAG = '[sfx placed]';
  var GREEN_LABEL = 9;

  function textOf(value) {
    try {
      return value === undefined || value === null ? '' : String(value);
    } catch (e) {
      return '';
    }
  }

  function stripFlag(comment) {
    var text = textOf(comment);
    if (text.indexOf(PLACED_FLAG) === 0) {
      return { placed: true, text: SFXBox.u.trim(text.substring(PLACED_FLAG.length)) };
    }
    return { placed: false, text: text };
  }

  api.listMarkers = function () {
    var comp = activeComp();
    if (!comp) {
      return SFXBox.fail('host/no-active-timeline', 'Open a composition in After Effects first.');
    }

    var list = [];
    var prop = comp.markerProperty;
    var count = prop ? prop.numKeys : 0;
    var i;
    var value;
    var flag;
    var duration;

    for (i = 1; i <= count; i += 1) {
      value = prop.keyValue(i);
      flag = stripFlag(value.comment);
      duration = 0;
      try {
        duration = Number(value.duration) || 0;
      } catch (e) {
        duration = 0;
      }
      list[list.length] = {
        index: i - 1,
        startSeconds: Number(prop.keyTime(i)),
        endSeconds: Number(prop.keyTime(i)) + duration,
        name: flag.text,
        comments: '',
        placed: flag.placed
      };
    }

    return { host: 'aftereffects', timelineName: String(comp.name), frameRate: Number(comp.frameRate), markers: list };
  };

  function findKey(prop, item, used) {
    var i;
    var count = prop.numKeys;
    for (i = 1; i <= count; i += 1) {
      if (used[i]) {
        continue;
      }
      if (Math.abs(Number(prop.keyTime(i)) - item.startSeconds) > 5e-4) {
        continue;
      }
      if (stripFlag(prop.keyValue(i).comment).text !== item.name) {
        continue;
      }
      used[i] = true;
      return i;
    }
    return -1;
  }

  api.markMarkers = function (params) {
    var comp = activeComp();
    if (!comp) {
      return SFXBox.fail('host/no-active-timeline', 'Open a composition in After Effects first.');
    }

    var undoOpen = false;
    var flagged = 0;
    var deleted = 0;
    var notFound = 0;
    var colourFailed = 0;

    try {
      app.beginUndoGroup('SFX Composer: update markers');
      undoOpen = true;

      var prop = comp.markerProperty;
      var used = {};
      var deleteKeys = [];
      var i;
      var item;
      var key;
      var value;

      for (i = 0; i < params.items.length; i += 1) {
        item = params.items[i];
        key = findKey(prop, item, used);
        if (key === -1) {
          notFound += 1;
          continue;
        }

        if (item.action === 'delete') {
          deleteKeys[deleteKeys.length] = key;
          continue;
        }

        try {
          value = prop.keyValue(key);
          if (textOf(value.comment).indexOf(PLACED_FLAG) !== 0) {
            value.comment = PLACED_FLAG + ' ' + textOf(value.comment);
          }
          if (item.action === 'green') {
            try {
              value.label = GREEN_LABEL;
            } catch (e1) {
              colourFailed += 1;
            }
          }
          prop.setValueAtKey(key, value);
          flagged += 1;
        } catch (e2) {
          notFound += 1;
        }
      }

      // Highest index first, so earlier removals never shift later ones.
      deleteKeys.sort(function (a, b) {
        return b - a;
      });
      for (i = 0; i < deleteKeys.length; i += 1) {
        try {
          prop.removeKey(deleteKeys[i]);
          deleted += 1;
        } catch (e3) {
          notFound += 1;
        }
      }
    } finally {
      if (undoOpen) {
        app.endUndoGroup();
      }
    }

    return { flagged: flagged, deleted: deleted, notFound: notFound, colourFailed: colourFailed };
  };

  api.restoreMarkers = function (params) {
    var comp = activeComp();
    if (!comp) {
      return SFXBox.fail('host/no-active-timeline', 'Open a composition in After Effects first.');
    }

    var undoOpen = false;
    var recreated = 0;
    var unflagged = 0;

    try {
      app.beginUndoGroup('SFX Composer: restore markers');
      undoOpen = true;

      var prop = comp.markerProperty;
      var i;
      var item;
      var created;
      var key;
      var used = {};
      var value;

      for (i = 0; i < params.recreate.length; i += 1) {
        item = params.recreate[i];
        try {
          created = new MarkerValue(item.name);
          if (item.endSeconds > item.startSeconds) {
            created.duration = item.endSeconds - item.startSeconds;
          }
          prop.setValueAtTime(item.startSeconds, created);
          recreated += 1;
        } catch (e) {
          // Counted by omission.
        }
      }

      for (i = 0; i < params.unflag.length; i += 1) {
        item = params.unflag[i];
        key = findKey(prop, { startSeconds: item.startSeconds, name: item.name }, used);
        if (key === -1) {
          continue;
        }
        try {
          value = prop.keyValue(key);
          value.comment = stripFlag(value.comment).text;
          prop.setValueAtKey(key, value);
          unflagged += 1;
        } catch (e2) {
          // Leave it flagged; harmless.
        }
      }
    } finally {
      if (undoOpen) {
        app.endUndoGroup();
      }
    }

    return { recreated: recreated, unflagged: unflagged };
  };

  /** Removes every layer tagged with the run id (see importSfx). */
  api.removePlacements = function (params) {
    var comp = activeComp();
    if (!comp) {
      return SFXBox.fail('host/no-active-timeline', 'Open the composition the run was applied to first.');
    }

    var undoOpen = false;
    var removed = 0;
    var tag = 'SFXBox run ' + params.runId;

    try {
      app.beginUndoGroup('SFX Composer: undo marker run');
      undoOpen = true;

      var i;
      var layer;
      for (i = comp.numLayers; i >= 1; i -= 1) {
        layer = comp.layer(i);
        try {
          if (String(layer.comment) === tag) {
            layer.remove();
            removed += 1;
          }
        } catch (e) {
          // A layer that cannot be read or removed is left in place.
        }
      }
    } finally {
      if (undoOpen) {
        app.endUndoGroup();
      }
    }

    return { removed: removed, missing: Math.max(0, params.placements.length - removed) };
  };

  /**
   * Triggers After Effects' own Undo, for the AI SFX Assistant's Undo button
   * after an auto-placement. Deliberately just this — no bookkeeping of what
   * to undo, no custom stack. sfx.import already wraps its work in a single
   * beginUndoGroup/endUndoGroup, so one Undo always removes exactly the
   * layer that was auto-placed, same as pressing Ctrl+Z/Cmd+Z by hand.
   */
  api.undoLast = function () {
    try {
      app.executeCommand(app.findMenuCommandId('Undo'));
      return { undone: true };
    } catch (e) {
      return SFXBox.fail('host/undo-failed', 'Could not trigger Undo.', SFXBox.describeThrown(e).detail);
    }
  };

  return api;
})();

// ---- 40-dispatch.jsx ----
/*
 * SFX Box — host dispatcher.
 *
 * One entry point, `SFXBox.dispatch(jsonText)`, called by the panel through
 * CSInterface.evalScript. It decodes the request envelope, routes to the host
 * adapter for whichever application is running, and returns a reply envelope as
 * a magic-prefixed string.
 *
 * The contract this file enforces:
 *
 *   - It never throws. A thrown ExtendScript error crosses the CEP boundary as
 *     the useless string "EvalScript error.", indistinguishable from a syntax
 *     error in the bundle itself. Everything is caught and converted.
 *   - It always returns a string starting with REPLY_MAGIC, so the panel can
 *     tell an SFX Box reply from whatever else `evalScript` might hand back.
 *   - Commands are looked up in a table, not dispatched by `eval` or by string
 *     concatenation into a function name. The command name arrives from the
 *     panel and is therefore untrusted input to this runtime.
 */

SFXBox.detectHost = (function () {
  var cached = null;

  return function () {
    if (cached !== null) {
      return cached;
    }
    var appName = '';
    try {
      // BridgeTalk is present in every Adobe scripting host and is the only
      // reliable in-script identity check; `app` itself looks similar in both.
      appName = String(BridgeTalk.appName).toLowerCase();
    } catch (e) {
      appName = '';
    }

    if (appName.indexOf('premiere') !== -1) {
      cached = 'premiere';
    } else if (appName.indexOf('aftereffects') !== -1) {
      cached = 'aftereffects';
    } else {
      cached = 'unsupported';
    }
    return cached;
  };
})();

SFXBox.adapter = function () {
  var kind = SFXBox.detectHost();
  if (kind === 'premiere') {
    return SFXBox.premiere;
  }
  if (kind === 'aftereffects') {
    return SFXBox.aftereffects;
  }
  return null;
};

/**
 * Command table.
 *
 * Each handler receives the decoded params object and returns either a plain
 * result object or the output of SFXBox.fail. Handlers do not need their own
 * try/catch; dispatch wraps them.
 */
/*
 * Validates a trim region.
 *
 * Returns null for anything that is not a usable pair of finite, ordered,
 * non-negative seconds. Null means "place the whole file", which is a safe and
 * obvious outcome; a half-validated region would mean a clip of some
 * unpredictable length appearing on the user's timeline.
 */
/**
 * Reads a requested audio track number, or null for "wherever there is room".
 *
 * Validated rather than passed straight through: a NaN or a fraction reaching
 * the adapter becomes an array index, and `audioTracks[NaN]` is `undefined` —
 * which fails several lines later with an error naming neither the track nor
 * the cause.
 *
 * Counts from 1, matching the A1/A2/A3 labels in Premiere's own interface. The
 * adapter subtracts one; nothing above this line should have to know that.
 */
function readTrackNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  var number = Number(value);
  if (!isFinite(number) || number < 1) return null;

  return Math.floor(number);
}

/*
 * Audio file types the Browser tab offers. Whether a given one actually
 * imports depends on the Adobe application and version, so the host's own
 * import is still the final judge (it reports host/unsupported-media).
 */
var AUDIO_EXTENSIONS = ['wav', 'mp3', 'aif', 'aiff', 'm4a', 'aac', 'flac'];

var VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'avi', 'mxf', 'mkv', 'webm'];
var IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'bmp', 'psd', 'webp'];

/** 'audio' | 'video' | 'image' | '' (not importable). */
function assetKindOf(path) {
  var ext = SFXBox.u.extensionOf(path);
  if (SFXBox.u.indexOf(AUDIO_EXTENSIONS, ext) !== -1) return 'audio';
  if (SFXBox.u.indexOf(VIDEO_EXTENSIONS, ext) !== -1) return 'video';
  if (SFXBox.u.indexOf(IMAGE_EXTENSIONS, ext) !== -1) return 'image';
  return '';
}

function isAudioFileName(name) {
  return SFXBox.u.indexOf(AUDIO_EXTENSIONS, SFXBox.u.extensionOf(name)) !== -1;
}

function audioFilterPatterns() {
  var out = [];
  var i;
  for (i = 0; i < AUDIO_EXTENSIONS.length; i += 1) {
    out[out.length] = '*.' + AUDIO_EXTENSIONS[i];
  }
  return out.join(';');
}

function readSeconds(value) {
  if (value === null || value === undefined || value === '') return null;

  var number = Number(value);
  if (!isFinite(number) || number < 0) return null;

  return number;
}

function readRunId(value) {
  if (value === null || value === undefined) return null;

  // Letters and digits only: the id ends up inside an After Effects layer
  // comment and is compared as text, so nothing else is needed or wanted.
  var text = String(value).replace(/[^A-Za-z0-9]/g, '');
  return text === '' ? null : text.substring(0, 24);
}

function readMarkerItems(raw) {
  var out = [];
  var i;
  var item;
  var start;
  var end;

  if (!SFXBox.u.isArray(raw)) return out;

  for (i = 0; i < raw.length; i += 1) {
    item = raw[i];
    if (!item) continue;
    start = Number(item.startSeconds);
    if (!isFinite(start)) continue;
    end = Number(item.endSeconds);
    out[out.length] = {
      startSeconds: start,
      endSeconds: isFinite(end) ? end : start,
      name: item.name === undefined || item.name === null ? '' : String(item.name),
      comments: item.comments === undefined || item.comments === null ? '' : String(item.comments),
      action: item.action === 'delete' ? 'delete' : item.action === 'green' ? 'green' : 'flag'
    };
  }
  return out;
}

function readPlacements(raw) {
  var out = [];
  var i;
  var item;
  var start;
  var lane;

  if (!SFXBox.u.isArray(raw)) return out;

  for (i = 0; i < raw.length; i += 1) {
    item = raw[i];
    if (!item || typeof item.path !== 'string') continue;
    start = Number(item.startSeconds);
    lane = Number(item.laneIndex);
    if (!isFinite(start) || !isFinite(lane)) continue;
    out[out.length] = { path: item.path, startSeconds: start, laneIndex: lane };
  }
  return out;
}

function readTrim(raw) {
  if (!raw) return null;

  var inSeconds = Number(raw.inSeconds);
  var outSeconds = Number(raw.outSeconds);

  // `isFinite` rather than a comparison: NaN fails every comparison silently,
  // and NaN is exactly what `Number(undefined)` produces.
  if (!isFinite(inSeconds) || !isFinite(outSeconds)) return null;
  if (inSeconds < 0 || outSeconds <= inSeconds) return null;

  return { inSeconds: inSeconds, outSeconds: outSeconds };
}

SFXBox.commands = {
  'system.handshake': function (params) {
    var kind = SFXBox.detectHost();
    if (kind === 'unsupported') {
      return SFXBox.fail(
        'host/unknown',
        'SFX Box does not support this application.',
        'BridgeTalk.appName did not match Premiere Pro or After Effects.'
      );
    }
    return {
      hostKind: kind === 'premiere' ? 'premiere' : 'aftereffects',
      appVersion: SFXBox.adapter().appVersion(),
      hostBundleVersion: SFXBox.VERSION,
      echo: String(params && params.nonce !== undefined ? params.nonce : '')
    };
  },

  'project.info': function () {
    return SFXBox.adapter().projectInfo();
  },

  'timeline.info': function (params) {
    return SFXBox.adapter().timelineInfo(params);
  },

  'timeline.selection': function () {
    var adapter = SFXBox.adapter();
    if (typeof adapter.selectedAudioClips !== 'function') {
      return SFXBox.fail('host/unsupported-here', 'Audio-clip selection is available in Premiere Pro only.');
    }
    return adapter.selectedAudioClips();
  },

  'app.undoLast': function () {
    var adapter = SFXBox.adapter();
    if (typeof adapter.undoLast !== 'function') {
      return SFXBox.fail(
        'host/unsupported-here',
        'Undo isn\u2019t automated here \u2014 press Ctrl+Z / Cmd+Z instead.'
      );
    }
    return adapter.undoLast();
  },

  'project.usedPaths': function () {
    var adapter = SFXBox.adapter();
    if (typeof adapter.usedPaths !== 'function') {
      // After Effects can answer this too, but does not yet. An empty list is
      // the honest answer: nothing is known, so nothing is claimed.
      return { paths: [], truncated: false };
    }
    return adapter.usedPaths();
  },

  'sfx.replaceSelected': function (params) {
    if (!params || typeof params.path !== 'string' || params.path === '') {
      return SFXBox.fail('host/file-not-found', 'No audio file path was supplied.');
    }

    var adapter = SFXBox.adapter();
    if (typeof adapter.replaceSelected !== 'function') {
      /*
       * After Effects has no timeline clips to select in this sense.
       *
       * Said plainly rather than returning a generic failure: an editor in
       * After Effects who sees "not supported" understands immediately, where
       * "something went wrong" sends them to support.
       */
      return SFXBox.fail(
        'host/unsupported-here',
        'Replacing a clip works in Premiere Pro. In After Effects, import the sound and delete the old layer.'
      );
    }

    return adapter.replaceSelected({
      path: params.path,
      gainDb: Number(params.gainDb) || 0,
      target: params.target || null
    });
  },

  'sfx.import': function (params) {
    if (!params || typeof params.path !== 'string' || params.path === '') {
      return SFXBox.fail('host/file-not-found', 'No audio file path was supplied.');
    }
    var extension = SFXBox.u.extensionOf(params.path);
    if (extension === '') {
      return SFXBox.fail(
        'host/unsupported-media',
        'That file has no extension, so its format cannot be determined.',
        params.path
      );
    }
    /*
     * Params are rebuilt field by field rather than forwarded wholesale, so
     * that everything reaching an adapter has a known type. That is the right
     * default — ExtendScript has no types and a `NaN` arriving at
     * `overwriteClip` fails in a way nobody can read — but it does mean a new
     * field is silently dropped until it is added here. `trim` was.
     */
    return SFXBox.adapter().importSfx({
      path: params.path,
      gainDb: Number(params.gainDb) || 0,
      atPlayhead: params.atPlayhead !== false,
      snapToFrame: params.snapToFrame !== false,
      trackNumber: readTrackNumber(params.trackNumber),
      trim: readTrim(params.trim),
      startSeconds: readSeconds(params.startSeconds),
      firstTrack: readTrackNumber(params.firstTrack),
      runId: readRunId(params.runId),
      preventDuplicate: params.preventDuplicate === true,
      importOnly: params.importOnly === true
    });
  },

  /*
   * Browser > Downloads: import any downloaded asset, optionally placing it
   * at the playhead. Audio takes the same path as every other sound; video
   * and images are placed by the adapter's importAsset. The kind is decided
   * here from the extension, never trusted from the panel.
   */
  'asset.import': function (params) {
    if (!params || typeof params.path !== 'string' || params.path === '') {
      return SFXBox.fail('host/file-not-found', 'No file path was supplied.');
    }

    var kind = assetKindOf(params.path);
    if (kind === '') {
      return SFXBox.fail(
        'host/unsupported-media',
        'That file type cannot be imported (' + (SFXBox.u.extensionOf(params.path) || 'no extension') + ').',
        params.path
      );
    }

    var importOnly = params.mode === 'project';

    if (kind === 'audio') {
      return SFXBox.commands['sfx.import']({
        path: params.path,
        atPlayhead: true,
        snapToFrame: true,
        gainDb: 0,
        trackNumber: params.trackNumber,
        importOnly: importOnly
      });
    }

    var adapter = SFXBox.adapter();
    if (typeof adapter.importAsset !== 'function') {
      return SFXBox.fail('host/unsupported-here', 'This application cannot place video or images from here.');
    }
    return adapter.importAsset({ path: params.path, kind: kind, importOnly: importOnly });
  },


  'playhead.set': function (params) {
    var adapter = SFXBox.adapter();
    if (typeof adapter.setPlayhead !== 'function') {
      return SFXBox.fail('host/unsupported-here', 'Playhead control is not available in this application.');
    }
    return adapter.setPlayhead(params || {});
  },

  'transport.control': function (params) {
    var adapter = SFXBox.adapter();
    if (typeof adapter.transport !== 'function') {
      return SFXBox.fail('host/unsupported-here', 'Transport control is not available in this application.');
    }
    return adapter.transport(params || {});
  },

  'timeline.state': function () {
    var adapter = SFXBox.adapter();
    if (typeof adapter.seqAnalysis === 'function') return adapter.seqAnalysis();
    if (typeof adapter.compAnalysis === 'function') return adapter.compAnalysis();
    if (typeof adapter.timelineInfo === 'function') {
      var info = adapter.timelineInfo({ includeSelection: true, contextWindowSeconds: 0 });
      return info;
    }
    return SFXBox.fail('host/unsupported-here', 'Timeline state is not available.');
  },

  /* ---- Scene Sound Designer ---- */

  'comp.analysis': function () {
    var adapter = SFXBox.adapter();
    // Prefer host-specific deep analysis. Never run AE APIs on Premiere or vice versa.
    if (typeof adapter.seqAnalysis === 'function') {
      return adapter.seqAnalysis();
    }
    if (typeof adapter.compAnalysis === 'function') {
      return adapter.compAnalysis();
    }
    return SFXBox.fail(
      'host/unsupported-here',
      'Timeline analysis is not available in this application.'
    );
  },

  'timeline.analysis': function () {
    return SFXBox.commands['comp.analysis']();
  },

  /* ---- Marker Mode ---- */

  'markers.list': function () {
    var adapter = SFXBox.adapter();
    if (typeof adapter.listMarkers !== 'function') {
      return SFXBox.fail('host/unsupported-here', 'Markers are not available in this application.');
    }
    return adapter.listMarkers();
  },

  'markers.mark': function (params) {
    var adapter = SFXBox.adapter();
    if (typeof adapter.markMarkers !== 'function') {
      return SFXBox.fail('host/unsupported-here', 'Markers are not available in this application.');
    }
    return adapter.markMarkers({ items: readMarkerItems(params ? params.items : null) });
  },

  'markers.restore': function (params) {
    var adapter = SFXBox.adapter();
    if (typeof adapter.restoreMarkers !== 'function') {
      return SFXBox.fail('host/unsupported-here', 'Markers are not available in this application.');
    }
    return adapter.restoreMarkers({
      recreate: readMarkerItems(params ? params.recreate : null),
      unflag: readMarkerItems(params ? params.unflag : null)
    });
  },

  'markers.undoRun': function (params) {
    var adapter = SFXBox.adapter();
    if (typeof adapter.removePlacements !== 'function') {
      return SFXBox.fail('host/unsupported-here', 'Undo is not available in this application.');
    }
    return adapter.removePlacements({
      runId: readRunId(params ? params.runId : null) || '',
      placements: readPlacements(params ? params.placements : null)
    });
  },

  /*
   * Browser tab: let the user pick one audio file. Cancelling returns
   * {path: null} (not an error). The chosen file's extension is re-checked
   * here because the Windows dialog filter can be overridden by typing *.*
   */
  'fs.pickAudioFile': function (params) {
    var prompt = params && params.prompt ? String(params.prompt) : 'Choose an audio file';
    var startPath = params && params.startPath ? String(params.startPath) : '';
    var chosen = null;
    var isWindows = false;

    try {
      isWindows = String($.os).indexOf('Windows') !== -1;
    } catch (e0) {
      isWindows = false;
    }

    try {
      if (typeof app !== 'undefined' && typeof app.activate === 'function') {
        app.activate();
      }
    } catch (e) {
      // Not fatal: the dialog still opens, just possibly behind.
    }

    if (startPath !== '') {
      try {
        var start = new Folder(startPath);
        if (start.exists) {
          Folder.current = start;
        }
      } catch (e1) {
        // The dialog simply opens in its default folder.
      }
    }

    var filter = isWindows
      ? 'Audio files:' + audioFilterPatterns() + ',All files:*.*'
      : function (candidate) {
          return candidate instanceof Folder || isAudioFileName(candidate.name);
        };

    try {
      chosen = File.openDialog(prompt, filter, false);
    } catch (e2) {
      return SFXBox.fail('host/unknown', 'The file chooser could not be opened.', SFXBox.describeThrown(e2).detail);
    }

    if (!chosen) {
      return { path: null };
    }

    if (!isAudioFileName(chosen.name)) {
      return SFXBox.fail(
        'host/unsupported-media',
        'That file type is not a supported audio format (' + AUDIO_EXTENSIONS.join(', ') + ').',
        chosen.name
      );
    }

    return {
      path: String(chosen.fsName),
      name: String(chosen.name),
      sizeBytes: Number(chosen.length) || 0
    };
  },

  /*
   * Browser tab: the newest audio files in a folder (default: the user's
   * Downloads). This is how a file the user downloaded through a website's own
   * official download button reaches the panel, with no scraping involved.
   */
  'fs.recentAudio': function (params) {
    var folderPath = params && params.folderPath ? String(params.folderPath) : '~/Downloads';
    var limit = params ? Math.floor(Number(params.limit)) : 15;
    if (!isFinite(limit) || limit < 1) limit = 15;
    if (limit > 50) limit = 50;

    var folder = new Folder(folderPath);
    if (!folder.exists) {
      return { folderPath: folderPath, exists: false, files: [] };
    }

    var entries;
    try {
      entries = folder.getFiles();
    } catch (e) {
      return SFXBox.fail('host/unknown', 'That folder could not be read.', SFXBox.describeThrown(e).detail);
    }

    var found = [];
    var i;
    var entry;
    var size;
    var modified;
    for (i = 0; i < entries.length; i += 1) {
      entry = entries[i];
      // Name check first: it is free, whereas length/modified hit the disk.
      if (!(entry instanceof File) || !isAudioFileName(entry.name)) continue;
      size = Number(entry.length) || 0;
      if (size <= 0) continue;
      modified = 0;
      try {
        modified = entry.modified ? entry.modified.getTime() : 0;
      } catch (e2) {
        modified = 0;
      }
      found[found.length] = {
        path: String(entry.fsName),
        name: String(entry.name),
        sizeBytes: size,
        modifiedMs: modified
      };
    }

    found.sort(function (a, b) {
      return b.modifiedMs - a.modifiedMs;
    });

    return {
      folderPath: String(folder.fsName),
      exists: true,
      total: found.length,
      files: found.slice(0, limit)
    };
  },

  'fs.pickFolder': function (params) {
    var prompt = params && params.prompt ? String(params.prompt) : 'Choose a folder';
    var startPath = params && params.startPath ? String(params.startPath) : '';
    var chosen = null;

    /*
     * Bring the host forward before opening the dialog.
     *
     * A beta tester reported that the folder chooser "goes in the task bar"
     * rather than appearing on screen. That is what happens when the dialog is
     * opened while the *panel* holds focus: the operating system parents it to
     * an application that is not frontmost, so it opens behind everything and
     * announces itself with a flashing taskbar button. To the user, pressing
     * Add Folder simply does nothing.
     *
     * `app.activate()` puts Premiere or After Effects in front first, so the
     * dialog opens where the user is looking. It does not exist on every
     * version, hence the guard — and a dialog that opens behind is far better
     * than an import that throws.
     */
    try {
      if (typeof app !== 'undefined' && typeof app.activate === 'function') {
        app.activate();
      }
    } catch (e) {
      // Not fatal: the dialog still opens, just possibly behind.
    }

    if (startPath !== '') {
      var start = new Folder(startPath);
      if (start.exists) {
        chosen = start.selectDlg(prompt);
      }
    }
    if (chosen === null) {
      chosen = Folder.selectDialog(prompt);
    }

    return { path: chosen ? String(chosen.fsName) : null };
  }
};

/**
 * Entry point called from the panel.
 *
 * @param {string} jsonText A JSON-encoded RequestEnvelope.
 * @returns {string} REPLY_MAGIC followed by a JSON-encoded ResponseEnvelope.
 */
SFXBox.dispatch = function (jsonText) {
  var startedAt = new Date().getTime();
  var requestId = -1;
  var request = null;

  function reply(payload) {
    return SFXBox.REPLY_MAGIC + SFXBox.json.stringify(payload);
  }

  function failure(errorPayload) {
    return reply({
      id: requestId,
      ok: false,
      ms: new Date().getTime() - startedAt,
      error: {
        code: errorPayload.code,
        message: errorPayload.message,
        detail: errorPayload.detail
      }
    });
  }

  try {
    request = SFXBox.json.parse(jsonText);
  } catch (parseError) {
    return failure(
      SFXBox.fail(
        'host/parse-failure',
        'The host could not decode the request.',
        SFXBox.describeThrown(parseError).detail
      )
    );
  }

  if (!request || typeof request !== 'object') {
    return failure(SFXBox.fail('host/parse-failure', 'The request envelope was not an object.'));
  }

  requestId = typeof request.id === 'number' ? request.id : -1;

  if (request.v !== SFXBox.PROTOCOL_VERSION) {
    return failure(
      SFXBox.fail(
        'host/bad-protocol-version',
        'The panel and the host script are different versions. Reinstall SFX Box.',
        'panel=' + String(request.v) + ' host=' + String(SFXBox.PROTOCOL_VERSION)
      )
    );
  }

  var name = String(request.command);
  if (!Object.prototype.hasOwnProperty.call(SFXBox.commands, name)) {
    return failure(
      SFXBox.fail('host/unsupported-command', 'The host does not implement this command.', name)
    );
  }

  if (name !== 'system.handshake' && SFXBox.adapter() === null) {
    return failure(
      SFXBox.fail('host/unknown', 'SFX Box does not support this application.', 'no adapter')
    );
  }

  var outcome;
  try {
    outcome = SFXBox.commands[name](request.params);
  } catch (thrown) {
    return failure(SFXBox.describeThrown(thrown));
  }

  if (SFXBox.isFailure(outcome)) {
    return failure(outcome);
  }

  return reply({
    id: requestId,
    ok: true,
    ms: new Date().getTime() - startedAt,
    result: outcome === undefined ? null : outcome
  });
};

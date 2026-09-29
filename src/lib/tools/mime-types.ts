/**
 * MIME type lookup: a static table of common media types, searchable by
 * extension, by type or by free text. No network access; the table is the
 * whole database.
 */

export type MimeCategory = "text" | "image" | "audio" | "video" | "application" | "font" | "model" | "multipart" | "message";

export interface MimeEntry {
  type: string;
  extensions: string[];
  description: string;
  category: MimeCategory;
  /** Whether gzip/brotli is worth applying. Inferred from the type when omitted. */
  compressible?: boolean;
  notes?: string;
  /** Legacy or alternative type strings that map to this entry. */
  aliases?: string[];
}

export const MIME_CATEGORIES: MimeCategory[] = ["text", "application", "image", "audio", "video", "font", "model", "multipart", "message"];

const e = (type: string, extensions: string[], description: string, extra: Partial<Omit<MimeEntry, "type" | "extensions" | "description">> = {}): MimeEntry => ({
  type,
  extensions,
  description,
  category: (type.split("/")[0] as MimeCategory) ?? "application",
  ...extra,
});

export const MIME_TABLE: MimeEntry[] = [
  // ---- text
  e("text/html", ["html", "htm", "shtml"], "HTML document", { compressible: true }),
  e("text/css", ["css"], "Cascading Style Sheet", { compressible: true }),
  e("text/javascript", ["js", "mjs", "cjs"], "JavaScript module or script", { compressible: true, aliases: ["application/javascript", "application/x-javascript", "text/ecmascript"], notes: "text/javascript is the registered type (RFC 9239); application/javascript is obsolete but still common." }),
  e("text/plain", ["txt", "text", "log", "conf", "cfg", "env", "lock", "gitignore", "editorconfig"], "Plain text", { compressible: true }),
  e("text/csv", ["csv"], "Comma-separated values", { compressible: true }),
  e("text/tab-separated-values", ["tsv", "tab"], "Tab-separated values", { compressible: true }),
  e("text/markdown", ["md", "markdown", "mdx"], "Markdown", { compressible: true }),
  e("text/xml", ["xml"], "XML document (text form)", { compressible: true, notes: "application/xml is equivalent; text/xml implies human-readable defaults." }),
  e("text/calendar", ["ics", "ifb"], "iCalendar events", { compressible: true }),
  e("text/vcard", ["vcf", "vcard"], "vCard contact", { compressible: true }),
  e("text/event-stream", [], "Server-Sent Events stream", { compressible: false, notes: "Do not buffer or compress; send with Cache-Control: no-cache." }),
  e("text/x-typescript", ["ts", "mts", "cts"], "TypeScript source", { compressible: true, notes: "Unofficial. The .ts extension is also video/mp2t (MPEG transport stream); servers often pick that for .ts files." }),
  e("text/tsx", ["tsx"], "TypeScript JSX source", { compressible: true, notes: "Unofficial; text/plain in most servers." }),
  e("text/jsx", ["jsx"], "JavaScript JSX source", { compressible: true }),
  e("text/x-vue", ["vue"], "Vue single-file component", { compressible: true, notes: "Unofficial." }),
  e("text/x-svelte", ["svelte"], "Svelte component", { compressible: true, notes: "Unofficial." }),
  e("text/x-php", ["php", "phtml"], "PHP source", { compressible: true, aliases: ["application/x-httpd-php"] }),
  e("text/x-python", ["py", "pyw", "pyi"], "Python source", { compressible: true, aliases: ["application/x-python-code"] }),
  e("text/x-ruby", ["rb", "erb", "rake"], "Ruby source", { compressible: true }),
  e("text/x-go", ["go"], "Go source", { compressible: true }),
  e("text/x-rust", ["rs"], "Rust source", { compressible: true }),
  e("text/x-java-source", ["java"], "Java source", { compressible: true }),
  e("text/x-kotlin", ["kt", "kts"], "Kotlin source", { compressible: true }),
  e("text/x-swift", ["swift"], "Swift source", { compressible: true }),
  e("text/x-c", ["c", "h"], "C source or header", { compressible: true }),
  e("text/x-c++", ["cpp", "cc", "cxx", "hpp", "hh"], "C++ source or header", { compressible: true }),
  e("text/x-csharp", ["cs"], "C# source", { compressible: true }),
  e("text/x-scala", ["scala", "sc"], "Scala source", { compressible: true }),
  e("text/x-dart", ["dart"], "Dart source", { compressible: true }),
  e("text/x-lua", ["lua"], "Lua source", { compressible: true }),
  e("text/x-perl", ["pl", "pm"], "Perl source", { compressible: true }),
  e("text/x-shellscript", ["sh", "bash", "zsh", "fish"], "Shell script", { compressible: true, aliases: ["application/x-sh", "application/x-shellscript"] }),
  e("text/x-msdos-batch", ["bat", "cmd"], "Windows batch file", { compressible: true, aliases: ["application/x-bat"] }),
  e("text/x-powershell", ["ps1", "psm1", "psd1"], "PowerShell script", { compressible: true }),
  e("text/x-sql", ["sql"], "SQL script", { compressible: true, aliases: ["application/sql"] }),
  e("text/x-ini", ["ini"], "INI configuration", { compressible: true }),
  e("application/toml", ["toml"], "TOML configuration", { compressible: true }),
  e("text/x-makefile", ["mk", "makefile"], "Makefile", { compressible: true }),
  e("text/x-dockerfile", ["dockerfile"], "Dockerfile", { compressible: true }),
  e("text/x-diff", ["diff", "patch"], "Unified diff / patch", { compressible: true }),
  e("text/x-properties", ["properties"], "Java properties file", { compressible: true }),
  e("text/x-tex", ["tex", "latex"], "TeX / LaTeX source", { compressible: true, aliases: ["application/x-tex"] }),
  e("text/x-handlebars-template", ["hbs", "handlebars"], "Handlebars template", { compressible: true }),
  e("text/x-scss", ["scss"], "SCSS stylesheet", { compressible: true }),
  e("text/x-sass", ["sass"], "Sass stylesheet", { compressible: true }),
  e("text/x-less", ["less"], "Less stylesheet", { compressible: true }),
  e("text/vtt", ["vtt"], "WebVTT subtitles", { compressible: true }),
  e("text/x-ssa", ["srt", "ssa", "ass"], "SubRip / SSA subtitles", { compressible: true, aliases: ["application/x-subrip"] }),
  e("text/uri-list", ["uri", "uris", "urls"], "List of URIs", { compressible: true }),
  e("text/x-component", ["htc"], "HTML component (legacy IE)", { compressible: true }),
  e("text/troff", ["man", "roff", "tr"], "troff / man page", { compressible: true }),
  e("text/x-asm", ["s", "asm"], "Assembly source", { compressible: true }),
  e("text/x-nfo", ["nfo"], "NFO information file", { compressible: true }),
  e("text/turtle", ["ttl"], "RDF Turtle", { compressible: true }),
  e("text/n3", ["n3"], "Notation3 RDF", { compressible: true }),
  e("text/cache-manifest", ["appcache", "manifest"], "AppCache manifest (obsolete)", { compressible: true }),

  // ---- application: data & config
  e("application/json", ["json", "geojson"], "JSON document", { compressible: true, notes: "No charset parameter is needed: JSON is always UTF-8 (RFC 8259)." }),
  e("application/ld+json", ["jsonld"], "JSON-LD linked data", { compressible: true }),
  e("application/problem+json", [], "RFC 9457 problem details (error responses)", { compressible: true }),
  e("application/x-ndjson", ["ndjson", "jsonl"], "Newline-delimited JSON", { compressible: true, aliases: ["application/jsonl", "application/x-jsonlines", "application/jsonlines"] }),
  e("application/json-patch+json", ["json-patch"], "JSON Patch document (RFC 6902)", { compressible: true }),
  e("application/merge-patch+json", [], "JSON Merge Patch (RFC 7396)", { compressible: true }),
  e("application/schema+json", [], "JSON Schema", { compressible: true }),
  e("application/vnd.api+json", [], "JSON:API document", { compressible: true }),
  e("application/geo+json", [], "GeoJSON (registered type)", { compressible: true }),
  e("application/xml", ["xsl", "xsd", "rng", "xslt"], "XML document", { compressible: true }),
  e("application/xhtml+xml", ["xhtml", "xht"], "XHTML document", { compressible: true }),
  e("application/rss+xml", ["rss"], "RSS feed", { compressible: true }),
  e("application/atom+xml", ["atom"], "Atom feed", { compressible: true }),
  e("application/soap+xml", [], "SOAP envelope", { compressible: true }),
  e("application/x-www-form-urlencoded", [], "URL-encoded form body (key=value&…)", { compressible: true, notes: "Default encoding for HTML forms and most REST clients' form bodies." }),
  e("application/yaml", ["yaml", "yml"], "YAML document", { compressible: true, aliases: ["application/x-yaml", "text/yaml", "text/x-yaml"], notes: "application/yaml was registered in RFC 9512 (2024); application/x-yaml and text/yaml are common legacy forms." }),
  e("application/manifest+json", ["webmanifest"], "Web app manifest (PWA)", { compressible: true }),
  e("application/importmap+json", [], "JavaScript import map", { compressible: true }),
  e("application/graphql", ["graphql", "gql"], "GraphQL query document", { compressible: true, aliases: ["application/graphql+json", "application/graphql-response+json"] }),
  e("application/x-protobuf", ["proto"], "Protocol Buffers (schema source or binary)", { compressible: true, aliases: ["application/protobuf", "application/vnd.google.protobuf"] }),
  e("application/grpc", [], "gRPC framed message", { compressible: false, aliases: ["application/grpc+proto"] }),
  e("application/x-parquet", ["parquet"], "Apache Parquet columnar data", { compressible: false, aliases: ["application/vnd.apache.parquet"] }),
  e("application/avro", ["avro"], "Apache Avro container", { compressible: false, aliases: ["application/vnd.apache.avro"] }),
  e("application/vnd.apache.arrow.file", ["arrow", "feather"], "Apache Arrow IPC file", { compressible: false }),
  e("application/x-sqlite3", ["sqlite", "sqlite3", "db"], "SQLite database", { compressible: true, aliases: ["application/vnd.sqlite3"] }),
  e("application/octet-stream", ["bin", "dat", "so", "dll", "class", "img", "iso"], "Arbitrary binary data", { compressible: false, notes: "The fallback for unknown files; browsers download rather than render it." }),
  e("application/pdf", ["pdf"], "PDF document", { compressible: false, aliases: ["application/x-pdf"] }),
  e("application/postscript", ["ps", "eps", "ai"], "PostScript", { compressible: true }),
  e("application/rtf", ["rtf"], "Rich Text Format", { compressible: true, aliases: ["text/rtf"] }),
  e("application/epub+zip", ["epub"], "EPUB e-book", { compressible: false }),
  e("application/x-mobipocket-ebook", ["mobi", "prc"], "Mobipocket e-book", { compressible: false }),
  e("application/wasm", ["wasm"], "WebAssembly binary", { compressible: true, notes: "Must be served exactly as application/wasm for WebAssembly.instantiateStreaming." }),
  e("application/x-source-map", ["map"], "Source map", { compressible: true, aliases: ["application/json"], notes: "Usually served as application/json." }),
  e("application/pkcs8", ["p8", "key"], "PKCS #8 private key", { compressible: true }),
  e("application/x-pem-file", ["pem", "crt", "cer"], "PEM certificate or key", { compressible: true, aliases: ["application/x-x509-ca-cert"] }),
  e("application/pkix-cert", ["der"], "DER-encoded X.509 certificate", { compressible: false }),
  e("application/x-pkcs12", ["p12", "pfx"], "PKCS #12 keystore", { compressible: false }),
  e("application/pgp-signature", ["sig", "asc"], "PGP signature", { compressible: true }),
  e("application/jwt", ["jwt"], "JSON Web Token (compact)", { compressible: true }),
  e("application/jose", [], "JOSE compact serialization", { compressible: true }),
  e("application/x-httpd-cgi", ["cgi"], "CGI script", { compressible: true }),
  e("application/mbox", ["mbox"], "mbox mailbox", { compressible: true }),
  e("application/vnd.ms-fontobject", ["eot"], "Embedded OpenType font (IE)", { compressible: false }),
  e("application/x-tar", ["tar"], "tar archive", { compressible: true }),
  e("application/gzip", ["gz", "gzip", "tgz"], "gzip compressed data", { compressible: false, aliases: ["application/x-gzip"] }),
  e("application/zip", ["zip"], "ZIP archive", { compressible: false, aliases: ["application/x-zip-compressed"] }),
  e("application/x-7z-compressed", ["7z"], "7-Zip archive", { compressible: false }),
  e("application/vnd.rar", ["rar"], "RAR archive", { compressible: false, aliases: ["application/x-rar-compressed"] }),
  e("application/x-bzip2", ["bz2", "boz"], "bzip2 compressed data", { compressible: false }),
  e("application/x-xz", ["xz"], "xz compressed data", { compressible: false }),
  e("application/zstd", ["zst"], "Zstandard compressed data", { compressible: false }),
  e("application/x-lzma", ["lzma"], "LZMA compressed data", { compressible: false }),
  e("application/x-apple-diskimage", ["dmg"], "macOS disk image", { compressible: false }),
  e("application/vnd.microsoft.portable-executable", ["exe"], "Windows executable", { compressible: false, aliases: ["application/x-msdownload", "application/x-msdos-program"] }),
  e("application/x-msi", ["msi"], "Windows Installer package", { compressible: false }),
  e("application/vnd.android.package-archive", ["apk"], "Android package", { compressible: false }),
  e("application/octet-stream+ipa", ["ipa"], "iOS app archive (zip)", { compressible: false, notes: "No registered type; application/octet-stream is what most servers send." }),
  e("application/vnd.debian.binary-package", ["deb"], "Debian package", { compressible: false, aliases: ["application/x-debian-package"] }),
  e("application/x-rpm", ["rpm"], "RPM package", { compressible: false }),
  e("application/java-archive", ["jar", "war", "ear"], "Java archive", { compressible: false }),
  e("application/x-shockwave-flash", ["swf"], "Flash movie (obsolete)", { compressible: false }),
  e("application/x-bittorrent", ["torrent"], "BitTorrent metainfo", { compressible: true }),
  e("application/x-mpegURL", ["m3u8", "m3u"], "HLS playlist", { compressible: true, aliases: ["application/vnd.apple.mpegurl", "audio/mpegurl"] }),
  e("application/dash+xml", ["mpd"], "MPEG-DASH manifest", { compressible: true }),
  e("application/x-httpd-php-source", ["phps"], "PHP source (display)", { compressible: true }),
  e("application/vnd.google-earth.kml+xml", ["kml"], "KML geographic data", { compressible: true }),
  e("application/gpx+xml", ["gpx"], "GPS exchange format", { compressible: true }),
  e("application/x-tex-tfm", ["tfm"], "TeX font metrics", { compressible: false }),
  e("application/x-latex", ["ltx"], "LaTeX document", { compressible: true }),
  e("application/x-bibtex", ["bib"], "BibTeX bibliography", { compressible: true }),
  e("application/x-chrome-extension", ["crx"], "Chrome extension package", { compressible: false }),
  e("application/x-xpinstall", ["xpi"], "Firefox extension package", { compressible: false }),
  e("application/x-web-app-manifest+json", [], "Legacy web app manifest", { compressible: true }),
  e("application/ogg", ["ogx"], "Ogg container (mixed)", { compressible: false }),
  e("application/x-font-type1", ["pfa", "pfb"], "Type 1 font", { compressible: false }),

  // ---- application: office
  e("application/msword", ["doc", "dot"], "Word 97-2003 document", { compressible: false }),
  e("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ["docx"], "Word document (OOXML)", { compressible: false }),
  e("application/vnd.openxmlformats-officedocument.wordprocessingml.template", ["dotx"], "Word template (OOXML)", { compressible: false }),
  e("application/vnd.ms-excel", ["xls", "xlt", "xla"], "Excel 97-2003 workbook", { compressible: false }),
  e("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ["xlsx"], "Excel workbook (OOXML)", { compressible: false }),
  e("application/vnd.ms-excel.sheet.macroEnabled.12", ["xlsm"], "Excel macro-enabled workbook", { compressible: false }),
  e("application/vnd.ms-powerpoint", ["ppt", "pps", "pot"], "PowerPoint 97-2003 presentation", { compressible: false }),
  e("application/vnd.openxmlformats-officedocument.presentationml.presentation", ["pptx"], "PowerPoint presentation (OOXML)", { compressible: false }),
  e("application/vnd.openxmlformats-officedocument.presentationml.slideshow", ["ppsx"], "PowerPoint slideshow (OOXML)", { compressible: false }),
  e("application/vnd.oasis.opendocument.text", ["odt"], "OpenDocument text", { compressible: false }),
  e("application/vnd.oasis.opendocument.spreadsheet", ["ods"], "OpenDocument spreadsheet", { compressible: false }),
  e("application/vnd.oasis.opendocument.presentation", ["odp"], "OpenDocument presentation", { compressible: false }),
  e("application/vnd.oasis.opendocument.graphics", ["odg"], "OpenDocument drawing", { compressible: false }),
  e("application/vnd.visio", ["vsd", "vsdx"], "Visio drawing", { compressible: false }),
  e("application/vnd.ms-outlook", ["msg"], "Outlook message", { compressible: false }),
  e("application/vnd.apple.pages", ["pages"], "Apple Pages document", { compressible: false }),
  e("application/vnd.apple.numbers", ["numbers"], "Apple Numbers spreadsheet", { compressible: false }),
  e("application/vnd.apple.keynote", ["key"], "Apple Keynote presentation", { compressible: false }),
  e("application/vnd.amazon.ebook", ["azw", "azw3"], "Kindle e-book", { compressible: false }),

  // ---- image
  e("image/png", ["png"], "PNG image", { compressible: false, aliases: ["image/x-png"] }),
  e("image/jpeg", ["jpg", "jpeg", "jpe", "jfif"], "JPEG image", { compressible: false, aliases: ["image/jpg", "image/pjpeg"] }),
  e("image/gif", ["gif"], "GIF image", { compressible: false }),
  e("image/webp", ["webp"], "WebP image", { compressible: false }),
  e("image/avif", ["avif"], "AVIF image", { compressible: false }),
  e("image/apng", ["apng"], "Animated PNG", { compressible: false }),
  e("image/svg+xml", ["svg", "svgz"], "SVG vector image", { compressible: true, notes: "Serve inline SVG with a strict CSP; it can contain scripts." }),
  e("image/x-icon", ["ico", "cur"], "Windows icon", { compressible: false, aliases: ["image/vnd.microsoft.icon"] }),
  e("image/bmp", ["bmp", "dib"], "Bitmap image", { compressible: true, aliases: ["image/x-ms-bmp"] }),
  e("image/tiff", ["tif", "tiff"], "TIFF image", { compressible: false }),
  e("image/heic", ["heic"], "HEIC image (Apple)", { compressible: false }),
  e("image/heif", ["heif"], "HEIF image", { compressible: false }),
  e("image/jxl", ["jxl"], "JPEG XL image", { compressible: false }),
  e("image/jp2", ["jp2", "j2k"], "JPEG 2000 image", { compressible: false }),
  e("image/x-adobe-dng", ["dng"], "Adobe DNG raw photo", { compressible: false }),
  e("image/x-canon-cr2", ["cr2"], "Canon raw photo", { compressible: false }),
  e("image/vnd.adobe.photoshop", ["psd"], "Photoshop document", { compressible: false, aliases: ["application/x-photoshop"] }),
  e("image/x-xcf", ["xcf"], "GIMP image", { compressible: false }),
  e("image/x-portable-pixmap", ["ppm"], "Portable pixmap", { compressible: true }),
  e("image/x-tga", ["tga"], "Targa image", { compressible: false }),
  e("image/vnd.dwg", ["dwg"], "AutoCAD drawing", { compressible: false }),

  // ---- audio
  e("audio/mpeg", ["mp3", "mpga", "m2a"], "MP3 audio", { compressible: false, aliases: ["audio/mp3"] }),
  e("audio/wav", ["wav"], "WAV audio", { compressible: false, aliases: ["audio/x-wav", "audio/wave", "audio/vnd.wave"] }),
  e("audio/ogg", ["oga", "ogg", "opus", "spx"], "Ogg audio (Vorbis / Opus)", { compressible: false }),
  e("audio/flac", ["flac"], "FLAC lossless audio", { compressible: false, aliases: ["audio/x-flac"] }),
  e("audio/aac", ["aac"], "AAC audio (ADTS)", { compressible: false }),
  e("audio/mp4", ["m4a", "m4b"], "MP4 audio (AAC / ALAC)", { compressible: false, aliases: ["audio/x-m4a"] }),
  e("audio/webm", ["weba"], "WebM audio", { compressible: false }),
  e("audio/midi", ["mid", "midi"], "MIDI sequence", { compressible: false, aliases: ["audio/x-midi"] }),
  e("audio/aiff", ["aif", "aiff", "aifc"], "AIFF audio", { compressible: false, aliases: ["audio/x-aiff"] }),
  e("audio/amr", ["amr"], "AMR speech audio", { compressible: false }),
  e("audio/x-ms-wma", ["wma"], "Windows Media Audio", { compressible: false }),
  e("audio/3gpp", ["3ga"], "3GPP audio", { compressible: false }),

  // ---- video
  e("video/mp4", ["mp4", "m4v", "mp4v"], "MP4 video", { compressible: false }),
  e("video/webm", ["webm"], "WebM video", { compressible: false }),
  e("video/quicktime", ["mov", "qt"], "QuickTime video", { compressible: false }),
  e("video/x-matroska", ["mkv", "mk3d"], "Matroska video", { compressible: false, aliases: ["video/matroska"] }),
  e("video/x-msvideo", ["avi"], "AVI video", { compressible: false, aliases: ["video/avi", "video/msvideo"] }),
  e("video/mp2t", ["ts", "m2t", "m2ts", "mts"], "MPEG transport stream (HLS segment)", { compressible: false, notes: "Most static servers map .ts to this, not to TypeScript." }),
  e("video/mpeg", ["mpeg", "mpg", "mpe"], "MPEG-1/2 video", { compressible: false }),
  e("video/3gpp", ["3gp"], "3GPP mobile video", { compressible: false }),
  e("video/x-flv", ["flv"], "Flash video", { compressible: false }),
  e("video/x-ms-wmv", ["wmv"], "Windows Media Video", { compressible: false }),
  e("video/ogg", ["ogv"], "Ogg video (Theora)", { compressible: false }),
  e("video/x-m4v", [], "M4V video (Apple)", { compressible: false }),

  // ---- font
  e("font/woff", ["woff"], "WOFF web font", { compressible: false }),
  e("font/woff2", ["woff2"], "WOFF2 web font", { compressible: false, notes: "Already Brotli-compressed; never gzip it again." }),
  e("font/ttf", ["ttf"], "TrueType font", { compressible: true, aliases: ["application/x-font-ttf", "application/font-sfnt"] }),
  e("font/otf", ["otf"], "OpenType font", { compressible: true, aliases: ["application/x-font-otf", "application/vnd.ms-opentype"] }),
  e("font/collection", ["ttc"], "TrueType collection", { compressible: true }),
  e("font/sfnt", [], "Generic SFNT font", { compressible: true }),

  // ---- model
  e("model/gltf+json", ["gltf"], "glTF 3D scene (JSON)", { compressible: true }),
  e("model/gltf-binary", ["glb"], "glTF 3D scene (binary)", { compressible: false }),
  e("model/obj", ["obj"], "Wavefront OBJ mesh", { compressible: true }),
  e("model/stl", ["stl"], "STL 3D model", { compressible: true }),
  e("model/3mf", ["3mf"], "3D Manufacturing Format", { compressible: false }),
  e("model/vnd.usdz+zip", ["usdz"], "USDZ AR scene (Apple)", { compressible: false }),
  e("model/mtl", ["mtl"], "Wavefront material library", { compressible: true }),
  e("model/vrml", ["wrl", "vrml"], "VRML scene", { compressible: true }),

  // ---- multipart & message
  e("multipart/form-data", [], "Multipart form upload (files and fields)", { compressible: false, notes: "Clients add a boundary parameter; never set the header by hand." }),
  e("multipart/mixed", [], "Multiple unrelated parts (email attachments)", { compressible: false }),
  e("multipart/byteranges", [], "Multiple byte ranges (206 Partial Content)", { compressible: false }),
  e("multipart/related", [], "Related parts, e.g. MHTML", { compressible: false }),
  e("multipart/alternative", [], "Same content in several formats (email)", { compressible: false }),
  e("message/rfc822", ["eml", "mime"], "Email message", { compressible: true }),
  e("message/http", [], "HTTP message (for TRACE)", { compressible: true }),
  e("message/global", ["u8msg"], "Internationalised email message", { compressible: true }),
];

const byType = new Map<string, MimeEntry>();
const byExt = new Map<string, MimeEntry[]>();
for (const entry of MIME_TABLE) {
  byType.set(entry.type.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) if (!byType.has(alias.toLowerCase())) byType.set(alias.toLowerCase(), entry);
  for (const ext of entry.extensions) byExt.set(ext, [...(byExt.get(ext) ?? []), entry]);
}

/** Extract a bare, lower-case extension from "png", ".png", "file.png", "/a/b.tar.gz" or a URL with query/hash. */
export function normalizeExtension(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return "";
  const cut = s.search(/[?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  s = s.split(/[\\/]/).pop() ?? s;
  if (s.startsWith(".")) s = s.slice(1);
  const dot = s.lastIndexOf(".");
  if (dot >= 0) s = s.slice(dot + 1);
  return s.replace(/[^a-z0-9+-]/g, "");
}

/** Strip parameters (`; charset=utf-8`) and lower-case a media type. */
export function normalizeType(input: string): string {
  return input.trim().split(";")[0].trim().toLowerCase();
}

export function lookupByExtension(input: string): MimeEntry[] {
  const ext = normalizeExtension(input);
  return ext ? (byExt.get(ext) ?? []) : [];
}

export function lookupByType(input: string): MimeEntry | null {
  return byType.get(normalizeType(input)) ?? null;
}

export type QueryKind = "type" | "extension" | "text";

/** Guess whether a query is a media type, a file/extension/URL, or free text. */
export function detectQueryKind(query: string): QueryKind {
  const q = query.trim();
  if (!q) return "text";
  if (/^[a-z]+\/[a-z0-9.+-]+(\s*;.*)?$/i.test(q)) return "type";
  if (/^\.?[a-z0-9]{1,12}$/i.test(q) && byExt.has(normalizeExtension(q))) return "extension";
  if (/^(https?:\/\/|\/|\.\/|[a-z]:\\)/i.test(q) || /\.[a-z0-9]{1,12}(\?.*|#.*)?$/i.test(q)) return "extension";
  return "text";
}

const MAX_QUERY = 200;

/** Fuzzy search across type, aliases, extensions and description; best matches first. */
export function searchMime(query: string, limit = 40): MimeEntry[] {
  const q = query.trim().toLowerCase().slice(0, MAX_QUERY);
  if (!q) return [];
  const ext = normalizeExtension(q);
  const type = normalizeType(q);
  const words = q.split(/[\s,]+/).filter(Boolean);
  const scored: Array<{ entry: MimeEntry; score: number }> = [];
  for (const entry of MIME_TABLE) {
    let score = 0;
    const t = entry.type.toLowerCase();
    if (t === type || entry.aliases?.some((a) => a.toLowerCase() === type)) score += 100;
    else if (t.includes(q) || entry.aliases?.some((a) => a.toLowerCase().includes(q))) score += 40;
    if (ext && entry.extensions.includes(ext)) score += 90;
    else if (ext && entry.extensions.some((x) => x.startsWith(ext))) score += 20;
    const desc = entry.description.toLowerCase();
    if (desc === q) score += 80;
    else if (desc.includes(q)) score += 35;
    for (const w of words) {
      if (w.length < 2) continue;
      if (desc.includes(w)) score += 10;
      if (t.includes(w)) score += 8;
      if (entry.notes?.toLowerCase().includes(w)) score += 3;
    }
    if (entry.category === q) score += 15;
    if (score > 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.type.localeCompare(b.entry.type))
    .slice(0, limit)
    .map((s) => s.entry);
}

/** Types that are text under the hood even when not text/* and so benefit from a charset. */
function isTextual(type: string): boolean {
  const t = normalizeType(type);
  return t.startsWith("text/") || /[/+](json|xml|javascript|ecmascript|yaml|toml|graphql|x-ndjson|manifest|importmap|ld)\b/.test(t) || t === "image/svg+xml";
}

/** Ready-to-paste `Content-Type:` header. A charset is added for textual types unless one is given (JSON never needs one). */
export function contentTypeHeader(type: string, charset?: string): string {
  const t = normalizeType(type);
  if (!t) return "";
  const cs = charset?.trim();
  if (cs) return `Content-Type: ${t}; charset=${cs.toLowerCase()}`;
  if (t === "application/json" || t.endsWith("+json") || t === "application/x-ndjson") return `Content-Type: ${t}`;
  return isTextual(t) ? `Content-Type: ${t}; charset=utf-8` : `Content-Type: ${t}`;
}

/** Whether HTTP compression (gzip / brotli) is worthwhile for the type. */
export function isCompressible(type: string): boolean {
  const entry = lookupByType(type);
  if (entry?.compressible !== undefined) return entry.compressible;
  return isTextual(type);
}

export const MIME_SAMPLE = "png";

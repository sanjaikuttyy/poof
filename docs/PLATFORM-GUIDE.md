# Platform guide

Requirements checked **3 October 2026**. Poof exports static raster assets and integration files. An export is not an installed-app test or store approval. Review `report.json` and build your app with the exported files before release.

## iOS and iPadOS

Modern Xcode can derive icon sizes from one **1024 × 1024** image using the asset catalog's **Single Size** setting. Poof's compatibility catalog instead supplies individual iPhone/iPad slots and the 1024px marketing image. Use the matching catalog workflow; do not import both as competing primary icons. Select the resulting set as the target's **App Icons Source**. [Apple: configuring an app icon](https://developer.apple.com/documentation/xcode/configuring-your-app-icon).

For the default appearance, use a square opaque master; export without an alpha channel for the most conservative submission path. Do not bake rounded exterior corners into it. Pixel dimensions matter; changing DPI metadata does not add resolution. Apple's archived guidance describes PNG files without transparent regions, but predates modern appearances. [Apple: QA1686](https://developer.apple.com/library/archive/qa/qa1686/_index.html).

Poof does not author Dark or Tinted appearance slots. These are not simply alternative background colors: Apple's current guidance requests grayscale tinted art and a transparent background for the dark variant. Do not apply default-icon opacity rules to every future appearance. [Apple: appearance configuration](https://developer.apple.com/documentation/xcode/configuring-your-app-icon).

## macOS and Apple's layered icons

The conventional macOS raster set has **ten entries**: 16, 32, 128, 256 and 512 points, each at 1× and 2×. The largest bitmap is 1024px; some entries share a pixel dimension but represent different slots. Keep the macOS catalog separate from the iOS catalog. [Apple: high-resolution icon pairs](https://developer.apple.com/library/archive/documentation/GraphicsAnimation/Conceptual/HighResolutionOSX/Optimizing/Optimizing.html), [asset catalog fields](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/AppIconType.html).

These raster catalogs are **not Icon Composer documents**. They do not provide editable layers, material settings, or authored clear/dark/tinted system appearances. Poof's visual previews do not simulate Apple's renderer. For that workflow, create and inspect a layered document in [Apple Icon Composer](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer). This package does not claim watchOS, tvOS, visionOS, iMessage, or all-Apple-platform coverage.

## Android launcher and Google Play

Adaptive launcher icons use separate foreground and background layers on a **108 × 108dp** canvas. Keep essential artwork within the centered **66dp safe region**; additional area supports masking and effects. A full square constrained within a 66dp circle needs an even smaller side, `66 / √2` dp. Poof uses this conservative inset to protect composition corners; it may create substantial visual margin. Geometry safety does not guarantee a pleasing icon. [Android: adaptive icon design](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).

Adaptive resources apply from **API 26**; retain density-specific legacy fallbacks. Poof separates `mipmap-anydpi-v26` from `mipmap-anydpi-v33`, where the latter adds the **monochrome** layer. Compile with SDK 33 or newer. Themed icons depend on launcher support and user settings; Android 16 QPR 2 can also automatically theme icons without a supplied monochrome layer. A silhouette derived from an opaque upload may become a solid square: design a transparent monochrome mark when this happens. [Android: adaptive/themed behavior](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive), [API 26 introduction](https://developer.android.com/distribute/google-play/resources/icon-design-specifications).

Merge exported resources into `app/src/main/res/` and update the existing `<application>` icon attributes. Do not paste the provided application snippet as a second application element. Inspect circle, squircle, legacy and themed appearances in your application.

The **Google Play listing image is separate**: **512 × 512px**, **32-bit PNG**, **sRGB**, at most **1024KB**. Check encoded file size, not just dimensions. Export a full square without an exterior corner mask or drop shadow; Play applies those. Lighting and shadows inside the artwork are allowed. [Google Play icon specifications](https://developer.android.com/distribute/google-play/resources/icon-design-specifications).

## Web and installed web apps

Poof supplies an ICO containing **16/32/48px** images, corresponding PNGs, and an **180px apple-touch-icon**. This is a practical baseline, not a claim that every browser requires those exact sizes. Check the 16px design visually; dense fur often needs a simpler mark. Include explicit icon links in the document head. [MDN: favicons](https://developer.mozilla.org/en-US/docs/Glossary/Favicon), [MDN: head metadata and Apple touch icons](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Webpage_metadata).

The manifest includes distinct **192px and 512px** images for `purpose: "any"` and `purpose: "maskable"`. These sizes are useful defaults; the manifest standard does not prescribe one universal pair. Maskable icons need a full opaque background with critical content inside a central circle whose radius is **40% of the smaller image dimension**. Do not confuse that circle with an 80%-width square. [MDN: app icon definitions](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons), [W3C: maskable safe zone](https://www.w3.org/TR/appmanifest/#icon-masks).

Copy the web assets to your site's public directory and merge the head snippet. Merge the generated manifest with existing app settings. Icon `src` values resolve relative to the **manifest URL**; HTML link URLs resolve relative to the page or its base URL. For a subdirectory deployment, verify both sets of paths, `start_url`, and `scope`. Return images and JSON rather than an HTML fallback. [MDN: manifest icon URLs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons).

Icons alone do not make a site installable or implement offline behavior. Test the deployed site and an actual installation. When updating, use versioned asset names and update references; review your own HTTP/service-worker cache rules. If an installed app still shows an old icon, verify the served files first, then test a fresh installation. Browser and launcher caches can outlive a normal page reload.

## Before shipping

- Verify decoded pixel dimensions, opaque default masters, valid catalog/XML/manifest references, and Play's encoded byte limit.
- Inspect at small sizes, with platform masks and light/dark surroundings. A large preview is insufficient.
- Keep original artwork and transparent source layers. Upscaling does not restore missing detail.
- Build and install on the target platform. Inspect store previews separately from launcher previews.
- Retain project-specific metadata when merging files. Asset export does not publish or modify your application.

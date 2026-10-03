export function buildPrompt({
  mode = "fur",
  material = "fur",
  prompt = "",
} = {}) {
  const identity =
    mode === "mascot"
      ? "Create one collectible 3D mascot inspired by the uploaded icon. Retain its recognizable brand colors and defining visual motif. You may reinterpret its silhouette into a rounded plush character with tiny simple appendages and restrained expression. This is an intentional mascot redesign."
      : "Transform the uploaded icon into a tactile 3D version of the SAME character or symbol. Preserve its exact recognizable silhouette, proportions, colors, face placement, eye shape and spacing, mouth, and distinctive features. Do not invent a new mascot, add limbs, replace its face with generic dot eyes, add a face to a faceless symbol, or introduce extra accessories. Preserve identity above all.";
  const texture =
    material === "clay"
      ? "Use smooth matte clay with subtle soft dimensional shading and handcrafted rounded edges. No fur. No shiny plastic or metal."
      : "Use luxurious plush fur with individually readable fibers, soft poofy volume and a carefully groomed silhouette. Default to short teddy pile unless the additional art direction specifies velvet or longer shag. Keep existing facial marks clean, smooth and legible against the fuzzy body. Do not cover the eyes or alter their geometry. No spiky hair, distorted identity, generic vinyl toy, or glossy plastic.";
  return `${identity}\n${texture}\nRender one complete subject centered, front facing, entirely in frame with comfortable transparent margin. Default to soft studio lighting unless additional art direction specifies a different lighting setup. Use gentle ambient occlusion, tactile detail and coherent material response. Transparent background, no colored tile, no pedestal, no floor, no text or watermarks, no contact sheet. Deliver a single square PNG.\n${prompt ? `Additional art direction (preserve the requested identity rules): ${prompt}` : ""}`;
}
